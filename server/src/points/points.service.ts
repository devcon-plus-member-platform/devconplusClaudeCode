import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import type { PointSummary, PointTransaction, XpTier } from '../supabase/types';
import type { CreateXpTierDto } from './dto/create-xp-tier.dto';
import type { UpdateXpTierDto } from './dto/update-xp-tier.dto';
import { PointsRepository } from './points.repository';

@Injectable()
export class PointsService {
  constructor(private readonly repo: PointsRepository) {}

  getTransactions(user: AuthenticatedUser): Promise<PointTransaction[]> {
    return this.repo.findTransactions(user.profileId);
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
