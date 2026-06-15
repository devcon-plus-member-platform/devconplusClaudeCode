import { create } from 'zustand'
import { apiFetch } from '../lib/api'
import { useAuthStore } from './useAuthStore'

export interface OrgVolunteerApplication {
  id: string
  event_id: string
  event_title: string
  user_id: string
  member_name: string
  member_email: string
  school_or_company: string
  reason: string
  phone_number: string | null
  social_media_handle: string | null
  status: 'pending' | 'approved' | 'rejected'
  applied_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
}

interface OrgVolunteerState {
  applications: OrgVolunteerApplication[]
  loading: boolean
  error: string | null
  loadApplications: (chapterId: string) => Promise<void>
  approveApplication: (id: string) => Promise<{ success: boolean; error?: string }>
  rejectApplication: (id: string) => Promise<{ success: boolean; error?: string }>
  revertApplication: (id: string) => Promise<{ success: boolean; error?: string }>
}

export const useOrgVolunteerStore = create<OrgVolunteerState>((set) => ({
  applications: [],
  loading: false,
  error: null,

  loadApplications: async (_chapterId) => {
    // _chapterId is ignored — the server derives the chapter from the token.
    set({ loading: true, error: null })
    try {
      const data = await apiFetch<OrgVolunteerApplication[]>('/api/volunteers/organizer')
      set({ applications: data })
    } catch (err) {
      set({ applications: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  approveApplication: async (id) => {
    const reviewerId = useAuthStore.getState().user?.id
    if (!reviewerId) {
      set({ error: 'Not authenticated' })
      return { success: false, error: 'Not authenticated' }
    }
    set({ error: null })

    try {
      await apiFetch(`/api/volunteers/${id}/approve`, { method: 'POST' })
      set((s) => ({
        applications: s.applications.map((a) =>
          a.id === id
            ? { ...a, status: 'approved' as const, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }
            : a
        ),
      }))
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed'
      set({ error: msg })
      return { success: false, error: msg }
    }
  },

  rejectApplication: async (id) => {
    const reviewerId = useAuthStore.getState().user?.id
    if (!reviewerId) {
      set({ error: 'Not authenticated' })
      return { success: false, error: 'Not authenticated' }
    }
    set({ error: null })

    try {
      await apiFetch(`/api/volunteers/${id}/reject`, { method: 'POST' })
      set((s) => ({
        applications: s.applications.map((a) =>
          a.id === id
            ? { ...a, status: 'rejected' as const, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }
            : a
        ),
      }))
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rejection failed'
      set({ error: msg })
      return { success: false, error: msg }
    }
  },

  revertApplication: async (id) => {
    const reviewerId = useAuthStore.getState().user?.id
    if (!reviewerId) {
      set({ error: 'Not authenticated' })
      return { success: false, error: 'Not authenticated' }
    }
    set({ error: null })

    try {
      await apiFetch(`/api/volunteers/${id}/revert`, { method: 'POST' })
      set((s) => ({
        applications: s.applications.map((a) =>
          a.id === id
            ? { ...a, status: 'pending' as const, reviewed_by: null, reviewed_at: null }
            : a
        ),
      }))
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Revert failed'
      set({ error: msg })
      return { success: false, error: msg }
    }
  },
}))
