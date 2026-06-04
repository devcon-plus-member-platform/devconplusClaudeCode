import { create } from 'zustand'
import type { VolunteerApplication } from '@devcon-plus/supabase'
import { apiFetch } from '../lib/api'
import { useAuthStore } from './useAuthStore'

interface VolunteerApplyData {
  reason: string
  phone_number?: string
  social_media_handle?: string
}

interface VolunteerState {
  applications: VolunteerApplication[]
  loading: boolean
  error: string | null

  loadApplications: () => Promise<void>
  applyToVolunteer: (
    eventId: string,
    data: VolunteerApplyData
  ) => Promise<{ success: boolean; error?: string }>
  getApplicationByEventId: (eventId: string) => VolunteerApplication | undefined
}

export const useVolunteerStore = create<VolunteerState>((set, get) => ({
  applications: [],
  loading: false,
  error: null,

  loadApplications: async () => {
    const user = useAuthStore.getState().user
    if (!user) return
    set({ loading: true, error: null })
    try {
      const data = await apiFetch<VolunteerApplication[]>('/api/volunteers/me')
      set({ applications: data })
    } catch (err) {
      set({ applications: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  applyToVolunteer: async (eventId, data) => {
    const user = useAuthStore.getState().user
    if (!user) return { success: false, error: 'Not authenticated' }

    try {
      await apiFetch('/api/volunteers', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          reason:              data.reason,
          phone_number:        data.phone_number ?? undefined,
          social_media_handle: data.social_media_handle ?? undefined,
        }),
      })
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    await get().loadApplications()
    return { success: true }
  },

  getApplicationByEventId: (eventId) => {
    return get().applications.find((a) => a.event_id === eventId)
  },
}))
