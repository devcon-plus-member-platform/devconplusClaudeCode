import { Injectable } from '@nestjs/common';
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
  constructor(private readonly rewardsRepo: RewardsRepository) {}

  // ── Reward CRUD (hq_admin / super_admin only) ─────────────────────────

  createReward(dto: CreateRewardDto): Promise<Reward> {
    return this.rewardsRepo.createReward(dto);
  }

  updateReward(id: string, dto: UpdateRewardDto): Promise<Reward> {
    return this.rewardsRepo.updateReward(id, dto);
  }

  deleteReward(id: string): Promise<void> {
    return this.rewardsRepo.deleteReward(id);
  }

  // ── Redemption flows ──────────────────────────────────────────────────

  redeemReward(
    userId: string,
    rewardId: string,
  ): Promise<{ redemptionId: string; claimPin: string | null }> {
    return this.rewardsRepo.redeemReward(userId, rewardId);
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

  refundClaim(redemptionId: string, organizerId: string): Promise<void> {
    return this.rewardsRepo.refundRedemption(redemptionId, organizerId);
  }
}
