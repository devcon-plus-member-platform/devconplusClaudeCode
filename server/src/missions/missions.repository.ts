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

  // Returns active missions (for discovery) PLUS any inactive missions the user
  // has already started — so In Progress / Pending / Completed keep showing
  // even after an officer toggles a mission off.
  async findMissionsForUser(userId: string): Promise<Mission[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [activeResult, partResult] = await Promise.all([
      (this.db as any)
        .from('missions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50),
      this.db
        .from('mission_participants')
        .select('mission_id')
        .eq('user_id', userId),
    ]);

    if (activeResult.error) {
      throw new BadRequestException((activeResult.error as { message: string }).message);
    }
    const active = (activeResult.data ?? []) as Mission[];

    // IDs the user participated in that are NOT already in the active set
    const activeIdSet = new Set(active.map((m: Mission) => m.id));
    const missingIds = ((partResult.data ?? []) as { mission_id: string }[])
      .map((p) => p.mission_id)
      .filter((id) => !activeIdSet.has(id));

    if (missingIds.length === 0) return active;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inactiveResult = await (this.db as any)
      .from('missions')
      .select('*')
      .in('id', missingIds);
    const inactive = (inactiveResult.data ?? []) as Mission[];

    return [...active, ...inactive];
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
      .update({
        pr_link: link,
        submitted_at: new Date().toISOString(),
        // Reset to pending on resubmit so the admin queue picks it up again.
        // Also clears any previous rejection_reason.
        status: 'pending',
        rejection_reason: null,
      })
      .eq('id', subId)
      .select()
      .single();
    return this.unwrap(
      result as { data: MissionSubmission | null; error: { message: string } | null },
    );
  }

  async findMissionById(id: string): Promise<Mission | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (this.db as any)
      .from('missions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return (data ?? null) as Mission | null;
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
        id:               (row.id ?? '') as string,
        mission_id:       (row.mission_id ?? '') as string,
        user_id:          (row.user_id ?? '') as string,
        pr_link:          (row.pr_link ?? null) as string | null,
        status:           (row.status ?? 'pending') as MissionSubmission['status'],
        rejection_reason: (row.rejection_reason ?? null) as string | null,
        submitted_at:     (row.submitted_at ?? null) as string | null,
        mission_title:    mObj?.title ?? 'Unknown Mission',
        member_name:      pObj?.full_name ?? 'Unknown',
        member_email:     pObj?.email ?? '',
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

  async approveMissionSubmission(subId: string): Promise<void> {
    const { error } = await this.db.rpc('approve_mission_submission' as never, {
      sub_id: subId,
    } as never);
    if (error) throw new BadRequestException(error.message);
  }

  async rejectMissionSubmission(subId: string, reason?: string): Promise<void> {
    const { error } = await this.db.rpc('reject_mission_submission' as never, {
      sub_id: subId,
      p_reason: reason ?? null,
    } as never);
    if (error) throw new BadRequestException(error.message);
  }
}
