import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Event } from '../supabase/types';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type { EventListScope } from './dto/list-events-query.dto';
import { EVENT_LIST_COLUMNS, type EventListItem, type Paginated } from './event-list.fields';

/** PostgREST's "Requested range not satisfiable": the offset is past the last row. */
const RANGE_NOT_SATISFIABLE = 'PGRST103';

interface PageResult<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
  count: number | null;
}

@Injectable()
export class EventsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  /**
   * One page of the public event list plus the total match count.
   *
   * Ordering is stable across pages: event_date, then id as a tiebreak, so
   * events sharing a date (or TBA, with no date) never jump between pages.
   * Only EVENT_LIST_COLUMNS are selected — never select('*').
   */
  async findPage(
    params: { scope: EventListScope; limit: number; offset: number },
    now: Date = new Date(),
  ): Promise<Paginated<EventListItem>> {
    const { scope, limit, offset } = params;
    const build = (columns: string, head: boolean) => {
      let query = this.db.from('events').select(columns, { count: 'exact', head });
      // Same rule as isEventArchived() on the web: an event has ended once its
      // end_date (or event_date when there is no end_date) is in the past.
      // Undated (TBA) events have not ended. The timestamp is quoted because
      // it contains PostgREST's reserved "." and ":" characters.
      const at = `"${now.toISOString()}"`;
      if (scope === 'upcoming') {
        query = query.or(
          `end_date.gte.${at},and(end_date.is.null,event_date.gte.${at}),and(end_date.is.null,event_date.is.null)`,
        );
      } else if (scope === 'past') {
        query = query.or(`end_date.lt.${at},and(end_date.is.null,event_date.lt.${at})`);
      }
      return query;
    };

    // upcoming: soonest first. past + all: newest first. TBA (null date) first either way.
    const ascending = scope === 'upcoming';
    const result = (await build(EVENT_LIST_COLUMNS, false)
      .order('event_date', { ascending, nullsFirst: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)) as unknown as PageResult<EventListItem>;

    return this.toPage(result, async () => {
      const head = (await build('id', true)) as unknown as PageResult<never>;
      return head.count;
    });
  }

  /**
   * One page of full event rows for the organizer/admin screens, which need
   * every column (edit forms, tables, CSV export). `chapterId` scopes the page
   * to one chapter; `null` means every event (admins).
   */
  async findManagePage(
    params: { limit: number; offset: number },
    chapterId: string | null,
  ): Promise<Paginated<Event>> {
    const { limit, offset } = params;
    const build = (columns: string, head: boolean) => {
      const query = this.db.from('events').select(columns, { count: 'exact', head });
      return chapterId ? query.eq('chapter_id', chapterId) : query;
    };

    const result = (await build('*', false)
      .order('event_date', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)) as unknown as PageResult<Event>;

    return this.toPage(result, async () => {
      const head = (await build('id', true)) as unknown as PageResult<never>;
      return head.count;
    });
  }

  /**
   * Turns a ranged query result into { rows, total }. An offset past the last
   * row makes PostgREST answer PGRST103 instead of an empty page; treat that as
   * an empty page and re-count, so a client paging after rows were deleted
   * still learns the real total.
   */
  private async toPage<T>(
    result: PageResult<T>,
    recount: () => Promise<number | null>,
  ): Promise<Paginated<T>> {
    if (result.error) {
      if (result.error.code === RANGE_NOT_SATISFIABLE) {
        return { rows: [], total: (await recount()) ?? 0 };
      }
      throw new InternalServerErrorException(result.error.message);
    }
    return { rows: result.data ?? [], total: result.count ?? 0 };
  }

  /**
   * @deprecated Legacy GET /events response (a plain array of every event, full
   * rows) for app versions released before pagination — open tabs and installed
   * PWAs keep running the old bundle until they reload. Remove once those are gone.
   */
  async findAllLegacy(): Promise<Event[]> {
    return this.fetchAllPages<Event>(
      (from, to) =>
        this.db
          .from('events')
          .select('*', { count: 'exact' })
          .order('event_date', { ascending: true, nullsFirst: true })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: Event[] | null;
          error: { message: string } | null;
          count: number | null;
        }>,
    );
  }

  async findBySlug(slug: string): Promise<Event | null> {
    const result = await this.db
      .from('events')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    return this.unwrapMaybe(
      result as { data: Event | null; error: { message: string } | null },
    );
  }

  /**
   * Anonymize a full name to "first name + last-name initial" (e.g. "Juan Dela
   * Cruz" → "Juan D.") for the public raffle wheel, so full surnames never leave
   * the server. Single-token names are returned as-is; blanks fall back to "Unknown".
   */
  private privatizeName(full: string | null | undefined): string {
    const tokens = (full ?? '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return 'Unknown';
    if (tokens.length === 1) return tokens[0];
    const lastInitial = tokens[tokens.length - 1][0]?.toUpperCase() ?? '';
    return `${tokens[0]} ${lastInitial}.`;
  }

  /**
   * Public participant list for the raffle wheel: anonymized names + status +
   * checked_in only. Deliberately omits email / school and shows only a
   * first-name + last-initial display name so it is safe to expose post-gate.
   */
  async findParticipants(
    eventId: string,
  ): Promise<Array<{ name: string; checked_in: boolean; status: string }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('event_registrations')
      .select('status, checked_in, profiles(full_name)')
      .eq('event_id', eventId)
      .neq('status', 'cancelled');
    if (error) throw new BadRequestException((error as { message: string }).message);
    return (data ?? []).map((row: Record<string, unknown>) => {
      const p = Array.isArray(row.profiles) ? (row.profiles as unknown[])[0] : row.profiles;
      const pObj = p as { full_name?: string } | null;
      return {
        name: this.privatizeName(pObj?.full_name),
        checked_in: Boolean(row.checked_in),
        status: (row.status ?? 'pending') as string,
      };
    });
  }

  /**
   * The set of acceptable lowercased email local-parts (the part before "@") that
   * unlock an event's raffle wheel: the event creator's email, plus every
   * hq_admin / super_admin email as a fallback + master override. Emails never
   * leave the server — only the caller-supplied password is compared against these.
   */
  async findWheelAccessLocalParts(eventId: string): Promise<string[]> {
    const localPart = (email: string | null | undefined): string | null => {
      const lp = (email ?? '').split('@')[0]?.trim().toLowerCase();
      return lp ? lp : null;
    };

    const emails: Array<string | null | undefined> = [];

    // Event creator's email.
    const eventRes = await this.db
      .from('events')
      .select('created_by')
      .eq('id', eventId)
      .single();
    const createdBy = (eventRes.data as { created_by?: string | null } | null)?.created_by;
    if (createdBy) {
      const creatorRes = await this.db
        .from('profiles')
        .select('email')
        .eq('id', createdBy)
        .single();
      emails.push((creatorRes.data as { email?: string | null } | null)?.email);
    }

    // hq_admin / super_admin emails — fallback + master override.
    const adminsRes = await this.db
      .from('profiles')
      .select('email')
      .in('role', ['hq_admin', 'super_admin']);
    for (const row of (adminsRes.data ?? []) as Array<{ email?: string | null }>) {
      emails.push(row.email);
    }

    const parts = emails
      .map(localPart)
      .filter((p): p is string => p !== null);
    return [...new Set(parts)];
  }

  async findById(id: string): Promise<Event | null> {
    const result = await this.db
      .from('events')
      .select('*')
      .eq('id', id)
      .single();
    return this.unwrapMaybe(
      result as { data: Event | null; error: { message: string } | null },
    );
  }

  /** Live registration-count snapshot for the capacity endpoint. */
  async findCapacitySummary(eventId: string): Promise<{
    capacity: number | null;
    no_show_buffer: number;
    approved_count: number;
    pending_count: number;
  } | null> {
    const eventRes = await this.db
      .from('events')
      .select('capacity, no_show_buffer')
      .eq('id', eventId)
      .maybeSingle();
    if (!eventRes.data) return null;
    const event = eventRes.data as { capacity: number | null; no_show_buffer: number };

    const { data, error } = await this.db
      .from('event_registrations')
      .select('status')
      .eq('event_id', eventId)
      .in('status', ['approved', 'pending']);
    if (error) throw new BadRequestException((error as { message: string }).message);

    const counts = { approved_count: 0, pending_count: 0 };
    for (const row of (data ?? []) as Array<{ status: string }>) {
      if (row.status === 'approved') counts.approved_count += 1;
      else if (row.status === 'pending') counts.pending_count += 1;
    }

    return {
      capacity: event.capacity,
      no_show_buffer: event.no_show_buffer,
      ...counts,
    };
  }

  async create(
    dto: CreateEventDto & {
      id: string;
      slug: string;
      chapter_id: string | null;
      created_by: string;
      status?: string | null;
      is_featured?: boolean | null;
      is_promoted?: boolean | null;
    },
  ): Promise<Event> {
    const result = await this.db
      .from('events')
      .insert([dto])
      .select()
      .single();
    return this.unwrap(
      result as { data: Event | null; error: { message: string } | null },
    );
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    const result = await this.db
      .from('events')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(
      result as { data: Event | null; error: { message: string } | null },
    );
  }

  async deleteWithCascade(id: string): Promise<void> {
    // Delete registrations first to avoid FK constraint violation.
    await this.db.from('event_registrations').delete().eq('event_id', id);
    const { error } = await this.db.from('events').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }
}
