import { Test } from '@nestjs/testing';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { RolesGuard } from '../common/authz/roles.guard';
import type { Profile } from '../supabase/types';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

// ── Fixtures ─────────────────────────────────────────────────────────────

const REWARD_ID     = 'reward-uuid-001';
const REDEMPTION_ID = 'redemption-uuid-001';
const MEMBER_ID     = 'member-uuid-001';
const ORGANIZER_ID  = 'organizer-uuid-001';

const memberProfile: Partial<Profile> = { id: MEMBER_ID, role: 'member', chapter_id: 'ch-1' };
const officerProfile: Partial<Profile> = { id: ORGANIZER_ID, role: 'chapter_officer', chapter_id: 'ch-1' };
const adminProfile: Partial<Profile> = { id: 'admin-uuid', role: 'hq_admin', chapter_id: 'ch-1' };

const mockMember: AuthenticatedUser = { firebaseUid: 'fb-member', profileId: MEMBER_ID, profile: memberProfile as Profile };
const mockOfficer: AuthenticatedUser = { firebaseUid: 'fb-officer', profileId: ORGANIZER_ID, profile: officerProfile as Profile };
const mockAdmin: AuthenticatedUser = { firebaseUid: 'fb-admin', profileId: 'admin-uuid', profile: adminProfile as Profile };

const mockReward = { id: REWARD_ID, name: 'Cap', points_cost: 100 };
const mockRedemptionResult = { redemptionId: REDEMPTION_ID, claimPin: null };

// ── Mock factory ─────────────────────────────────────────────────────────

function makeService() {
  return {
    createReward:        jest.fn().mockResolvedValue(mockReward),
    updateReward:        jest.fn().mockResolvedValue(mockReward),
    deleteReward:        jest.fn().mockResolvedValue(undefined),
    redeemReward:        jest.fn().mockResolvedValue(mockRedemptionResult),
    getMemberRedemptions:jest.fn().mockResolvedValue([]),
    getAllRedemptions:    jest.fn().mockResolvedValue([]),
    approveClaim:        jest.fn().mockResolvedValue(undefined),
    refundClaim:         jest.fn().mockResolvedValue(undefined),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('RewardsController', () => {
  let controller: RewardsController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [RewardsController],
      providers: [{ provide: RewardsService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(RewardsController);
  });

  // ── CRUD delegation ──────────────────────────────────────────────────

  describe('createReward', () => {
    it('delegates to service.createReward', async () => {
      const dto = { name: 'Cap', points_cost: 100, type: 'physical' as const, claim_method: 'onsite' as const, is_active: true, is_coming_soon: false };
      await controller.createReward(dto);
      expect(service.createReward).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateReward', () => {
    it('passes id and dto to service.updateReward', async () => {
      await controller.updateReward({ id: REWARD_ID }, { name: 'New Name' });
      expect(service.updateReward).toHaveBeenCalledWith(REWARD_ID, { name: 'New Name' });
    });
  });

  describe('deleteReward', () => {
    it('delegates to service.deleteReward', async () => {
      await controller.deleteReward({ id: REWARD_ID });
      expect(service.deleteReward).toHaveBeenCalledWith(REWARD_ID);
    });
  });

  // ── Redemption flows ─────────────────────────────────────────────────

  describe('redeemReward', () => {
    it('passes user.profileId from token — never from request body', async () => {
      await controller.redeemReward(mockMember, { id: REWARD_ID });
      expect(service.redeemReward).toHaveBeenCalledWith(MEMBER_ID, REWARD_ID);
    });

    it('returns the redemption result', async () => {
      const result = await controller.redeemReward(mockMember, { id: REWARD_ID });
      expect(result).toEqual(mockRedemptionResult);
    });
  });

  describe('getMemberRedemptions', () => {
    it('scopes to the caller\'s profileId from the token', async () => {
      await controller.getMemberRedemptions(mockMember);
      expect(service.getMemberRedemptions).toHaveBeenCalledWith(MEMBER_ID);
    });
  });

  describe('getAllRedemptions', () => {
    it('delegates to service.getAllRedemptions', async () => {
      await controller.getAllRedemptions();
      expect(service.getAllRedemptions).toHaveBeenCalled();
    });
  });

  describe('approveClaim', () => {
    it('passes organizerId from token — prevents IDOR on reviewer identity', async () => {
      await controller.approveClaim(mockOfficer, { id: REDEMPTION_ID });
      expect(service.approveClaim).toHaveBeenCalledWith(REDEMPTION_ID, ORGANIZER_ID);
    });
  });

  describe('refundClaim', () => {
    it('passes organizerId from token', async () => {
      await controller.refundClaim(mockAdmin, { id: REDEMPTION_ID });
      expect(service.refundClaim).toHaveBeenCalledWith(REDEMPTION_ID, 'admin-uuid');
    });
  });
});
