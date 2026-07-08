import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  Reward,
  RewardRedemption,
  RewardRedemptionWithDetails,
} from '../supabase/types';
import type { CreateRewardDto } from './dto/create-reward.dto';
import type { UpdateRewardDto } from './dto/update-reward.dto';

interface RedeemRpcResult {
  success: boolean;
  redemption_id?: string;
  claim_pin?: string;
  error?: string;
}

interface RpcEnvelope {
  success: boolean;
  error?: string;
}

@Injectable()
export class RewardsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  // ── Public catalog ────────────────────────────────────────────────────

  /**
   * Flip any past-deadline reward to is_active = false, right now, and return
   * how many rows changed. Called on every catalog read so a reward becomes
   * truly inactive the moment its deadline passes — no dependency on the
   * (optional, 15-min) deactivate_expired_rewards cron. `.lt('deadline', ...)`
   * never matches NULL deadlines, so unlimited rewards are untouched.
   * Idempotent: returns 0 once everything is settled (the common case).
   */
  async deactivateExpiredRewards(): Promise<number> {
    const { data, error } = await this.db
      .from('rewards')
      .update({ is_active: false } as unknown as Record<string, unknown>)
      .lt('deadline', new Date().toISOString())
      .eq('is_active', true)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    return (data as unknown[] | null)?.length ?? 0;
  }

  async findActiveRewards(): Promise<Reward[]> {
    const result = await this.db
      .from('rewards')
      .select('*')
      .eq('is_active', true)
      .order('points_cost', { ascending: true })
      .limit(50);
    return this.unwrap(
      result as { data: Reward[] | null; error: { message: string } | null },
    );
  }

  async findAllRewards(): Promise<Reward[]> {
    const result = await this.db
      .from('rewards')
      .select('*')
      .order('points_cost', { ascending: true })
      .limit(100);
    return this.unwrap(
      result as { data: Reward[] | null; error: { message: string } | null },
    );
  }

  // ── Reward CRUD ───────────────────────────────────────────────────────

  async findRewardById(id: string): Promise<Reward> {
    const result = await this.db
      .from('rewards')
      .select('*')
      .eq('id', id)
      .single();
    return this.unwrap(result as { data: Reward | null; error: { message: string } | null });
  }

  async createReward(dto: CreateRewardDto): Promise<Reward> {
    const result = await this.db
      .from('rewards')
      .insert(dto as unknown as Record<string, unknown>)
      .select()
      .single();
    return this.unwrap(result as { data: Reward | null; error: { message: string } | null });
  }

  async updateReward(id: string, dto: UpdateRewardDto): Promise<Reward> {
    const result = await this.db
      .from('rewards')
      .update(dto as unknown as Record<string, unknown>)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(result as { data: Reward | null; error: { message: string } | null });
  }

  async deleteReward(id: string): Promise<void> {
    // Remove child redemptions first — the FK has no ON DELETE CASCADE.
    const { error: redemptionErr } = await this.db
      .from('reward_redemptions')
      .delete()
      .eq('reward_id', id);
    if (redemptionErr) {
      throw new BadRequestException(`Failed to remove redemptions: ${redemptionErr.message}`);
    }
    const { error } = await this.db.from('rewards').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }

  // ── Redemptions ───────────────────────────────────────────────────────

  /**
   * Calls the redeem_reward RPC — atomic: deducts points, inserts redemption,
   * optionally generates a claim_pin. Never split into multiple calls.
   */
  async redeemReward(
    userId: string,
    rewardId: string,
  ): Promise<{ redemptionId: string; claimPin: string | null }> {
    const { data, error } = await this.db.rpc('redeem_reward' as never, {
      p_reward_id: rewardId,
      p_user_id: userId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    const result = data as RedeemRpcResult | null;
    if (!result?.success) {
      throw new BadRequestException(result?.error ?? 'Redemption failed');
    }
    return {
      redemptionId: result.redemption_id ?? '',
      claimPin: result.claim_pin ?? null,
    };
  }

  async getMemberRedemptions(userId: string): Promise<RewardRedemption[]> {
    const result = await this.db
      .from('reward_redemptions')
      .select('*')
      .eq('user_id', userId)
      .order('redeemed_at', { ascending: false });
    return this.unwrap(result as { data: RewardRedemption[] | null; error: { message: string } | null });
  }

  async getAllRedemptions(): Promise<RewardRedemptionWithDetails[]> {
    const result = await this.db
      .from('reward_redemptions')
      .select(`
        *,
        profiles!reward_redemptions_user_id_fkey (full_name, email),
        rewards!reward_redemptions_reward_id_fkey (name, image_url, points_cost)
      `)
      .order('redeemed_at', { ascending: false })
      .limit(200);

    const { data, error } = result;
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => {
      const profile = row.profiles as { full_name: string; email: string } | null;
      const reward = row.rewards as { name: string; image_url: string | null; points_cost: number } | null;
      const r = row as Record<string, unknown>;
      return {
        id: row.id as string,
        user_id: row.user_id as string | null,
        reward_id: row.reward_id as string | null,
        status: (row.status ?? 'pending') as RewardRedemption['status'],
        redeemed_at: row.redeemed_at as string | null,
        claimed_at: row.claimed_at as string | null,
        reviewed_by: (r.reviewed_by as string | null) ?? null,
        reviewed_at: (r.reviewed_at as string | null) ?? null,
        claim_pin: (r.claim_pin as string | null) ?? null,
        member_name: profile?.full_name ?? 'Unknown',
        member_email: profile?.email ?? '',
        reward_name: reward?.name ?? 'Unknown Reward',
        reward_image_url: reward?.image_url ?? null,
        reward_points_cost: reward?.points_cost ?? 0,
      } satisfies RewardRedemptionWithDetails;
    });
  }

  async approveRedemption(redemptionId: string, organizerId: string): Promise<void> {
    const { data, error } = await this.db.rpc('approve_reward_claim' as never, {
      p_redemption_id: redemptionId,
      p_organizer_id: organizerId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    const result = data as RpcEnvelope | null;
    if (!result?.success) {
      throw new BadRequestException(result?.error ?? 'Approval failed');
    }
  }

  async refundRedemption(redemptionId: string, organizerId: string): Promise<void> {
    const { data, error } = await this.db.rpc('refund_reward_claim' as never, {
      p_redemption_id: redemptionId,
      p_organizer_id: organizerId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    const result = data as RpcEnvelope | null;
    if (!result?.success) {
      throw new BadRequestException(result?.error ?? 'Refund failed');
    }
  }
}
