import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useAuthStore } from './useAuthStore'

const USE_FIREBASE = import.meta.env.VITE_AUTH_PROVIDER === 'firebase'

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
    // chapterId param is unused in Firebase mode — the server derives chapter from the token.
    // Kept in the signature for legacy Supabase path compatibility.
    set({ loading: true, error: null })
    try {
      if (USE_FIREBASE) {
        const data = await apiFetch<OrgVolunteerApplication[]>('/api/volunteers/organizer')
        set({ applications: data })
      } else {
        const chapterId = _chapterId
        // Step 1: get event IDs belonging to this chapter
        const { data: eventRows, error: eventError } = await supabase
          .from('events')
          .select('id')
          .eq('chapter_id', chapterId)
        if (eventError) throw eventError

        const eventIds = (eventRows ?? []).map((e) => e.id)
        if (eventIds.length === 0) {
          set({ applications: [] })
          return
        }

        // Step 2: fetch applications filtered by those event IDs
        const { data, error } = await supabase
          .from('volunteer_applications')
          .select(`
            id,
            event_id,
            user_id,
            reason,
            phone_number,
            social_media_handle,
            status,
            applied_at,
            reviewed_at,
            reviewed_by,
            events(title),
            profiles!volunteer_applications_user_id_fkey(full_name, email, school_or_company)
          `)
          .in('event_id', eventIds)
          .order('applied_at', { ascending: false })
        if (error) throw error

        const mapped: OrgVolunteerApplication[] = (data ?? []).map((row) => {
          const ev = Array.isArray(row.events) ? row.events[0] : row.events
          const p  = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
          const evObj = ev as { title?: string } | null
          const pObj  = p  as { full_name?: string; email?: string; school_or_company?: string } | null
          return {
            id:                  row.id,
            event_id:            row.event_id ?? '',
            event_title:         evObj?.title ?? '',
            user_id:             row.user_id ?? '',
            member_name:         pObj?.full_name ?? 'Unknown',
            member_email:        pObj?.email ?? '',
            school_or_company:   pObj?.school_or_company ?? '',
            reason:              row.reason,
            phone_number:        row.phone_number ?? null,
            social_media_handle: row.social_media_handle ?? null,
            status:              row.status as OrgVolunteerApplication['status'],
            applied_at:          row.applied_at ?? null,
            reviewed_at:         row.reviewed_at ?? null,
            reviewed_by:         row.reviewed_by ?? null,
          }
        })
        set({ applications: mapped })
      }
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

    if (USE_FIREBASE) {
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
    }

    // Legacy Supabase path — calls RPC directly
    const { data, error } = await supabase
      .rpc('approve_volunteer_application', {
        p_application_id: id,
        p_organizer_id:   reviewerId,
      })
    if (error) {
      set({ error: error.message })
      return { success: false, error: error.message }
    }
    const result = data as { success: boolean; error?: string } | null
    if (!result?.success) {
      const errorMsg = result?.error ?? 'RPC failed'
      set({ error: errorMsg })
      return { success: false, error: errorMsg }
    }
    set((s) => ({
      applications: s.applications.map((a) =>
        a.id === id
          ? { ...a, status: 'approved' as const, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }
          : a
      ),
    }))
    return { success: true }
  },

  rejectApplication: async (id) => {
    const reviewerId = useAuthStore.getState().user?.id
    if (!reviewerId) {
      set({ error: 'Not authenticated' })
      return { success: false, error: 'Not authenticated' }
    }
    set({ error: null })

    if (USE_FIREBASE) {
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
    }

    // Legacy Supabase path
    const { error } = await supabase
      .from('volunteer_applications')
      .update({
        status:      'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) {
      set({ error: error.message })
      return { success: false, error: error.message }
    }
    set((s) => ({
      applications: s.applications.map((a) =>
        a.id === id
          ? { ...a, status: 'rejected' as const, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }
          : a
      ),
    }))
    return { success: true }
  },

  revertApplication: async (id) => {
    const reviewerId = useAuthStore.getState().user?.id
    if (!reviewerId) {
      set({ error: 'Not authenticated' })
      return { success: false, error: 'Not authenticated' }
    }
    set({ error: null })

    if (USE_FIREBASE) {
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
    }

    // Legacy Supabase path
    const { error } = await supabase
      .from('volunteer_applications')
      .update({ status: 'pending', reviewed_by: null, reviewed_at: null })
      .eq('id', id)
    if (error) {
      set({ error: error.message })
      return { success: false, error: error.message }
    }
    set((s) => ({
      applications: s.applications.map((a) =>
        a.id === id
          ? { ...a, status: 'pending' as const, reviewed_by: null, reviewed_at: null }
          : a
      ),
    }))
    return { success: true }
  },
}))
