import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Referral } from '../supabase/types';

@Injectable()
export class ReferralsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findReferralCode(userId: string): Promise<string | null> {
    const result = await this.db
      .from('profiles')
      .select('referral_code')
      .eq('id', userId)
      .single();
    const row = this.unwrapMaybe(
      result as { data: { referral_code: string | null } | null; error: { message: string } | null },
    );
    return row?.referral_code ?? null;
  }

  async findByReferrer(referrerId: string): Promise<Referral[]> {
    const result = await this.db
      .from('referrals')
      .select('*')
      .eq('referrer_id', referrerId)
      .order('created_at', { ascending: false });
    return this.unwrap(
      result as { data: Referral[] | null; error: { message: string } | null },
    );
  }

  async findReferralEarnings(userId: string, startOfYear: string): Promise<number> {
    const result = await this.db
      .from('point_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('source', 'referral')
      .gte('created_at', startOfYear);
    const rows = this.unwrap(
      result as { data: { amount: number }[] | null; error: { message: string } | null },
    );
    return rows.reduce((sum, tx) => sum + tx.amount, 0);
  }
}
