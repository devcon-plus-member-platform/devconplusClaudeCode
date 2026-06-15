import { create } from 'zustand'
import type { Mission, MissionParticipant, MissionSubmission } from '@devcon-plus/supabase'
import { apiFetch } from '../lib/api'
import { useAuthStore } from './useAuthStore'

interface MissionsState {
  missions: Mission[]
  participants: MissionParticipant[]
  submissions: MissionSubmission[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: (force?: boolean) => Promise<void>
  startMission: (missionId: string, userId: string) => Promise<void>
  submitMission: (missionId: string, userId: string, link: string) => Promise<void>
  subscribeToChanges: () => () => void
}

export const useMissionsStore = create<MissionsState>((set, get) => ({
  missions: [],
  participants: [],
  submissions: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchAll: async (force = false) => {
    const { isLoading, lastFetched, missions } = get()

    const isFresh = lastFetched && (Date.now() - lastFetched < 300000)
    if (isLoading || (isFresh && missions.length > 0 && !force)) return

    const userId = useAuthStore.getState().user?.id
    if (!userId) return

    set({ isLoading: true, error: null })
    try {
      const data = await apiFetch<{
        missions: Mission[]
        participants: MissionParticipant[]
        submissions: MissionSubmission[]
      }>('/api/missions')
      set({ missions: data.missions, participants: data.participants, submissions: data.submissions, lastFetched: Date.now() })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  startMission: async (missionId, _userId) => {
    // _userId is ignored — server derives it from the token.
    const data = await apiFetch<MissionParticipant>(`/api/missions/${missionId}/start`, { method: 'POST' })
    set((s) => ({
      participants: s.participants.some((p) => p.mission_id === data.mission_id && p.user_id === data.user_id)
        ? s.participants
        : [...s.participants, data],
    }))
  },

  submitMission: async (missionId, _userId, link) => {
    // _userId is ignored — server derives it from the token.
    const data = await apiFetch<MissionSubmission>(`/api/missions/${missionId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ link }),
    })
    set((s) => {
      const exists = s.submissions.some((sub) => sub.id === data.id)
      return {
        submissions: exists
          ? s.submissions.map((sub) => (sub.id === data.id ? data : sub))
          : [...s.submissions, data],
      }
    })
  },

  // Disabled 2026-06-12: missions, mission_participants and mission_submissions
  // were removed from the supabase_realtime publication to cut WAL load (see
  // supabase/diagnostics/FINDINGS.md). Live participant/submission counts are
  // nice-to-have, not essential — the data refetches on mount/recovery. To
  // restore, re-add those tables to the publication and revert this body (git
  // history has the original per-table INSERT/UPDATE/DELETE handlers).
  subscribeToChanges: () => {
    return () => {}
  },
}))

