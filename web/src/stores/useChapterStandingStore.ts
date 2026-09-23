import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export type ChapterStandingStatus = 'ranked' | 'unranked' | 'no-events'

export interface ChapterStanding {
  chapterId: string
  chapter: string
  region: string | null
  rank: number | null
  status: ChapterStandingStatus
  /** Percentage to one decimal place; null when the rate is undefined — no events, or no eligible members. */
  participationRate: number | null
  eligibleMembers: number
  participants: number
  events: number
  checkIns: number
  avgPerEvent: number
  approvedRegistrations: number
  showUpRate: number | null
  newMembers: number
  /** Points earned this season (reset and redemption ledger rows excluded). */
  xp: number
  /** Sum of chapter members' lifetime points, HQ staff excluded. */
  totalPoints: number
  computedAt: string
}

export interface StandingsResponse {
  standings: ChapterStanding[]
  computedAt: string
}

interface ChapterStandingState {
  standings: ChapterStanding[]
  standingsComputedAt: string | null
  standingsLoading: boolean
  standingsError: string | null
  loadStandings: () => Promise<void>
  reset: () => void
}

export const useChapterStandingStore = create<ChapterStandingState>((set) => ({
  standings: [],
  standingsComputedAt: null,
  standingsLoading: false,
  standingsError: null,

  loadStandings: async () => {
    set({ standingsLoading: true, standingsError: null })
    try {
      const data = await apiFetch<StandingsResponse>('/api/chapters/standings')
      set({ standings: data.standings, standingsComputedAt: data.computedAt })
    } catch (err) {
      set({ standings: [], standingsComputedAt: null, standingsError: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ standingsLoading: false })
    }
  },

  reset: () => set({ standings: [], standingsComputedAt: null, standingsLoading: false, standingsError: null }),
}))
