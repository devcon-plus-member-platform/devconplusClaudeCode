import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import type { PointSummary, PointTransaction, XpTier } from '../supabase/types';
import type { CreateXpTierDto } from './dto/create-xp-tier.dto';
import type { UpdateXpTierDto } from './dto/update-xp-tier.dto';
import { PointsRepository } from './points.repository';

@Injectable()
export class PointsService {
  /** Max rows returned for a single transactions fetch (also the default). */
  private static readonly TX_MAX = 200;

  constructor(
    private readonly repo: PointsRepository,
    private readonly cache: AppCacheService,
  ) {}

  getTransactions(
    user: AuthenticatedUser,
    limit?: number,
  ): Promise<PointTransaction[]> {
    // Clamp to [1, TX_MAX]; undefined/garbage falls back to TX_MAX.
    const requested = Math.trunc(limit ?? PointsService.TX_MAX);
    const safeLimit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), PointsService.TX_MAX)
      : PointsService.TX_MAX;
    return this.repo.findTransactions(user.profileId, safeLimit);
  }

  getPointSummary(user: AuthenticatedUser): Promise<PointSummary> {
    return this.repo.findPointSummary(user.profileId);
  }

  // xp_tiers is global reference data (milestone definitions) — shared key.
  getAllTiers(): Promise<XpTier[]> {
    return this.cache.getOrSet(CacheKeys.XP_TIERS, CACHE_TTL.TIERS, () =>
      this.repo.findAllTiers(),
    );
  }

  async createTier(dto: CreateXpTierDto): Promise<XpTier> {
    const tier = await this.repo.createTier(dto);
    await this.cache.del(CacheKeys.XP_TIERS);
    return tier;
  }

  async updateTier(id: string, dto: UpdateXpTierDto): Promise<XpTier> {
    const tier = await this.repo.updateTier(id, dto);
    await this.cache.del(CacheKeys.XP_TIERS);
    return tier;
  }

  async deleteTier(id: string): Promise<void> {
    await this.repo.deleteTier(id);
    await this.cache.del(CacheKeys.XP_TIERS);
  }
}
