import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { PointSummary, PointTransaction, XpTier } from '../supabase/types';
import type { CreateXpTierDto } from './dto/create-xp-tier.dto';
import type { UpdateXpTierDto } from './dto/update-xp-tier.dto';

@Injectable()
export class PointsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  // ── Member ────────────────────────────────────────────────────────────────

  async findTransactions(userId: string): Promise<PointTransaction[]> {
    const result = await this.db
      .from('point_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return this.unwrap(
      result as { data: PointTransaction[] | null; error: { message: string } | null },
    );
  }

  async findPointSummary(userId: string): Promise<PointSummary> {
    const { data, error } = await this.db
      .from('profiles')
      .select('spendable_points, lifetime_points')
      .eq('id', userId)
      .single();
    if (error) throw new NotFoundException('Profile not found');
    return {
      spendable_points: (data?.spendable_points ?? 0) as number,
      lifetime_points:  (data?.lifetime_points  ?? 0) as number,
    };
  }

  // ── XP Tiers (admin) ──────────────────────────────────────────────────────

  async findAllTiers(): Promise<XpTier[]> {
    const result = await this.db
      .from('xp_tiers')
      .select('*')
      .order('min_points', { ascending: true });
    return this.unwrap(
      result as { data: XpTier[] | null; error: { message: string } | null },
    );
  }

  async createTier(dto: CreateXpTierDto): Promise<XpTier> {
    const result = await this.db
      .from('xp_tiers')
      .insert(dto as unknown as Record<string, unknown>)
      .select()
      .single();
    return this.unwrap(
      result as { data: XpTier | null; error: { message: string } | null },
    );
  }

  async updateTier(id: string, dto: UpdateXpTierDto): Promise<XpTier> {
    const result = await this.db
      .from('xp_tiers')
      .update(dto as unknown as Record<string, unknown>)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(
      result as { data: XpTier | null; error: { message: string } | null },
    );
  }

  async deleteTier(id: string): Promise<void> {
    const { error } = await this.db.from('xp_tiers').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }
}
