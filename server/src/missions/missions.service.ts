import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
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
  constructor(private readonly repo: MissionsRepository) {}

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

  getAllMissions(): Promise<Mission[]> {
    return this.repo.findAllMissions();
  }

  getPendingQueue(): Promise<MissionSubmissionWithDetails[]> {
    return this.repo.findPendingQueue();
  }

  createMission(dto: CreateMissionDto): Promise<Mission> {
    return this.repo.createMission(dto);
  }

  updateMission(id: string, dto: UpdateMissionDto): Promise<Mission> {
    return this.repo.updateMission(id, dto);
  }

  deleteMission(id: string): Promise<void> {
    return this.repo.deleteMission(id);
  }

  approveMissionWinner(subId: string): Promise<void> {
    return this.repo.approveMissionWinner(subId);
  }
}
