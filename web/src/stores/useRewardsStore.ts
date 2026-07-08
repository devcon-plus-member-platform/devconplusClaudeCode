import { create } from 'zustand'
import type { Reward, RewardRedemption } from '@devcon-plus/supabase'
import { apiFetch, publicFetch } from '../lib/api'
import { useAuthStore } from './useAuthStore'
import { usePointsStore } from './usePointsStore'

// Shape of a validated reward create/update payload (see AdminRewards form schema).
export interface RewardFormData {
  name: string
  description?: string
  points_cost: number
  type: 'physical' | 'digital'
  claim_method: 'onsite' | 'digital_delivery'
  stock_remaining: number | null
  max_per_user: number | null
  is_active: boolean
  is_coming_soon: boolean
}

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
  // Admin-facing: all rewards including inactive (hq_admin+ endpoint)
  allRewards: Reward[]

  redemptions: RewardRedemption[]
  allRedemptions: RewardRedemptionWithDetails[]
  unseenClaimCount: number

  isLoading: boolean      // member fetchRewards / redeemReward / loadRedemptions
  isLoadingAll: boolean   // admin fetchAllRewards
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
      const data = await publicFetch<Reward[]>('/api/rewards')
      set({ rewards: data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  // ── Admin: all rewards ───────────────────────────────────────────────────
  fetchAllRewards: async () => {
    set((s) => ({ isLoadingAll: s.allRewards.length === 0, error: null }))
    try {
      const data = await apiFetch<Reward[]>('/api/rewards/all')
      set({ allRewards: data })
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
    await apiFetch('/api/rewards', { method: 'POST', body: JSON.stringify(payload) })
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
    await apiFetch(`/api/rewards/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    await Promise.all([get().fetchAllRewards(), get().fetchRewards()])
  },

  // ── Delete (permanent) ───────────────────────────────────────────────────
  deleteReward: async (id) => {
    await apiFetch(`/api/rewards/${id}`, { method: 'DELETE' })
    set((s) => ({
      rewards: s.rewards.filter((r) => r.id !== id),
      allRewards: s.allRewards.filter((r) => r.id !== id),
    }))
  },

  // ── Realtime ─────────────────────────────────────────────────────────────
  // Disabled 2026-06-12: `rewards` was removed from the supabase_realtime
  // publication to cut WAL load (see supabase/diagnostics/FINDINGS.md). The
  // catalog is low-churn and refetches on mount/recovery, so no live channel is
  // opened. To restore, re-add `rewards` to the publication and revert this body
  // (git history has the original UPDATE-driven deactivation handler).
  subscribeToChanges: () => {
    return () => {}
  },

  // ── Redeem ───────────────────────────────────────────────────────────────
  redeemReward: async (rewardId) => {
    const user = useAuthStore.getState().user
    if (!user) return { success: false, error: 'Not authenticated' }

    try {
      const result = await apiFetch<{ redemptionId: string; claimPin: string | null }>(
        `/api/rewards/${rewardId}/redeem`,
        { method: 'POST' },
      )
      await Promise.all([
        usePointsStore.getState().loadTotalPoints(),
        get().fetchRewards(),
      ])
      return { success: true, redemptionId: result.redemptionId, claimPin: result.claimPin }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Redemption failed'
      return { success: false, error: msg }
    }
  },

  // ── Redemption history ───────────────────────────────────────────────────
  loadRedemptions: async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ isLoading: true, error: null })
    try {
      const data = await apiFetch<RewardRedemption[]>('/api/rewards/redemptions/mine')
      set({ redemptions: data })
    } catch (err) {
      set({ redemptions: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  // ── All redemptions (admin claims view) ──────────────────────────────────
  fetchAllRedemptions: async () => {
    set({ isLoadingClaims: true, error: null })
    try {
      const data = await apiFetch<RewardRedemptionWithDetails[]>('/api/rewards/redemptions')
      set({
        allRedemptions: data,
        unseenClaimCount: data.filter((r) => r.status === 'pending').length,
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

    try {
      await apiFetch(`/api/rewards/redemptions/${redemptionId}/approve`, { method: 'POST' })
      set((s) => ({
        allRedemptions: s.allRedemptions.map((r) =>
          r.id === redemptionId
            ? { ...r, status: 'claimed' as const, reviewed_by: organizer.id, reviewed_at: new Date().toISOString() }
            : r
        ),
      }))
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Approval failed' }
    }
  },

  // ── Refund claim ─────────────────────────────────────────────────────────
  refundClaim: async (redemptionId) => {
    const organizer = useAuthStore.getState().user
    if (!organizer) return { success: false, error: 'Not authenticated' }

    try {
      await apiFetch(`/api/rewards/redemptions/${redemptionId}/refund`, { method: 'POST' })
      set((s) => ({
        allRedemptions: s.allRedemptions.map((r) =>
          r.id === redemptionId
            ? { ...r, status: 'cancelled' as const, reviewed_by: organizer.id, reviewed_at: new Date().toISOString() }
            : r
        ),
      }))
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Refund failed' }
    }
  },

  // ── Mark claims as seen ──────────────────────────────────────────────────
  markClaimsAsSeen: () => {
    set({ unseenClaimCount: 0 })
  },

  // NOTE: a `reward_redemptions` realtime subscription was removed 2026-06-12 —
  // that table was never in the supabase_realtime publication, so it never fired.
  // The admin claims queue stays fresh via fetchAllRedemptions() on AdminRewards
  // mount (AdminLayout remounts pages on its recovery cycle).
}))
