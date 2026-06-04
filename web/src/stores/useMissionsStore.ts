import { create } from 'zustand'
import type { Mission, MissionParticipant, MissionSubmission } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useAuthStore } from './useAuthStore'

let _chanSeq = 0
const nextChan = (base: string) => `${base}-${++_chanSeq}`

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

  subscribeToChanges: () => {
    const userId = useAuthStore.getState().user?.id
    const userFilter = userId ? { filter: `user_id=eq.${userId}` } : {}
    const channel = supabase
      .channel(nextChan('missions-realtime'))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mission_participants', ...userFilter },
        (payload: { new: MissionParticipant }) => {
          const row = payload.new
          set((s) => ({
            participants: s.participants.some(
              (p) => p.mission_id === row.mission_id && p.user_id === row.user_id
            )
              ? s.participants
              : [...s.participants, row],
          }))
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'mission_participants', ...userFilter },
        (payload: { old: Partial<MissionParticipant> }) => {
          const row = payload.old
          set((s) => ({
            participants: s.participants.filter(
              (p) => !(p.mission_id === row.mission_id && p.user_id === row.user_id)
            ),
          }))
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mission_submissions', ...userFilter },
        (payload: { new: MissionSubmission }) => {
          const row = payload.new
          set((s) => ({
            submissions: s.submissions.some((sub) => sub.id === row.id)
              ? s.submissions
              : [...s.submissions, row],
          }))
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mission_submissions', ...userFilter },
        (payload: { new: MissionSubmission }) => {
          const row = payload.new
          set((s) => ({
            submissions: s.submissions.map((sub) => (sub.id === row.id ? row : sub)),
          }))
        }
      )
      // missions table UPDATE is unfiltered — watches for admin activation changes (small table)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'missions' },
        (payload: { new: Mission }) => {
          const row = payload.new
          set((s) => ({
            missions: s.missions.map((m) => (m.id === row.id ? row : m)),
          }))
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[missions-realtime] channel error', status, err)
        }
      })
    return () => { void supabase.removeChannel(channel) }
  },
}))

