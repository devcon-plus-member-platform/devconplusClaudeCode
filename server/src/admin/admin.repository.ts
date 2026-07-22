import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AdminAnalytics,
  ChapterStat,
  PointTransaction,
  Profile,
  ProfileRole,
} from '../supabase/types';

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

  async findAllUsers(): Promise<Profile[]> {
    const result = await this.db
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    return this.unwrap(result as { data: Profile[] | null; error: { message: string } | null });
  }

  /**
   * Only officers/admins can create events (see the "Officers create events" RLS
   * policy), so this is a small, bounded set — safe to fetch in full for an
   * id → name lookup, unlike findAllUsers().
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (this.db as any)
      .from('event_registrations')
      .select(
        'id, status, checked_in, registered_at, event_id, form_responses, ' +
        'events(title, custom_form_schema, chapters(name)), ' +
        'profiles(full_name, email, school_or_company)',
      )
      .neq('status', 'cancelled');

    if (scope === 'event' && eventId) query = query.eq('event_id', eventId);
    if (status === 'checked_in') query = query.eq('checked_in', true);
    else if (status === 'not_checked_in') query = query.eq('checked_in', false);
    else if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new BadRequestException((error as { message: string }).message);
    return (data ?? []) as AttendanceExportRow[];
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  // KPI counts + member-growth/xp-distributed/active-chapters stay on their RPCs.
  // chapterStats (member + XP per chapter) and attendanceTrend are computed here
  // from raw tables so we can (a) include EVERY chapter — even 0-member ones — and
  // (b) exclude external events from the attendance trend. The live-DB RPCs did
  // neither, and their bodies drift from the migrations, so we own the shape here.

  // Number of most-recent completed DEVCON events to plot on the attendance trend.
  private static readonly ATTENDANCE_TREND_LIMIT = 12;

  async getAnalytics(): Promise<AdminAnalytics> {
    const nowIso = new Date().toISOString();

    const [
      membersRes,
      eventsRes,
      xpRes,
      activeChaptersRes,
      growthRes,
      chaptersRes,
      profilesRes,
      trendEventsRes,
      checkinsRes,
    ] = await Promise.all([
      this.db.from('profiles').select('*', { count: 'exact', head: true }),
      this.db.from('events').select('*', { count: 'exact', head: true }),
      this.db.rpc('get_total_xp_distributed' as never),
      this.db.rpc('get_active_chapters_count' as never),
      this.db.rpc('get_member_growth' as never),
      this.db.from('chapters').select('id, name').order('name', { ascending: true }),
      this.db.from('profiles').select('chapter_id, lifetime_points'),
      // Completed, non-external events (is_external false OR null), newest first.
      this.db
        .from('events')
        .select('id, title, event_date')
        .or('is_external.is.null,is_external.eq.false')
        .lte('event_date', nowIso)
        .order('event_date', { ascending: false })
        .limit(AdminRepository.ATTENDANCE_TREND_LIMIT),
      this.db.from('event_registrations').select('event_id').eq('checked_in', true),
    ]);

    const chapters   = (chaptersRes.data as { id: string; name: string }[] | null) ?? [];
    const profiles   = (profilesRes.data as { chapter_id: string | null; lifetime_points: number | null }[] | null) ?? [];
    const trendEvents = (trendEventsRes.data as { id: string; title: string }[] | null) ?? [];
    const checkins   = (checkinsRes.data as { event_id: string }[] | null) ?? [];

    // ── chapterStats: one row per chapter, members + XP rolled up ─────────────
    const rollup = new Map<string, { members: number; xp: number }>();
    for (const c of chapters) rollup.set(c.id, { members: 0, xp: 0 });
    for (const p of profiles) {
      if (!p.chapter_id) continue;
      const entry = rollup.get(p.chapter_id);
      if (!entry) continue; // orphaned chapter_id — skip
      entry.members += 1;
      entry.xp += p.lifetime_points ?? 0;
    }
    const chapterStats: ChapterStat[] = chapters.map((c) => ({
      chapter: c.name,
      members: rollup.get(c.id)?.members ?? 0,
      xp:      rollup.get(c.id)?.xp ?? 0,
    }));

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
      xpByChapter:     [...chapterStats].sort((a, b) => b.xp - a.xp).map(({ chapter, xp }) => ({ chapter, xp })),
      chapterStats,
      attendanceTrend,
    };
  }
}
