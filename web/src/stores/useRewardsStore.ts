import { create } from 'zustand'
import type { Reward, RewardRedemption } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { useAuthStore } from './useAuthStore'
import { usePointsStore } from './usePointsStore'
import type { RewardFormData } from '../pages/organizer/rewards/rewardFormConstants'

let _chanSeq = 0
const nextChan = (base: string) => `${base}-${++_chanSeq}`

export interface RewardRedemptionWithDetails extends RewardRedemption {
  member_name: string
  member_email: string
  reward_name: string
  reward_image_url: string | null
  reward_points_cost: number
  reviewed_by: string | null
  reviewed_at: string | null
  claim_pin: string | null
}

interface RewardsState {
  // Member-facing: active rewards only
  rewards: Reward[]
  // Organizer-facing: all rewards including inactive
  allRewards: Reward[]

  redemptions: RewardRedemption[]
  allRedemptions: RewardRedemptionWithDetails[]
  unseenClaimCount: number

  isLoading: boolean      // member fetchRewards / redeemReward / loadRedemptions
  isLoadingAll: boolean   // organizer fetchAllRewards
  isLoadingClaims: boolean
  error: string | null

  fetchRewards: () => Promise<void>
  fetchAllRewards: () => Promise<void>
  createReward: (data: RewardFormData, imageUrl: string | null) => Promise<void>
  updateReward: (id: string, data: RewardFormData, imageUrl: string | null) => Promise<void>
  deleteReward: (id: string) => Promise<void>
  subscribeToChanges: () => () => void
  redeemReward: (rewardId: string) => Promise<{ success: boolean; error?: string; redemptionId?: string; claimPin?: string | null }>
  loadRedemptions: () => Promise<void>
  fetchAllRedemptions: () => Promise<void>
  approveClaim: (redemptionId: string) => Promise<{ success: boolean; error?: string }>
  refundClaim: (redemptionId: string) => Promise<{ success: boolean; error?: string }>
  subscribeToRedemptions: () => () => void
  markClaimsAsSeen: () => void
}

export const useRewardsStore = create<RewardsState>((set, get) => ({
  rewards: [],
  allRewards: [],
  redemptions: [],
  allRedemptions: [],
  unseenClaimCount: 0,
  isLoading: false,
  isLoadingAll: false,
  isLoadingClaims: false,
  error: null,

  // ── Member: active rewards only ─────────────────────────────────────────
  fetchRewards: async () => {
    set((s) => ({ isLoading: s.rewards.length === 0, error: null }))
    try {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .eq('is_active', true)
        .order('points_cost', { ascending: true })
        .limit(50)
      if (error) throw error
      set({ rewards: (data ?? []) as Reward[] })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  // ── Organizer: all rewards ───────────────────────────────────────────────
  fetchAllRewards: async () => {
    set((s) => ({ isLoadingAll: s.allRewards.length === 0, error: null }))
    try {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .order('points_cost', { ascending: true })
        .limit(100)
      if (error) throw error
      set({ allRewards: (data ?? []) as Reward[] })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoadingAll: false })
    }
  },

  // ── Create ───────────────────────────────────────────────────────────────
  createReward: async (data, imageUrl) => {
    const payload = {
      name: data.name,
      description: data.description || null,
      points_cost: data.points_cost,
      type: data.type,
      claim_method: data.claim_method,
      stock_remaining: data.stock_remaining ?? null,
      max_per_user: data.max_per_user ?? null,
      is_active: data.is_active,
      is_coming_soon: data.is_coming_soon,
      image_url: imageUrl,
    }
    const { error } = await supabase.from('rewards').insert(payload)
    if (error) throw new Error(error.message)
    await Promise.all([get().fetchAllRewards(), get().fetchRewards()])
  },

  // ── Update ───────────────────────────────────────────────────────────────
  updateReward: async (id, data, imageUrl) => {
    const payload = {
      name: data.name,
      description: data.description || null,
      points_cost: data.points_cost,
      type: data.type,
      claim_method: data.claim_method,
      stock_remaining: data.stock_remaining ?? null,
      max_per_user: data.max_per_user ?? null,
      is_active: data.is_active,
      is_coming_soon: data.is_coming_soon,
      image_url: imageUrl,
    }
    const { error } = await supabase.from('rewards').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
    await Promise.all([get().fetchAllRewards(), get().fetchRewards()])
  },

  // ── Delete (permanent) ───────────────────────────────────────────────────
  deleteReward: async (id) => {
    // Remove child redemptions first to satisfy FK constraint
    const { error: redemptionsError } = await supabase
      .from('reward_redemptions')
      .delete()
      .eq('reward_id', id)
    if (redemptionsError) throw new Error(redemptionsError.message)

    const { error } = await supabase.from('rewards').delete().eq('id', id)
    if (error) throw new Error(error.message)

    set((s) => ({
      rewards: s.rewards.filter((r) => r.id !== id),
      allRewards: s.allRewards.filter((r) => r.id !== id),
    }))
  },

  // ── Realtime ─────────────────────────────────────────────────────────────
  subscribeToChanges: () => {
    const channel = supabase
      .channel(nextChan('rewards-realtime'))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rewards' },
        (payload) => {
          const updated = payload.new as Reward
          if (!updated.is_active) {
            set((s) => ({
              rewards: s.rewards.filter((r) => r.id !== updated.id),
              allRewards: s.allRewards.filter((r) => r.id !== updated.id),
            }))
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[rewards-realtime] channel error', status, err)
        }
      })
    return () => { void supabase.removeChannel(channel) }
  },

  // ── Redeem ───────────────────────────────────────────────────────────────
  redeemReward: async (rewardId) => {
    const user = useAuthStore.getState().user
    if (!user) return { success: false, error: 'Not authenticated' }

    // redeem_reward exists in DB but not yet in generated types — cast is intentional
    // RPC returns { success, redemption_id, claim_pin } directly so we avoid
    // a separate SELECT that could fail if PostgREST schema cache is stale
    type RedeemResult = { success: boolean; redemption_id?: string; claim_pin?: string; error?: string }
    const { data: rpcData, error } = await supabase.rpc('redeem_reward' as never, {
      p_reward_id: rewardId,
      p_user_id: user.id,
    } as never)
    if (error) return { success: false, error: error.message }
    const rpcResult = rpcData as RedeemResult | null
    if (!rpcResult?.success) return { success: false, error: rpcResult?.error ?? 'Redemption failed' }

    const [, refreshedRewards] = await Promise.all([
      usePointsStore.getState().loadTotalPoints(),
      supabase
        .from('rewards')
        .select('*')
        .eq('is_active', true)
        .order('points_cost', { ascending: true }),
    ])
    if (!refreshedRewards.error) {
      set({ rewards: (refreshedRewards.data ?? []) as Reward[] })
    }
    return { success: true, redemptionId: rpcResult.redemption_id, claimPin: rpcResult.claim_pin ?? null }
  },

  // ── Redemption history ───────────────────────────────────────────────────
  loadRedemptions: async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('reward_redemptions')
        .select('*')
        .eq('user_id', user.id)
        .order('redeemed_at', { ascending: false })
      if (error) throw error
      set({ redemptions: (data ?? []) as RewardRedemption[] })
    } catch (err) {
      set({ redemptions: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  // ── All redemptions (organizer/admin view) ───────────────────────────────
  fetchAllRedemptions: async () => {
    set({ isLoadingClaims: true, error: null })
    try {
      const { data, error } = await supabase
        .from('reward_redemptions')
        .select(`
          *,
          profiles!reward_redemptions_user_id_fkey (full_name, email),
          rewards!reward_redemptions_reward_id_fkey (name, image_url, points_cost)
        `)
        .order('redeemed_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const mapped: RewardRedemptionWithDetails[] = (data ?? []).map((row) => {
        const profile = row.profiles as { full_name: string; email: string } | null
        const reward = row.rewards as { name: string; image_url: string | null; points_cost: number } | null
        return {
          id: row.id,
          user_id: row.user_id ?? '',
          reward_id: row.reward_id ?? '',
          status: (row.status ?? 'pending') as RewardRedemption['status'],
          redeemed_at: row.redeemed_at ?? '',
          claimed_at: row.claimed_at,
          reviewed_by: (row as Record<string, unknown>).reviewed_by as string | null ?? null,
          reviewed_at: (row as Record<string, unknown>).reviewed_at as string | null ?? null,
          claim_pin: (row as Record<string, unknown>).claim_pin as string | null ?? null,
          member_name: profile?.full_name ?? 'Unknown',
          member_email: profile?.email ?? '',
          reward_name: reward?.name ?? 'Unknown Reward',
          reward_image_url: reward?.image_url ?? null,
          reward_points_cost: reward?.points_cost ?? 0,
        }
      })
      set({
        allRedemptions: mapped,
        unseenClaimCount: mapped.filter((r) => r.status === 'pending').length,
      })
    } catch (err) {
      set({ allRedemptions: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoadingClaims: false })
    }
  },

  // ── Approve claim ────────────────────────────────────────────────────────
  approveClaim: async (redemptionId) => {
    const organizer = useAuthStore.getState().user
    if (!organizer) return { success: false, error: 'Not authenticated' }
    // approve_reward_claim / refund_reward_claim not yet in generated types — cast is intentional
    const { data, error } = await supabase.rpc('approve_reward_claim' as never, {
      p_redemption_id: redemptionId,
      p_organizer_id: organizer.id,
    } as never)
    if (error) return { success: false, error: error.message }
    const result = data as { success: boolean; error?: string }
    if (!result.success) return { success: false, error: result.error }
    set((s) => ({
      allRedemptions: s.allRedemptions.map((r) =>
        r.id === redemptionId
          ? { ...r, status: 'claimed' as const, reviewed_by: organizer.id, reviewed_at: new Date().toISOString() }
          : r
      ),
    }))
    return { success: true }
  },

  // ── Refund claim ─────────────────────────────────────────────────────────
  refundClaim: async (redemptionId) => {
    const organizer = useAuthStore.getState().user
    if (!organizer) return { success: false, error: 'Not authenticated' }
    // approve_reward_claim / refund_reward_claim not yet in generated types — cast is intentional
    const { data, error } = await supabase.rpc('refund_reward_claim' as never, {
      p_redemption_id: redemptionId,
      p_organizer_id: organizer.id,
    } as never)
    if (error) return { success: false, error: error.message }
    const result = data as { success: boolean; error?: string }
    if (!result.success) return { success: false, error: result.error }
    set((s) => ({
      allRedemptions: s.allRedemptions.map((r) =>
        r.id === redemptionId
          ? { ...r, status: 'cancelled' as const, reviewed_by: organizer.id, reviewed_at: new Date().toISOString() }
          : r
      ),
    }))
    return { success: true }
  },

  // ── Mark claims as seen ──────────────────────────────────────────────────
  markClaimsAsSeen: () => {
    set({ unseenClaimCount: 0 })
  },

  // ── Realtime redemption subscriptions ────────────────────────────────────
  subscribeToRedemptions: () => {
    // Debounce timer: coalesces rapid back-to-back inserts into one bulk refetch
    // instead of firing one per-row SELECT+JOIN per insert (N+1).
    let refetchTimer: number | null = null
    const channel = supabase
      .channel(nextChan('reward-redemptions-realtime'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reward_redemptions' },
        (payload) => {
          const row = payload.new as RewardRedemption
          const reward = get().allRewards.find((r) => r.id === row.reward_id)
          toast.info(`New reward claim — ${reward?.name ?? 'Unknown Reward'}`)
          if (refetchTimer !== null) window.clearTimeout(refetchTimer)
          refetchTimer = window.setTimeout(() => {
            refetchTimer = null
            void get().fetchAllRedemptions()
          }, 500)
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[reward-redemptions-realtime] channel error:', err)
        } else if (status === 'TIMED_OUT') {
          console.warn('[reward-redemptions-realtime] timed out — Supabase will retry')
        }
      })
    return () => {
      if (refetchTimer !== null) window.clearTimeout(refetchTimer)
      void supabase.removeChannel(channel)
    }
  },
}))
