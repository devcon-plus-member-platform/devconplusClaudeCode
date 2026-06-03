import { create } from 'zustand'
import type { PointTransaction, Profile } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useAuthStore } from './useAuthStore'

const USE_FIREBASE = import.meta.env.VITE_AUTH_PROVIDER === 'firebase'
import { getTier, getNextTier, getTierProgress, TIERS, type Tier } from '../lib/tiers'

// Monotonic counter to generate unique channel names on every subscribe call.
let _chanSeq = 0
const nextChan = (base: string) => `${base}-${++_chanSeq}`

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

  loadTransactions: () => Promise<void>
  loadTotalPoints: () => Promise<void>
  subscribeToChanges: () => () => void
}

export const usePointsStore = create<PointsState>((set, get) => ({
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

  loadTransactions: async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    set((s) => ({ pendingLoads: s.pendingLoads + 1, isLoading: true, error: null }))
    try {
      if (USE_FIREBASE) {
        const data = await apiFetch<PointTransaction[]>('/api/points/transactions')
        set({ transactions: data })
      } else {
        const { data, error } = await supabase
          .from('point_transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        if (error) throw error
        set({ transactions: (data ?? []) as PointTransaction[] })
      }
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

      if (USE_FIREBASE) {
        const summary = await apiFetch<{ spendable_points: number; lifetime_points: number }>(
          '/api/points/summary',
        )
        spendablePoints = summary.spendable_points
        lifetimePoints  = summary.lifetime_points
      } else {
        const { data, error } = await supabase
          .from('profiles')
          .select('spendable_points, lifetime_points')
          .eq('id', user.id)
          .single()
        if (error) throw error
        spendablePoints = data?.spendable_points ?? 0
        lifetimePoints  = data?.lifetime_points  ?? 0
      }

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

  subscribeToChanges: () => {
    const user = useAuthStore.getState().user
    if (!user) return () => {}

    const channel = supabase
      .channel(nextChan('points-realtime'))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'point_transactions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // New transaction — refresh both list and totals
          void get().loadTransactions()
          void get().loadTotalPoints()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          // Profile updated (points changed via trigger or admin)
          const updated = payload.new as Profile
          if (updated.spendable_points !== undefined || updated.lifetime_points !== undefined) {
            void get().loadTotalPoints()
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[points-realtime] channel error:', err)
        } else if (status === 'TIMED_OUT') {
          console.warn('[points-realtime] timed out — Supabase will retry')
        }
      })

    return () => { void supabase.removeChannel(channel) }
  },
}))
