import { Test } from '@nestjs/testing';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { RolesGuard } from '../common/authz/roles.guard';
import type { Profile } from '../supabase/types';
import { PointsController } from './points.controller';
import { PointsService } from './points.service';

const TIER_ID = 'tier-uuid-001';
const memberProfile: Partial<Profile> = { id: 'member-1', role: 'member', chapter_id: 'ch-1' };
const adminProfile:  Partial<Profile> = { id: 'admin-1',  role: 'hq_admin', chapter_id: 'ch-1' };

const mockMember: AuthenticatedUser = { firebaseUid: 'fb-m', profileId: 'member-1', profile: memberProfile as Profile };
const mockAdmin:  AuthenticatedUser = { firebaseUid: 'fb-a', profileId: 'admin-1',  profile: adminProfile  as Profile };

function makeService() {
  return {
    getTransactions: jest.fn().mockResolvedValue([]),
    getPointSummary: jest.fn().mockResolvedValue({ spendable_points: 500, lifetime_points: 1200 }),
    getAllTiers:      jest.fn().mockResolvedValue([]),
    createTier:      jest.fn().mockResolvedValue({ id: TIER_ID }),
    updateTier:      jest.fn().mockResolvedValue({ id: TIER_ID }),
    deleteTier:      jest.fn().mockResolvedValue(undefined),
  };
}

describe('PointsController', () => {
  let controller: PointsController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [PointsController],
      providers: [{ provide: PointsService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PointsController);
  });

  it('getTransactions — scoped to caller from token (not body)', async () => {
    await controller.getTransactions(mockMember);
    expect(service.getTransactions).toHaveBeenCalledWith(mockMember);
  });

  it('getPointSummary — scoped to caller from token', async () => {
    const result = await controller.getPointSummary(mockMember);
    expect(service.getPointSummary).toHaveBeenCalledWith(mockMember);
    expect(result).toEqual({ spendable_points: 500, lifetime_points: 1200 });
  });

  it('getAllTiers — delegates to service', async () => {
    await controller.getAllTiers();
    expect(service.getAllTiers).toHaveBeenCalled();
  });

  it('createTier — passes dto to service', async () => {
    const dto = { name: 'Geek', label: 'Geek', min_points: 100 };
    await controller.createTier(dto);
    expect(service.createTier).toHaveBeenCalledWith(dto);
  });

  it('updateTier — passes id from param and dto from body', async () => {
    const dto = { name: 'Updated' };
    await controller.updateTier({ id: TIER_ID }, dto);
    expect(service.updateTier).toHaveBeenCalledWith(TIER_ID, dto);
  });

  it('deleteTier — passes id from param', async () => {
    await controller.deleteTier({ id: TIER_ID });
    expect(service.deleteTier).toHaveBeenCalledWith(TIER_ID);
  });
});
