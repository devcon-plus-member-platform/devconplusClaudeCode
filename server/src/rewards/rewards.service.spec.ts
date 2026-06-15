import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppCacheService } from '../cache/app-cache.service';
import { RewardsRepository } from './rewards.repository';
import { RewardsService } from './rewards.service';

// ── Fixtures ─────────────────────────────────────────────────────────────

const REWARD_ID       = 'reward-uuid-001';
const REDEMPTION_ID   = 'redemption-uuid-001';
const MEMBER_ID       = 'member-uuid-001';
const ORGANIZER_ID    = 'organizer-uuid-001';

const mockReward = {
  id: REWARD_ID, name: 'DEVCON Cap', description: null,
  points_cost: 100, type: 'physical', claim_method: 'onsite',
  image_url: null, stock_remaining: 10, max_per_user: 1,
  financial_cost_php: null, is_active: true, is_coming_soon: false,
  created_at: '2026-01-01T00:00:00Z',
};

const mockRedemption = {
  id: REDEMPTION_ID, user_id: MEMBER_ID, reward_id: REWARD_ID,
  status: 'pending' as const, redeemed_at: '2026-06-04T00:00:00Z',
  claimed_at: null, reviewed_by: null, reviewed_at: null, claim_pin: null,
};

// ── Mock factory ─────────────────────────────────────────────────────────

function makeRepo() {
  return {
    findRewardById:      jest.fn().mockResolvedValue(mockReward),
    createReward:        jest.fn().mockResolvedValue(mockReward),
    updateReward:        jest.fn().mockResolvedValue(mockReward),
    deleteReward:        jest.fn().mockResolvedValue(undefined),
    redeemReward:        jest.fn().mockResolvedValue({ redemptionId: REDEMPTION_ID, claimPin: 'PIN1' }),
    getMemberRedemptions:jest.fn().mockResolvedValue([mockRedemption]),
    getAllRedemptions:    jest.fn().mockResolvedValue([]),
    approveRedemption:   jest.fn().mockResolvedValue(undefined),
    refundRedemption:    jest.fn().mockResolvedValue(undefined),
  };
}

function makeCache() {
  return {
    getOrSet: jest.fn((_k: string, _ttl: number, loader: () => unknown) => loader()),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('RewardsService', () => {
  let service: RewardsService;
  let repo: ReturnType<typeof makeRepo>;
  let cache: ReturnType<typeof makeCache>;

  beforeEach(async () => {
    repo = makeRepo();
    cache = makeCache();
    const module = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: RewardsRepository, useValue: repo },
        { provide: AppCacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(RewardsService);
  });

  describe('createReward', () => {
    it('delegates to repo.createReward', async () => {
      const dto = { name: 'Cap', points_cost: 100, type: 'physical' as const, claim_method: 'onsite' as const, is_active: true, is_coming_soon: false };
      await service.createReward(dto);
      expect(repo.createReward).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateReward', () => {
    it('delegates to repo.updateReward with id and dto', async () => {
      const dto = { name: 'Updated Cap' };
      await service.updateReward(REWARD_ID, dto);
      expect(repo.updateReward).toHaveBeenCalledWith(REWARD_ID, dto);
    });
  });

  describe('deleteReward', () => {
    it('delegates to repo.deleteReward', async () => {
      await service.deleteReward(REWARD_ID);
      expect(repo.deleteReward).toHaveBeenCalledWith(REWARD_ID);
    });
  });

  describe('redeemReward', () => {
    it('delegates to repo.redeemReward with userId and rewardId from token', async () => {
      await service.redeemReward(MEMBER_ID, REWARD_ID);
      expect(repo.redeemReward).toHaveBeenCalledWith(MEMBER_ID, REWARD_ID);
    });

    it('returns the redemption result', async () => {
      const result = await service.redeemReward(MEMBER_ID, REWARD_ID);
      expect(result).toEqual({ redemptionId: REDEMPTION_ID, claimPin: 'PIN1' });
    });

    it('busts the shared catalog cache (redeem decrements stock for everyone)', async () => {
      await service.redeemReward(MEMBER_ID, REWARD_ID);
      expect(cache.del).toHaveBeenCalledWith('rewards:catalog', 'rewards:all');
    });

    it('propagates BadRequestException from the repository (e.g. insufficient points)', async () => {
      repo.redeemReward.mockRejectedValue(new BadRequestException('Insufficient points'));
      await expect(service.redeemReward(MEMBER_ID, REWARD_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMemberRedemptions', () => {
    it('returns only the calling user\'s redemptions', async () => {
      const result = await service.getMemberRedemptions(MEMBER_ID);
      expect(repo.getMemberRedemptions).toHaveBeenCalledWith(MEMBER_ID);
      expect(result).toEqual([mockRedemption]);
    });
  });

  describe('getAllRedemptions', () => {
    it('delegates to repo.getAllRedemptions', async () => {
      await service.getAllRedemptions();
      expect(repo.getAllRedemptions).toHaveBeenCalled();
    });
  });

  describe('approveClaim', () => {
    it('passes redemptionId and organizerId to repo — never accepts organizerId from body', async () => {
      await service.approveClaim(REDEMPTION_ID, ORGANIZER_ID);
      expect(repo.approveRedemption).toHaveBeenCalledWith(REDEMPTION_ID, ORGANIZER_ID);
    });

    it('propagates BadRequestException from repo', async () => {
      repo.approveRedemption.mockRejectedValue(new BadRequestException('Already claimed'));
      await expect(service.approveClaim(REDEMPTION_ID, ORGANIZER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('refundClaim', () => {
    it('passes redemptionId and organizerId to repo', async () => {
      await service.refundClaim(REDEMPTION_ID, ORGANIZER_ID);
      expect(repo.refundRedemption).toHaveBeenCalledWith(REDEMPTION_ID, ORGANIZER_ID);
    });

    it('propagates BadRequestException from repo', async () => {
      repo.refundRedemption.mockRejectedValue(new BadRequestException('Already refunded'));
      await expect(service.refundClaim(REDEMPTION_ID, ORGANIZER_ID)).rejects.toThrow(BadRequestException);
    });
  });
});
