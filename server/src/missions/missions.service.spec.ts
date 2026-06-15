import type { AuthenticatedUser } from '../auth/auth.guard';
import type { AppCacheService } from '../cache/app-cache.service';
import type { Mission, MissionParticipant, MissionSubmission, Profile } from '../supabase/types';
import { MissionsRepository } from './missions.repository';
import { MissionsService } from './missions.service';

function makeCache() {
  return {
    getOrSet: jest.fn((_k: string, _ttl: number, loader: () => unknown) => loader()),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AppCacheService>;
}

function makeUser(id = 'uid-1'): AuthenticatedUser {
  return { firebaseUid: 'fb', profileId: id, profile: { id, role: 'member', chapter_id: 'ch-1' } as Profile };
}

const member = makeUser('member-1');
const SUB_ID = 'sub-uuid-001';
const MISSION_ID = 'mission-uuid-001';

const mockMission: Partial<Mission> = { id: MISSION_ID, title: 'Fix a Bug', is_active: true };
const mockSub: MissionSubmission = {
  id: SUB_ID, mission_id: MISSION_ID, user_id: 'member-1',
  pr_link: 'https://github.com/pr/1', status: 'pending', submitted_at: null,
};
const mockParticipant: MissionParticipant = { mission_id: MISSION_ID, user_id: 'member-1', joined_at: null };

function makeRepo() {
  return {
    findActiveMissions:     jest.fn().mockResolvedValue([mockMission]),
    findUserParticipants:   jest.fn().mockResolvedValue([mockParticipant]),
    findUserSubmissions:    jest.fn().mockResolvedValue([mockSub]),
    startMission:           jest.fn().mockResolvedValue(mockParticipant),
    findExistingSubmission: jest.fn().mockResolvedValue(null),
    insertSubmission:       jest.fn().mockResolvedValue(mockSub),
    updateSubmission:       jest.fn().mockResolvedValue(mockSub),
    findAllMissions:        jest.fn().mockResolvedValue([mockMission]),
    findPendingQueue:       jest.fn().mockResolvedValue([]),
    createMission:          jest.fn().mockResolvedValue(mockMission),
    updateMission:          jest.fn().mockResolvedValue(mockMission),
    deleteMission:          jest.fn().mockResolvedValue(undefined),
    approveMissionWinner:   jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MissionsRepository>;
}

describe('MissionsService', () => {
  let service: MissionsService;
  let repo: jest.Mocked<MissionsRepository>;

  beforeEach(() => {
    repo = makeRepo();
    service = new MissionsService(repo, makeCache());
  });

  // ── getMemberData ─────────────────────────────────────────────────────────

  describe('getMemberData', () => {
    it('runs three queries in parallel scoped to caller — IDOR defense', async () => {
      const result = await service.getMemberData(member);
      expect(repo.findActiveMissions).toHaveBeenCalled();
      expect(repo.findUserParticipants).toHaveBeenCalledWith('member-1');
      expect(repo.findUserSubmissions).toHaveBeenCalledWith('member-1');
      expect(result.missions).toEqual([mockMission]);
    });
  });

  // ── startMission ──────────────────────────────────────────────────────────

  describe('startMission', () => {
    it('passes missionId and profileId from token (never userId from body)', async () => {
      await service.startMission(member, MISSION_ID);
      expect(repo.startMission).toHaveBeenCalledWith(MISSION_ID, 'member-1');
    });
  });

  // ── submitMission: insert vs update ──────────────────────────────────────

  describe('submitMission', () => {
    it('inserts new submission when none exists', async () => {
      await service.submitMission(member, MISSION_ID, 'https://pr-link');
      expect(repo.findExistingSubmission).toHaveBeenCalledWith(MISSION_ID, 'member-1');
      expect(repo.insertSubmission).toHaveBeenCalledWith(MISSION_ID, 'member-1', 'https://pr-link');
      expect(repo.updateSubmission).not.toHaveBeenCalled();
    });

    it('updates existing submission instead of inserting duplicate', async () => {
      repo.findExistingSubmission.mockResolvedValue(mockSub);
      await service.submitMission(member, MISSION_ID, 'https://new-pr');
      expect(repo.updateSubmission).toHaveBeenCalledWith(SUB_ID, 'https://new-pr');
      expect(repo.insertSubmission).not.toHaveBeenCalled();
    });
  });

  // ── Admin ─────────────────────────────────────────────────────────────────

  it('getAllMissions — delegates to repo', async () => {
    await service.getAllMissions();
    expect(repo.findAllMissions).toHaveBeenCalled();
  });

  it('approveMissionWinner — passes subId to approve_mission_winner RPC', async () => {
    await service.approveMissionWinner(SUB_ID);
    expect(repo.approveMissionWinner).toHaveBeenCalledWith(SUB_ID);
  });

  it('updateMission — passes id and dto (covers is_active toggle)', async () => {
    await service.updateMission(MISSION_ID, { is_active: false });
    expect(repo.updateMission).toHaveBeenCalledWith(MISSION_ID, { is_active: false });
  });
});
