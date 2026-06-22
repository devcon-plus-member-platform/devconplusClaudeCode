import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  AdminAnalytics,
  PointTransaction,
  Profile,
  ProfileRole,
} from '../supabase/types';

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

  // ── Analytics (all 7 queries run in parallel) ─────────────────────────────

  async getAnalytics(): Promise<AdminAnalytics> {
    const [
      membersRes,
      eventsRes,
      xpRes,
      chaptersRes,
      growthRes,
      xpChapterRes,
      attendanceRes,
    ] = await Promise.all([
      this.db.from('profiles').select('*', { count: 'exact', head: true }),
      this.db.from('events').select('*', { count: 'exact', head: true }),
      this.db.rpc('get_total_xp_distributed' as never),
      this.db.rpc('get_active_chapters_count' as never),
      this.db.rpc('get_member_growth' as never),
      this.db.rpc('get_xp_by_chapter' as never),
      this.db.rpc('get_attendance_trend' as never),
    ]);

    return {
      totalMembers:    membersRes.count ?? 0,
      totalEvents:     eventsRes.count ?? 0,
      xpDistributed:   (xpRes.data as number | null) ?? 0,
      activeChapters:  (chaptersRes.data as number | null) ?? 0,
      memberGrowth:    (growthRes.data as { month: string; count: number }[] | null) ?? [],
      xpByChapter:     (xpChapterRes.data as { chapter: string; xp: number }[] | null) ?? [],
      attendanceTrend: (attendanceRes.data as { event: string; attendance: number }[] | null) ?? [],
    };
  }
}
