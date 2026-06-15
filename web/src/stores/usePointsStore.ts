import { create } from 'zustand'
import type { PointTransaction, Profile } from '@devcon-plus/supabase'
import { apiFetch } from '../lib/api'
import { useAuthStore } from './useAuthStore'

import { getTier, getNextTier, getTierProgress, TIERS, type Tier } from '../lib/tiers'

interface PointsState {
  spendablePoints: number
  lifetimePoints: number
  prestigeUnlocked: boolean
  currentTier: Tier
  nextTier: Tier | null
  tierProgress: number
  transactions: PointTransaction[]
  isLoading: boolean
  pendingLoads: number
  error: string | null

  loadTransactions: (limit?: number) => Promise<void>
  loadTotalPoints: () => Promise<void>
  subscribeToChanges: () => () => void
}

export const usePointsStore = create<PointsState>((set) => ({
  spendablePoints: 0,
  lifetimePoints: 0,
  prestigeUnlocked: false,
  currentTier: TIERS[0],
  nextTier: TIERS[1],
  tierProgress: 0,
  transactions: [],
  isLoading: false,
  pendingLoads: 0,
  error: null,

  loadTransactions: async (limit?: number) => {
    const user = useAuthStore.getState().user
    if (!user) return
    set((s) => ({ pendingLoads: s.pendingLoads + 1, isLoading: true, error: null }))
    try {
      // Server clamps to [1, 200]; pass a small limit where only a preview is shown.
      const qs = limit != null ? `?limit=${limit}` : ''
      const data = await apiFetch<PointTransaction[]>(`/api/points/transactions${qs}`)
      set({ transactions: data })
    } catch (err) {
      set({ transactions: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set((s) => {
        const remaining = s.pendingLoads - 1
        return { pendingLoads: remaining, isLoading: remaining > 0 }
      })
    }
  },

  loadTotalPoints: async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    set((s) => ({ pendingLoads: s.pendingLoads + 1, isLoading: true, error: null }))
    try {
      let spendablePoints: number
      let lifetimePoints: number

      const summary = await apiFetch<{ spendable_points: number; lifetime_points: number }>(
        '/api/points/summary',
      )
      spendablePoints = summary.spendable_points
      lifetimePoints  = summary.lifetime_points

      set({
        spendablePoints,
        lifetimePoints,
        prestigeUnlocked: lifetimePoints >= 3000,
        currentTier:  getTier(lifetimePoints),
        nextTier:     getNextTier(lifetimePoints),
        tierProgress: getTierProgress(lifetimePoints),
      })

      // Sync with useAuthStore so components using useAuthStore.user see the new points
      const authUser = useAuthStore.getState().user
      if (authUser && authUser.id === user.id) {
        useAuthStore.setState({
          user: { ...authUser, spendable_points: spendablePoints, lifetime_points: lifetimePoints } as Profile,
        })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set((s) => {
        const remaining = s.pendingLoads - 1
        return { pendingLoads: remaining, isLoading: remaining > 0 }
      })
    }
  },

  // Neutralized 2026-06-14: the always-on `point_transactions` realtime sub was
  // removed to cut connection pressure. Points refresh via polling — recover() in
  // the layouts calls loadTotalPoints/loadTransactions on focus / online / 60 s,
  // and after any action that awards points. Git history has the original handler.
  subscribeToChanges: () => {
    return () => {}
  },
}))
