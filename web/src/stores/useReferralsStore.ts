import { create } from 'zustand'
import type { Referral } from '@devcon-plus/supabase'
import { apiFetch } from '../lib/api'

interface ReferralsState {
  referralCode: string | null
  referrals: Referral[]
  referralCount: number
  annualEarnings: number
  loading: boolean
  error: string | null

  loadReferralData: () => Promise<void>
}

export const useReferralsStore = create<ReferralsState>((set) => ({
  referralCode: null,
  referrals: [],
  referralCount: 0,
  annualEarnings: 0,
  loading: false,
  error: null,

  loadReferralData: async () => {
    set({ loading: true, error: null })
    try {
      const data = await apiFetch<{
        referralCode: string | null
        referrals: Referral[]
        referralCount: number
        annualEarnings: number
      }>('/api/referrals/me')
      set({
        referralCode: data.referralCode,
        referrals: data.referrals,
        referralCount: data.referralCount,
        annualEarnings: data.annualEarnings,
        error: null,
      })
    } catch (err) {
      set({ referrals: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },
}))
