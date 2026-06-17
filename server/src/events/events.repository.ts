import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Event } from '../supabase/types';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findAll(): Promise<Event[]> {
    const result = await this.db
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
      .limit(100);
    return this.unwrap(
      result as { data: Event[] | null; error: { message: string } | null },
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

  async create(
    dto: CreateEventDto & {
      chapter_id: string;
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
