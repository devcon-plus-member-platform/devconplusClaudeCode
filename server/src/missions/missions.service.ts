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
      this.repo.findMissionsForUser(user.profileId),
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
    const [existing, mission] = await Promise.all([
      this.repo.findExistingSubmission(missionId, user.profileId),
      this.repo.findMissionById(missionId),
    ]);

    // Link-type missions auto-approve and are one-shot. If this user already has an
    // approved submission, return it as-is — re-running would reset it to pending and
    // re-award XP (double-award). Guarded here because updateSubmission resets status.
    if (mission?.submission_type === 'link' && existing?.status === 'approved') {
      return existing;
    }

    let submission: MissionSubmission;
    if (existing) {
      submission = await this.repo.updateSubmission(existing.id, link);
    } else {
      submission = await this.repo.insertSubmission(missionId, user.profileId, link);
    }

    // Link-type missions require no human review — auto-approve immediately.
    if (mission?.submission_type === 'link') {
      await this.repo.approveMissionSubmission(submission.id);
      return { ...submission, status: 'approved', rejection_reason: null };
    }

    return submission;
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

  approveMissionSubmission(subId: string): Promise<void> {
    return this.repo.approveMissionSubmission(subId);
  }

  rejectMissionSubmission(subId: string, reason?: string): Promise<void> {
    return this.repo.rejectMissionSubmission(subId, reason);
  }
}
