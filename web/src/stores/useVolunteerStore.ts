import { create } from 'zustand'
import type { VolunteerApplication } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
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
      const { data, error } = await supabase
        .from('volunteer_applications')
        .select('*')
        .eq('user_id', user.id)
        .order('applied_at', { ascending: false })
      if (error) throw error
      set({ applications: (data ?? []) as VolunteerApplication[] })
    } catch (err) {
      set({ applications: [], error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  applyToVolunteer: async (eventId, data) => {
    const user = useAuthStore.getState().user
    if (!user) return { success: false, error: 'Not authenticated' }

    const { error } = await supabase
      .from('volunteer_applications')
      .insert({
        event_id: eventId,
        user_id: user.id,
        reason: data.reason,
        phone_number: data.phone_number ?? null,
        social_media_handle: data.social_media_handle ?? null,
      })
    if (error) {
      return { success: false, error: error.message }
    }

    // Refresh applications list after successful insert
    await get().loadApplications()

    return { success: true }
  },

  getApplicationByEventId: (eventId) => {
    return get().applications.find((a) => a.event_id === eventId)
  },
}))
