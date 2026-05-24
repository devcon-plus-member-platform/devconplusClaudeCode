import { create } from 'zustand'
import type { Mission, MissionParticipant, MissionSubmission } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
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

    // Cache-first: if already loading, or if we have data and it's fresh (< 5 mins), skip
    const isFresh = lastFetched && (Date.now() - lastFetched < 300000)
    if (isLoading || (isFresh && missions.length > 0 && !force)) return

    // Only fetch user-specific rows when authenticated (MemberLayout guards for !user)
    const userId = useAuthStore.getState().user?.id
    if (!userId) return

    set({ isLoading: true, error: null })
    try {
      const [mRes, pRes, sRes] = await Promise.all([
        supabase.from('missions').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(50),
        supabase.from('mission_participants').select('*').eq('user_id', userId).limit(100),
        supabase.from('mission_submissions').select('*').eq('user_id', userId).limit(100),
      ])
      if (mRes.error) throw mRes.error
      set({
        missions:     (mRes.data ?? []) as Mission[],
        participants: (pRes.data ?? []) as MissionParticipant[],
        submissions:  (sRes.data ?? []) as MissionSubmission[],
        lastFetched:  Date.now(),
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      set({ isLoading: false })
    }
  },

  startMission: async (missionId, userId) => {
    const { error } = await supabase
      .from('mission_participants')
      .insert({ mission_id: missionId, user_id: userId })
    if (error) throw error
    // Optimistic — real-time will also arrive but dedup guard handles that
    set((s) => ({
      participants: s.participants.some(
        (p) => p.mission_id === missionId && p.user_id === userId
      )
        ? s.participants
        : [...s.participants, { mission_id: missionId, user_id: userId, joined_at: new Date().toISOString() }],
    }))
  },

  submitMission: async (missionId, userId, link) => {
    const existing = get().submissions.find(
      (s) => s.mission_id === missionId && s.user_id === userId
    )
    const now = new Date().toISOString()
    if (existing) {
      const { error } = await supabase
        .from('mission_submissions')
        .update({ pr_link: link, submitted_at: now })
        .eq('id', existing.id)
      if (error) throw error
      set((s) => ({
        submissions: s.submissions.map((sub) =>
          sub.id === existing.id ? { ...sub, pr_link: link, submitted_at: now } : sub
        ),
      }))
    } else {
      const { data, error } = await supabase
        .from('mission_submissions')
        .insert({ mission_id: missionId, user_id: userId, pr_link: link })
        .select()
        .single()
      if (error) throw error
      set((s) => ({ submissions: [...s.submissions, data as MissionSubmission] }))
    }
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

