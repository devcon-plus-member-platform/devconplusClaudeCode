import { create } from 'zustand'
import { apiFetch } from '../lib/api'

export type ChapterStandingStatus = 'ranked' | 'unranked' | 'no-events'

export interface ChapterStanding {
  chapterId: string
  chapter: string
  region: string | null
  rank: number | null
  status: ChapterStandingStatus
  participationRate: number | null
  eligibleMembers: number
  participants: number
  events: number
  checkIns: number
  avgPerEvent: number
  approvedRegistrations: number
  showUpRate: number | null
  newMembers: number
  xp: number
  computedAt: string
}

export interface StandingsResponse {
  standings: ChapterStanding[]
  computedAt: string
}

interface ChapterStandingState {
  standing: ChapterStanding | null
  loading: boolean
  error: string | null
  loadMyChapter: (chapterId: string) => Promise<void>
  standings: ChapterStanding[]
  standingsComputedAt: string | null
  standingsLoading: boolean
  standingsError: string | null
  loadStandings: () => Promise<void>
  reset: () => void
}

export const useChapterStandingStore = create<ChapterStandingState>((set) => ({
  standing: null,
  loading: false,
  error: null,

  loadMyChapter: async (chapterId) => {
    set({ loading: true, error: null })
    try {
      const data = await apiFetch<ChapterStanding>(`/api/chapters/${chapterId}/standing`)
      set({ standing: data })
    } catch (err) {
      set({ standing: null, error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

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

  reset: () => set({ standing: null, loading: false, error: null, standings: [], standingsComputedAt: null, standingsLoading: false, standingsError: null }),
}))
