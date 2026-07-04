import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  Mission,
  MissionParticipant,
  MissionSubmission,
  MissionSubmissionWithDetails,
} from '../supabase/types';
import type { CreateMissionDto } from './dto/create-mission.dto';
import type { UpdateMissionDto } from './dto/update-mission.dto';

@Injectable()
export class MissionsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  // ── Member reads ──────────────────────────────────────────────────────────

  async findActiveMissions(): Promise<Mission[]> {
    // Embed global aggregate counts over the mission_participants / mission_submissions
    // FKs. Service-role bypasses RLS, so these are true totals across all members — the
    // member endpoint only returns the caller's own participant/submission rows, so the
    // frontend cannot compute these counts itself (it would cap at 1).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('missions')
      .select('*, mission_participants(count), mission_submissions(count)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50);

    // Resilience: if the embedded-count query fails (e.g. FK relationship missing due to
    // live-DB drift), fall back to a plain read so the missions feed still works — the
    // counts just render from the frontend's per-user fallback rather than 400-ing the feed.
    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fallback = await (this.db as any)
        .from('missions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50);
      return this.unwrap(
        fallback as { data: Mission[] | null; error: { message: string } | null },
      );
    }

    return (data ?? []).map((row: Record<string, unknown>) => {
      const {
        mission_participants: p,
        mission_submissions: s,
        ...rest
      } = row as Record<string, unknown> & {
        mission_participants?: Array<{ count?: number }>;
        mission_submissions?: Array<{ count?: number }>;
      };
      return {
        ...(rest as unknown as Mission),
        participant_count: p?.[0]?.count ?? 0,
        submission_count: s?.[0]?.count ?? 0,
      } as Mission;
    });
  }

  async findUserParticipants(userId: string): Promise<MissionParticipant[]> {
    const result = await this.db
      .from('mission_participants')
      .select('*')
      .eq('user_id', userId)
      .limit(100);
    return this.unwrap(
      result as { data: MissionParticipant[] | null; error: { message: string } | null },
    );
  }

  async findUserSubmissions(userId: string): Promise<MissionSubmission[]> {
    const result = await this.db
      .from('mission_submissions')
      .select('*')
      .eq('user_id', userId)
      .limit(100);
    return this.unwrap(
      result as { data: MissionSubmission[] | null; error: { message: string } | null },
    );
  }

  // ── Member writes ─────────────────────────────────────────────────────────

  async startMission(missionId: string, userId: string): Promise<MissionParticipant> {
    const result = await this.db
      .from('mission_participants')
      .insert({ mission_id: missionId, user_id: userId })
      .select()
      .single();
    return this.unwrap(
      result as { data: MissionParticipant | null; error: { message: string } | null },
    );
  }

  async findExistingSubmission(
    missionId: string,
    userId: string,
  ): Promise<MissionSubmission | null> {
    const { data } = await this.db
      .from('mission_submissions')
      .select('*')
      .eq('mission_id', missionId)
      .eq('user_id', userId)
      .maybeSingle();
    return (data ?? null) as MissionSubmission | null;
  }

  async insertSubmission(
    missionId: string,
    userId: string,
    link: string,
  ): Promise<MissionSubmission> {
    const result = await this.db
      .from('mission_submissions')
      .insert({ mission_id: missionId, user_id: userId, pr_link: link })
      .select()
      .single();
    return this.unwrap(
      result as { data: MissionSubmission | null; error: { message: string } | null },
    );
  }

  async updateSubmission(subId: string, link: string): Promise<MissionSubmission> {
    const result = await this.db
      .from('mission_submissions')
      .update({ pr_link: link, submitted_at: new Date().toISOString() })
      .eq('id', subId)
      .select()
      .single();
    return this.unwrap(
      result as { data: MissionSubmission | null; error: { message: string } | null },
    );
  }

  // ── Admin reads ───────────────────────────────────────────────────────────

  async findAllMissions(): Promise<Mission[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.db as any)
      .from('missions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200); // guardrail — admin-seeded table; never expected to exceed this
    return this.unwrap(
      result as { data: Mission[] | null; error: { message: string } | null },
    );
  }

  async findAllSubmissionsAdmin(): Promise<MissionSubmissionWithDetails[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('mission_submissions')
      .select('*, missions:mission_id(title, xp_reward), profiles:user_id(full_name, email, spendable_points, lifetime_points)')
      .order('submitted_at', { ascending: false })
      .limit(500);

    if (error) throw new BadRequestException((error as { message: string }).message);

    return (data ?? []).map((row: Record<string, unknown>) => {
      const m = Array.isArray(row.missions) ? (row.missions as unknown[])[0] : row.missions;
      const p = Array.isArray(row.profiles) ? (row.profiles as unknown[])[0] : row.profiles;
      const mObj = m as { title?: string; xp_reward?: number } | null;
      const pObj = p as { full_name?: string; email?: string; spendable_points?: number; lifetime_points?: number } | null;
      return {
        id:               (row.id ?? '') as string,
        mission_id:       (row.mission_id ?? '') as string,
        user_id:          (row.user_id ?? '') as string,
        pr_link:          (row.pr_link ?? null) as string | null,
        status:           (row.status ?? 'pending') as MissionSubmissionWithDetails['status'],
        submitted_at:     (row.submitted_at ?? null) as string | null,
        admin_remarks:    (row.admin_remarks ?? null) as string | null,
        reviewed_at:      (row.reviewed_at ?? null) as string | null,
        mission_title:    mObj?.title ?? 'Unknown Mission',
        xp_reward:        mObj?.xp_reward ?? 0,
        member_name:      pObj?.full_name ?? 'Unknown',
        member_email:     pObj?.email ?? '',
        spendable_points: pObj?.spendable_points ?? 0,
        lifetime_points:  pObj?.lifetime_points ?? 0,
      } satisfies MissionSubmissionWithDetails;
    });
  }

  async findPendingQueue(): Promise<MissionSubmissionWithDetails[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('mission_submissions')
      .select('*, missions:mission_id(title), profiles:user_id(full_name, email)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true });

    if (error) throw new BadRequestException((error as { message: string }).message);

    return (data ?? []).map((row: Record<string, unknown>) => {
      const m = Array.isArray(row.missions) ? (row.missions as unknown[])[0] : row.missions;
      const p = Array.isArray(row.profiles) ? (row.profiles as unknown[])[0] : row.profiles;
      const mObj = m as { title?: string } | null;
      const pObj = p as { full_name?: string; email?: string } | null;
      return {
        id:            (row.id ?? '') as string,
        mission_id:    (row.mission_id ?? '') as string,
        user_id:       (row.user_id ?? '') as string,
        pr_link:       (row.pr_link ?? null) as string | null,
        status:        (row.status ?? 'pending') as MissionSubmission['status'],
        submitted_at:  (row.submitted_at ?? null) as string | null,
        mission_title: mObj?.title ?? 'Unknown Mission',
        member_name:   pObj?.full_name ?? 'Unknown',
        member_email:  pObj?.email ?? '',
      } satisfies MissionSubmissionWithDetails;
    });
  }

  // ── Admin writes ──────────────────────────────────────────────────────────

  async createMission(dto: CreateMissionDto): Promise<Mission> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.db as any)
      .from('missions')
      .insert({ ...dto, is_active: dto.is_active ?? true })
      .select()
      .single();
    return this.unwrap(
      result as { data: Mission | null; error: { message: string } | null },
    );
  }

  async updateMission(id: string, dto: UpdateMissionDto): Promise<Mission> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.db as any)
      .from('missions')
      .update(dto as Record<string, unknown>)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(
      result as { data: Mission | null; error: { message: string } | null },
    );
  }

  async deleteMission(id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.db as any).from('missions').delete().eq('id', id);
    if (error) throw new BadRequestException((error as { message: string }).message);
  }

  async approveMissionWinner(subId: string): Promise<void> {
    const { error } = await this.db.rpc('approve_mission_winner' as never, {
      sub_id: subId,
    } as never);
    if (error) throw new BadRequestException(error.message);
  }

  async rejectSubmission(subId: string, adminRemarks: string): Promise<void> {
    const { error } = await this.db.rpc('reject_mission_submission' as never, {
      p_submission_id: subId,
      p_admin_remarks: adminRemarks,
    } as never);
    if (error) throw new BadRequestException(error.message);
  }
}
