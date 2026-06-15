import { Injectable } from '@nestjs/common';
import { ReferralsRepository } from './referrals.repository';
import type { Referral } from '../supabase/types';

export interface ReferralSummary {
  referralCode: string | null;
  referrals: Referral[];
  referralCount: number;
  annualEarnings: number;
}

@Injectable()
export class ReferralsService {
  constructor(private readonly repo: ReferralsRepository) {}

  async getSummary(userId: string): Promise<ReferralSummary> {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();

    const [referralCode, referrals, annualEarnings] = await Promise.all([
      this.repo.findReferralCode(userId),
      this.repo.findByReferrer(userId),
      this.repo.findReferralEarnings(userId, startOfYear),
    ]);

    const referralCount = referrals.filter((r) => r.status === 'confirmed').length;

    return { referralCode, referrals, referralCount, annualEarnings };
  }
}
