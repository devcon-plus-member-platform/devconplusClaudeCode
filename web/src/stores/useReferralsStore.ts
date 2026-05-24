import { create } from 'zustand'
import type { Referral } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './useAuthStore'

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
    const user = useAuthStore.getState().user
    if (!user) return
    set({ loading: true, error: null })

    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString()

    try {
      const [profileResult, referralsResult, earningsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('referral_code')
          .eq('id', user.id)
          .single(),
        supabase
          .from('referrals')
          .select('*')
          .eq('referrer_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('point_transactions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('source', 'referral')
          .gte('created_at', startOfYear),
      ])

      const firstError = profileResult.error ?? referralsResult.error ?? earningsResult.error
      if (firstError) throw firstError

      const referralCode = profileResult.data?.referral_code ?? null
      const referrals = (referralsResult.data ?? []) as Referral[]
      const referralCount = referrals.filter((r) => r.status === 'confirmed').length
      const annualEarnings = (earningsResult.data ?? []).reduce(
        (sum, tx) => sum + tx.amount,
        0
      )

      set({ referralCode, referrals, referralCount, annualEarnings, error: null })
    } catch (err) {
      set({ referrals: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },
}))
