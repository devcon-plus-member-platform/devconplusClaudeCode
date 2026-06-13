import { Test } from '@nestjs/testing';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { RolesGuard } from '../common/authz/roles.guard';
import type { Profile } from '../supabase/types';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

const MISSION_ID = 'mission-uuid-001';
const SUB_ID     = 'sub-uuid-001';

const memberProfile: Partial<Profile> = { id: 'member-1', role: 'member',   chapter_id: 'ch-1' };
const adminProfile:  Partial<Profile> = { id: 'admin-1',  role: 'hq_admin', chapter_id: 'ch-1' };

const mockMember: AuthenticatedUser = { firebaseUid: 'fb-m', profileId: 'member-1', profile: memberProfile as Profile };
const mockAdmin:  AuthenticatedUser = { firebaseUid: 'fb-a', profileId: 'admin-1',  profile: adminProfile  as Profile };

function makeService() {
  return {
    getMemberData:        jest.fn().mockResolvedValue({ missions: [], participants: [], submissions: [] }),
    startMission:         jest.fn().mockResolvedValue({ mission_id: MISSION_ID }),
    submitMission:        jest.fn().mockResolvedValue({ id: SUB_ID }),
    getAllMissions:        jest.fn().mockResolvedValue([]),
    getPendingQueue:      jest.fn().mockResolvedValue([]),
    createMission:        jest.fn().mockResolvedValue({ id: MISSION_ID }),
    updateMission:        jest.fn().mockResolvedValue({ id: MISSION_ID }),
    deleteMission:        jest.fn().mockResolvedValue(undefined),
    approveMissionSubmission: jest.fn().mockResolvedValue(undefined),
    rejectMissionSubmission:  jest.fn().mockResolvedValue(undefined),
  };
}

describe('MissionsController', () => {
  let controller: MissionsController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [MissionsController],
      providers: [{ provide: MissionsService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(MissionsController);
  });

  it('getMemberData — scoped to caller from token', async () => {
    await controller.getMemberData(mockMember);
    expect(service.getMemberData).toHaveBeenCalledWith(mockMember);
  });

  it('startMission — missionId from param, userId from token (IDOR defense)', async () => {
    await controller.startMission(mockMember, { id: MISSION_ID });
    expect(service.startMission).toHaveBeenCalledWith(mockMember, MISSION_ID);
  });

  it('submitMission — missionId from param, link from body, userId from token', async () => {
    await controller.submitMission(mockMember, { id: MISSION_ID }, { link: 'https://pr' });
    expect(service.submitMission).toHaveBeenCalledWith(mockMember, MISSION_ID, 'https://pr');
  });

  it('getAllMissions — admin-only, no user scope', async () => {
    await controller.getAllMissions();
    expect(service.getAllMissions).toHaveBeenCalled();
  });

  it('getPendingQueue — delegates to service', async () => {
    await controller.getPendingQueue();
    expect(service.getPendingQueue).toHaveBeenCalled();
  });

  it('approveMissionSubmission — subId from param only, mission stays open', async () => {
    await controller.approveMissionSubmission({ id: SUB_ID });
    expect(service.approveMissionSubmission).toHaveBeenCalledWith(SUB_ID);
  });

  it('rejectMissionSubmission — subId from param, optional reason from body', async () => {
    await controller.rejectMissionSubmission({ id: SUB_ID }, { reason: 'Incomplete work' });
    expect(service.rejectMissionSubmission).toHaveBeenCalledWith(SUB_ID, 'Incomplete work');
  });

  it('updateMission — covers is_active toggle path', async () => {
    await controller.updateMission({ id: MISSION_ID }, { is_active: false });
    expect(service.updateMission).toHaveBeenCalledWith(MISSION_ID, { is_active: false });
  });
});
