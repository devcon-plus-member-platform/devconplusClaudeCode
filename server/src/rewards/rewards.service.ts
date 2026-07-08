import { Injectable } from '@nestjs/common';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import type {
  Reward,
  RewardRedemption,
  RewardRedemptionWithDetails,
} from '../supabase/types';
import type { CreateRewardDto } from './dto/create-reward.dto';
import type { UpdateRewardDto } from './dto/update-reward.dto';
import { RewardsRepository } from './rewards.repository';

@Injectable()
export class RewardsService {
  constructor(
    private readonly rewardsRepo: RewardsRepository,
    private readonly cache: AppCacheService,
  ) {}

  // ── Public catalog ────────────────────────────────────────────────────

  async getPublicCatalog(): Promise<Reward[]> {
    await this.syncExpiredRewards();
    return this.cache.getOrSet(CacheKeys.REWARDS_CATALOG, CACHE_TTL.REWARDS, () =>
      this.rewardsRepo.findActiveRewards(),
    );
  }

  async getAllRewards(): Promise<Reward[]> {
    await this.syncExpiredRewards();
    return this.cache.getOrSet(CacheKeys.REWARDS_ALL, CACHE_TTL.REWARDS, () =>
      this.rewardsRepo.findAllRewards(),
    );
  }

  /**
   * Deactivate past-deadline rewards before serving the catalog. The UPDATE is
   * cheap and idempotent (0 rows in the steady state). When it DOES flip rows,
   * bust the cache so the very next read reflects the change — otherwise a
   * stale cached catalog would keep showing the reward as active for up to the
   * TTL. This makes a reward truly inactive the instant its deadline passes,
   * independent of the deactivate_expired_rewards cron.
   */
  private async syncExpiredRewards(): Promise<void> {
    const changed = await this.rewardsRepo.deactivateExpiredRewards();
    if (changed > 0) await this.invalidateCatalog();
  }

  // ── Reward CRUD (hq_admin / super_admin only) ─────────────────────────

  async createReward(dto: CreateRewardDto): Promise<Reward> {
    const reward = await this.rewardsRepo.createReward(dto);
    await this.invalidateCatalog();
    return reward;
  }

  async updateReward(id: string, dto: UpdateRewardDto): Promise<Reward> {
    const reward = await this.rewardsRepo.updateReward(id, dto);
    await this.invalidateCatalog();
    return reward;
  }

  async deleteReward(id: string): Promise<void> {
    await this.rewardsRepo.deleteReward(id);
    await this.invalidateCatalog();
  }

  // ── Redemption flows ──────────────────────────────────────────────────

  async redeemReward(
    userId: string,
    rewardId: string,
  ): Promise<{ redemptionId: string; claimPin: string | null }> {
    const result = await this.rewardsRepo.redeemReward(userId, rewardId);
    // redeem_reward decrements rewards.stock_remaining, which the catalog shows
    // to every user → user A's redeem must bust the shared catalog (cross-user).
    await this.invalidateCatalog();
    return result;
  }

  getMemberRedemptions(userId: string): Promise<RewardRedemption[]> {
    return this.rewardsRepo.getMemberRedemptions(userId);
  }

  getAllRedemptions(): Promise<RewardRedemptionWithDetails[]> {
    return this.rewardsRepo.getAllRedemptions();
  }

  approveClaim(redemptionId: string, organizerId: string): Promise<void> {
    return this.rewardsRepo.approveRedemption(redemptionId, organizerId);
  }

  async refundClaim(redemptionId: string, organizerId: string): Promise<void> {
    await this.rewardsRepo.refundRedemption(redemptionId, organizerId);
    // A refund may restore stock → bust the catalog for everyone.
    await this.invalidateCatalog();
  }

  // Both catalog views derive from the rewards table.
  private invalidateCatalog(): Promise<void> {
    return this.cache.del(CacheKeys.REWARDS_CATALOG, CacheKeys.REWARDS_ALL);
  }
}
