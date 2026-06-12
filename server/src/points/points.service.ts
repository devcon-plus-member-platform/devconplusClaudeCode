import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import type { PointSummary, PointTransaction, XpTier } from '../supabase/types';
import type { CreateXpTierDto } from './dto/create-xp-tier.dto';
import type { UpdateXpTierDto } from './dto/update-xp-tier.dto';
import { PointsRepository } from './points.repository';

@Injectable()
export class PointsService {
  /** Max rows returned for a single transactions fetch (also the default). */
  private static readonly TX_MAX = 200;

  constructor(private readonly repo: PointsRepository) {}

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

  getAllTiers(): Promise<XpTier[]> {
    return this.repo.findAllTiers();
  }

  createTier(dto: CreateXpTierDto): Promise<XpTier> {
    return this.repo.createTier(dto);
  }

  updateTier(id: string, dto: UpdateXpTierDto): Promise<XpTier> {
    return this.repo.updateTier(id, dto);
  }

  deleteTier(id: string): Promise<void> {
    return this.repo.deleteTier(id);
  }
}
