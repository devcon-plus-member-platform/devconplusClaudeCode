import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AdminAnalytics,
  ChapterStat,
  PointTransaction,
  Profile,
  ProfileRole,
} from '../supabase/types';

/** Sortable columns on the admin Users table, as sent by the frontend. */
export type UserSortColumn = 'name' | 'email' | 'role' | 'points';

export interface FindUsersParams {
  search?: string;
  role?: ProfileRole;
  sort?: UserSortColumn;
  dir?: 'asc' | 'desc';
  /** 1-based page number. Ignored when pageSize is undefined. */
  page?: number;
  /** Omit to return every matching row (paged through internally). */
  pageSize?: number;
}

/** Per-role profile totals for the Users tab filter pills. */
export type UserRoleCounts = Record<'all' | ProfileRole, number>;

/** Raw shape returned by findAttendanceExport — mirrors the joined Postgrest response 1:1. */
export interface AttendanceExportRow {
  id?: string;
  status?: string | null;
  checked_in?: boolean | null;
  registered_at?: string | null;
  event_id?: string;
  form_responses?: Record<string, unknown> | null;
  events?: {
    title?: string;
    custom_form_schema?: unknown;
    chapters?: { name?: string } | null;
  } | null;
  profiles?: {
    full_name?: string;
    email?: string;
    school_or_company?: string;
  } | null;
}

@Injectable()
export class AdminRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  private static readonly ALL_ROLES: ProfileRole[] = [
    'member',
    'chapter_officer',
    'hq_admin',
    'super_admin',
  ];

  /** Frontend sort key → profiles column. */
  private static readonly USER_SORT_COLUMNS: Record<UserSortColumn, string> = {
    name:   'full_name',
    email:  'email',
    role:   'role',
    points: 'spendable_points',
  };

  /**
   * Escapes a search term for use as a value inside a PostgREST `.or()` filter.
   * Commas and parentheses are filter *syntax* there, so an unquoted term
   * containing them corrupts the whole expression (or 400s). Double-quoting the
   * value fixes that, once embedded quotes/backslashes are escaped.
   */
  private static quoteSearch(term: string): string {
    return `"%${term.replace(/[\\"]/g, (c) => `\\${c}`)}%"`;
  }

  /** Shared WHERE clause for both the row window and its total count. */
  private buildUserQuery(search?: string, role?: ProfileRole) {
    let query = this.db.from('profiles').select('*', { count: 'exact' });
    if (role) query = query.eq('role', role);
    const term = search?.trim();
    if (term) {
      const value = AdminRepository.quoteSearch(term);
      query = query.or(
        `full_name.ilike.${value},email.ilike.${value},school_or_company.ilike.${value}`,
      );
    }
    return query;
  }

  /**
   * One page of profiles matching the Users tab's search / role filter / sort,
   * plus the total number of matches (which is what the table paginates on —
   * NOT the length of the returned array).
   *
   * Sorting and filtering are done in Postgres rather than in the browser
   * because the browser only ever sees one page. Note that sorting by `role`
   * orders alphabetically (chapter_officer → hq_admin → member → super_admin),
   * not by privilege rank: PostgREST cannot ORDER BY a CASE expression, and a
   * rank would need a generated column.
   *
   * Ordering always ends with `created_at DESC, id ASC`: the default (no active
   * sort column) is newest-first, and so is every tie under another column —
   * Role has only 4 distinct values and Points plenty of duplicates, so without
   * that fallback tied rows would come back in UUID order. `id` goes last purely
   * for determinism: Postgres gives no stable order for fully tied rows, and an
   * unstable one lets a member appear on two pages, or on none.
   */
  async findUsers(params: FindUsersParams): Promise<{ rows: Profile[]; total: number }> {
    const { search, role, sort, dir = 'asc', page = 1, pageSize } = params;
    const column = sort ? AdminRepository.USER_SORT_COLUMNS[sort] : 'created_at';
    // With no active sort column the table rests newest-first.
    const ascending = sort ? dir !== 'desc' : false;

    const ordered = (from: number, to: number) => {
      let query = this.buildUserQuery(search, role).order(column, { ascending });
      if (column !== 'created_at') query = query.order('created_at', { ascending: false });
      return query.order('id', { ascending: true }).range(from, to);
    };

    // No pageSize → caller wants every match (e.g. the Chapter Officers page).
    // Page through it so the response is never silently capped at max-rows.
    if (!pageSize) {
      const rows = await this.fetchAllPages<Profile>(ordered);
      return { rows, total: rows.length };
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await ordered(from, from + pageSize - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { rows: (data ?? []) as Profile[], total: count ?? 0 };
  }

  /**
   * Exact profile totals overall and per role, counted by Postgres.
   *
   * These drive the filter pills, which previously tallied the fetched array —
   * so they under-reported every role once the list hit the 1000-row cap, and
   * lost the earliest-created accounts (super_admins among them) entirely.
   */
  async countUsersByRole(): Promise<UserRoleCounts> {
    const roles = AdminRepository.ALL_ROLES;
    const [allRes, ...perRole] = await Promise.all([
      this.db.from('profiles').select('*', { count: 'exact', head: true }),
      ...roles.map((r) =>
        this.db.from('profiles').select('*', { count: 'exact', head: true }).eq('role', r),
      ),
    ]);
    const counts = { all: allRes.count ?? 0 } as UserRoleCounts;
    roles.forEach((r, i) => {
      counts[r] = perRole[i].count ?? 0;
    });
    return counts;
  }

  /**
   * Only officers/admins can create events (see the "Officers create events" RLS
   * policy), so this is a small, bounded set — safe to fetch in full for an
   * id → name lookup, unlike findUsers().
   */
  async findEventCreators(): Promise<Array<{ id: string; full_name: string }>> {
    const result = await this.db
      .from('profiles')
      .select('id, full_name')
      .in('role', ['chapter_officer', 'hq_admin', 'super_admin']);
    return this.unwrap(
      result as {
        data: Array<{ id: string; full_name: string }> | null;
        error: { message: string } | null;
      },
    );
  }

  async findUserTransactions(userId: string, limit = 5): Promise<PointTransaction[]> {
    const result = await this.db
      .from('point_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return this.unwrap(
      result as { data: PointTransaction[] | null; error: { message: string } | null },
    );
  }

  async updateUserRole(userId: string, role: ProfileRole): Promise<void> {
    const { error } = await this.db.rpc('admin_update_user_role' as never, {
      p_user_id:  userId,
      p_new_role: role,
    } as never);
    if (error) throw new BadRequestException(error.message);
  }

  /** Records a chapter-officer assignment for an email (applied on the user's sign-up). */
  async assignOfficerEmail(email: string, chapterId: string): Promise<void> {
    const { error } = await this.db.rpc('assign_officer_email' as never, {
      p_email:      email,
      p_chapter_id: chapterId,
    } as never);
    if (error) throw new BadRequestException(error.message);
  }

  /** Look up a profile's current role by id (for role-escalation authorization checks). */
  async findRoleById(profileId: string): Promise<ProfileRole | null> {
    const { data, error } = await this.db
      .from('profiles')
      .select('role')
      .eq('id', profileId)
      .maybeSingle();
    if (error) return null;
    return (data?.role as ProfileRole | null) ?? null;
  }

  /** Look up a profile's Firebase auth_uid by profile id (for cache invalidation). */
  async getAuthUidById(profileId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('profiles')
      .select('auth_uid')
      .eq('id', profileId)
      .maybeSingle();
    if (error) return null;
    return (data?.auth_uid as string | null) ?? null;
  }

  /** Look up a chapter's display name by id (for the officer invite email). */
  async findChapterName(chapterId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('chapters')
      .select('name')
      .eq('id', chapterId)
      .maybeSingle();
    if (error) return null;
    return (data?.name as string | null) ?? null;
  }

  /**
   * Raw registrations joined with event/chapter/profile info, for the admin
   * attendance CSV export. Service-role — bypasses RLS. Replaces a direct
   * browser-side Supabase read: chapter_officer/hq_admin callers have no RLS
   * policy granting them read access to other members' `profiles` rows, so
   * that read silently came back with the joined profile blank for anyone
   * but the row owner or (via `is_admin()`) an admin — inconsistent with who
   * the frontend actually shows the export button to.
   */
  async findAttendanceExport(params: {
    scope: 'all' | 'event';
    eventId?: string;
    status?: 'all' | 'approved' | 'pending' | 'rejected' | 'checked_in' | 'not_checked_in';
  }): Promise<AttendanceExportRow[]> {
    const { scope, eventId, status } = params;
    if (scope === 'event' && !eventId) return [];

    const buildQuery = (from: number, to: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (this.db as any)
        .from('event_registrations')
        .select(
          'id, status, checked_in, registered_at, event_id, form_responses, ' +
          'events(title, custom_form_schema, chapters(name)), ' +
          'profiles(full_name, email, school_or_company)',
          { count: 'exact' },
        )
        .neq('status', 'cancelled');

      if (scope === 'event' && eventId) query = query.eq('event_id', eventId);
      if (status === 'checked_in') query = query.eq('checked_in', true);
      else if (status === 'not_checked_in') query = query.eq('checked_in', false);
      else if (status && status !== 'all') query = query.eq('status', status);

      // Paged: an "export everything" query is exactly the one that trips the
      // max-rows cap, and a CSV silently missing rows is worse than a slow one.
      return query.order('id', { ascending: true }).range(from, to);
    };

    return this.fetchAllPages<AttendanceExportRow>(buildQuery);
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  // KPI counts + member-growth/xp-distributed/active-chapters stay on their RPCs.
  // chapterStats (member + XP per chapter) and attendanceTrend are computed here
  // from raw tables so we can (a) include EVERY chapter — even 0-member ones — and
  // (b) exclude external events from the attendance trend. The live-DB RPCs did
  // neither, and their bodies drift from the migrations, so we own the shape here.

  // Number of most-recent completed DEVCON events to plot on the attendance trend.
  private static readonly ATTENDANCE_TREND_LIMIT = 12;

  /** Bar label for members with no chapter_id (or one pointing at a deleted chapter). */
  private static readonly UNASSIGNED_LABEL = 'Unassigned';

  async getAnalytics(): Promise<AdminAnalytics> {
    const nowIso = new Date().toISOString();

    const [
      membersRes,
      eventsRes,
      xpRes,
      activeChaptersRes,
      growthRes,
      chaptersRes,
      profiles,
      trendEventsRes,
      checkins,
    ] = await Promise.all([
      this.db.from('profiles').select('*', { count: 'exact', head: true }),
      this.db.from('events').select('*', { count: 'exact', head: true }),
      this.db.rpc('get_total_xp_distributed' as never),
      this.db.rpc('get_active_chapters_count' as never),
      this.db.rpc('get_member_growth' as never),
      this.db.from('chapters').select('id, name').order('name', { ascending: true }),
      // Paged: a plain select stops at max-rows, which made the per-chapter
      // member/XP rollup disagree with the totalMembers count above it.
      this.fetchAllPages<{ chapter_id: string | null; lifetime_points: number | null }>(
        (from, to) =>
          this.db
            .from('profiles')
            .select('chapter_id, lifetime_points', { count: 'exact' })
            .order('id', { ascending: true })
            .range(from, to),
      ),
      // Completed, non-external events (is_external false OR null), newest first.
      this.db
        .from('events')
        .select('id, title, event_date')
        .or('is_external.is.null,is_external.eq.false')
        .lte('event_date', nowIso)
        .order('event_date', { ascending: false })
        .limit(AdminRepository.ATTENDANCE_TREND_LIMIT),
      // Paged for the same reason — check-ins across all events outgrow max-rows
      // long before profiles do, which would flatten the attendance trend.
      this.fetchAllPages<{ event_id: string }>((from, to) =>
        this.db
          .from('event_registrations')
          .select('event_id', { count: 'exact' })
          .eq('checked_in', true)
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ]);

    const chapters   = (chaptersRes.data as { id: string; name: string }[] | null) ?? [];
    const trendEvents = (trendEventsRes.data as { id: string; title: string }[] | null) ?? [];

    // ── chapterStats: one row per chapter, members + XP rolled up ─────────────
    // Members with no chapter (or an orphaned chapter_id) used to be dropped
    // silently, so the bars could never sum to xpDistributed. They now land in a
    // synthetic "Unassigned" bucket instead, appended only when it is non-empty.
    const rollup = new Map<string, { members: number; xp: number }>();
    for (const c of chapters) rollup.set(c.id, { members: 0, xp: 0 });
    const unassigned = { members: 0, xp: 0 };
    for (const p of profiles) {
      const entry = p.chapter_id ? rollup.get(p.chapter_id) : undefined;
      const bucket = entry ?? unassigned; // no chapter, or chapter row is gone
      bucket.members += 1;
      bucket.xp += p.lifetime_points ?? 0;
    }
    const chapterStats: ChapterStat[] = chapters.map((c) => ({
      chapter: c.name,
      members: rollup.get(c.id)?.members ?? 0,
      xp:      rollup.get(c.id)?.xp ?? 0,
    }));
    // xpByChapter is the back-compat field and stays real-chapters-only; the
    // bucket is appended afterwards so only the chart picks it up.
    const xpByChapter = [...chapterStats]
      .sort((a, b) => b.xp - a.xp)
      .map(({ chapter, xp }) => ({ chapter, xp }));
    if (unassigned.members > 0 || unassigned.xp > 0) {
      chapterStats.push({
        chapter:  AdminRepository.UNASSIGNED_LABEL,
        members:  unassigned.members,
        xp:       unassigned.xp,
        isUnassigned: true,
      });
    }

    // ── attendanceTrend: checked-in count per completed DEVCON event ──────────
    const attendanceByEvent = new Map<string, number>();
    for (const r of checkins) {
      attendanceByEvent.set(r.event_id, (attendanceByEvent.get(r.event_id) ?? 0) + 1);
    }
    // trendEvents is newest-first; reverse for a left-to-right chronological line.
    const attendanceTrend = [...trendEvents].reverse().map((e) => ({
      event:      e.title,
      attendance: attendanceByEvent.get(e.id) ?? 0,
    }));

    return {
      totalMembers:    membersRes.count ?? 0,
      totalEvents:     eventsRes.count ?? 0,
      xpDistributed:   (xpRes.data as number | null) ?? 0,
      activeChapters:  (activeChaptersRes.data as number | null) ?? 0,
      memberGrowth:    (growthRes.data as { month: string; count: number }[] | null) ?? [],
      xpByChapter,
      chapterStats,
      attendanceTrend,
    };
  }
}
