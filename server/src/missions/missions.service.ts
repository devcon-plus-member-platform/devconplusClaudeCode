import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import type {
  Mission,
  MissionParticipant,
  MissionSubmission,
  MissionSubmissionWithDetails,
} from '../supabase/types';
import type { CreateMissionDto } from './dto/create-mission.dto';
import type { UpdateMissionDto } from './dto/update-mission.dto';
import { MissionsRepository } from './missions.repository';

export interface MemberMissionsData {
  missions: Mission[];
  participants: MissionParticipant[];
  submissions: MissionSubmission[];
}

@Injectable()
export class MissionsService {
  constructor(
    private readonly repo: MissionsRepository,
    private readonly cache: AppCacheService,
  ) {}

  // ── Member ────────────────────────────────────────────────────────────────

  async getMemberData(user: AuthenticatedUser): Promise<MemberMissionsData> {
    const [missions, participants, submissions] = await Promise.all([
      this.repo.findActiveMissions(),
      this.repo.findUserParticipants(user.profileId),
      this.repo.findUserSubmissions(user.profileId),
    ]);
    return { missions, participants, submissions };
  }

  startMission(user: AuthenticatedUser, missionId: string): Promise<MissionParticipant> {
    return this.repo.startMission(missionId, user.profileId);
  }

  async submitMission(
    user: AuthenticatedUser,
    missionId: string,
    link: string,
  ): Promise<MissionSubmission> {
    const existing = await this.repo.findExistingSubmission(missionId, user.profileId);
    if (existing) {
      return this.repo.updateSubmission(existing.id, link);
    }
    return this.repo.insertSubmission(missionId, user.profileId, link);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  // Admin list of all missions — global (not user-scoped) → shared cache key.
  getAllMissions(): Promise<Mission[]> {
    return this.cache.getOrSet(CacheKeys.MISSIONS_ADMIN_LIST, CACHE_TTL.MISSIONS, () =>
      this.repo.findAllMissions(),
    );
  }

  getAllSubmissionsAdmin(): Promise<MissionSubmissionWithDetails[]> {
    return this.repo.findAllSubmissionsAdmin();
  }

  getPendingQueue(): Promise<MissionSubmissionWithDetails[]> {
    return this.repo.findPendingQueue();
  }

  rejectSubmission(subId: string, adminRemarks: string): Promise<void> {
    return this.repo.rejectSubmission(subId, adminRemarks);
  }

  async createMission(dto: CreateMissionDto): Promise<Mission> {
    const mission = await this.repo.createMission(dto);
    await this.cache.del(CacheKeys.MISSIONS_ADMIN_LIST);
    return mission;
  }

  async updateMission(id: string, dto: UpdateMissionDto): Promise<Mission> {
    const mission = await this.repo.updateMission(id, dto);
    await this.cache.del(CacheKeys.MISSIONS_ADMIN_LIST);
    return mission;
  }

  async deleteMission(id: string): Promise<void> {
    await this.repo.deleteMission(id);
    await this.cache.del(CacheKeys.MISSIONS_ADMIN_LIST);
  }

  approveMissionWinner(subId: string): Promise<void> {
    return this.repo.approveMissionWinner(subId);
  }
}
