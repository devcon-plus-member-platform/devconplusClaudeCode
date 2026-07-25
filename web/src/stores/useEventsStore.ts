import { create } from 'zustand'
import type { Event, EventCategory, EventRegistration, DevconCategory, Json } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
import { apiFetch, publicFetch } from '../lib/api'

// Monotonic counter to generate unique channel names on every subscribe call.
// supabase.channel(name) deduplicates by name — returning the same (possibly
// stale) channel if the previous removal hasn't resolved yet. Unique names
// guarantee a fresh channel object regardless of async cleanup timing.
let _chanSeq = 0
const nextChan = (base: string) => `${base}-${++_chanSeq}`

// Alias — checked_in: boolean | null is already part of EventRegistration
type FullRegistration = EventRegistration

// Sort ascending by event_date — reused across create, update, and realtime inserts
function sortByEventDate(events: Event[]): Event[] {
  return [...events].sort(
    (a, b) =>
      new Date(a.event_date ?? 0).getTime() -
      new Date(b.event_date ?? 0).getTime()
  )
}

interface CreateEventPayload {
  title: string
  description: string
  location: string
  event_date: string
  end_date: string | null
  category: EventCategory
  devcon_category: DevconCategory | null
  tags: string[]
  visibility: 'public' | 'unlisted' | 'draft'
  is_free: boolean
  ticket_price_php: number
  capacity: number | null
  points_value: number
  volunteer_points: number
  requires_approval: boolean
  is_chapter_locked: boolean
  cover_image_url: string | null
  poster_image_url?: string | null
  is_external?: boolean
  external_registration_url?: string | null
  chapter_id: string | null
  /** JSONB: array of CustomFormField objects */
  custom_form_schema?: Json | null
}

export interface UpdateEventPayload {
  title?: string
  description?: string
  location?: string
  event_date?: string
  end_date?: string | null
  category?: EventCategory
  devcon_category?: DevconCategory | null
  tags?: string[]
  visibility?: 'public' | 'unlisted' | 'draft'
  is_free?: boolean
  ticket_price_php?: number
  capacity?: number | null
  points_value?: number
  volunteer_points?: number
  requires_approval?: boolean
  is_chapter_locked?: boolean
  cover_image_url?: string | null
  poster_image_url?: string | null
  is_external?: boolean
  external_registration_url?: string | null
  /** JSONB: array of CustomFormField objects */
  custom_form_schema?: Json | null
}

interface EventsState {
  events: Event[]
  registrations: FullRegistration[]
  isLoading: boolean
  error: string | null

  fetchEvents: () => Promise<void>
  createEvent: (payload: CreateEventPayload) => Promise<Event>
  deleteEvent: (id: string) => Promise<void>
  updateEvent: (id: string, payload: UpdateEventPayload) => Promise<Event>
  subscribeToChanges: () => () => void
  fetchRegistrations: (userId: string) => Promise<void>
  register: (eventId: string, userId: string) => Promise<void>
  cancelRegistration: (regId: string) => Promise<void>
  subscribeToRegistration: (
    registrationId: string,
    onStatusChange: (status: 'approved' | 'rejected', reg: FullRegistration) => void
  ) => () => void
}

export const useEventsStore = create<EventsState>((set) => ({
  events: [],
  registrations: [],
  isLoading: false,
  error: null,

  fetchEvents: async () => {
    set((s) => ({ isLoading: s.events.length === 0, error: null }))
    try {
      const data = await publicFetch<Event[]>('/api/events')
      set({ events: sortByEventDate(data) })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  createEvent: async (payload) => {
    const newEvent = await apiFetch<Event>('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    set((s) => ({ events: sortByEventDate([...s.events, newEvent]) }))
    return newEvent
  },

  deleteEvent: async (id) => {
    // Server cascades event_registrations deletion before removing the event.
    await apiFetch<void>(`/api/events/${id}`, { method: 'DELETE' })
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }))
  },

  updateEvent: async (id, payload) => {
    const updated = await apiFetch<Event>(`/api/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    set((s) => ({
      events: sortByEventDate(s.events.map((e) => (e.id === id ? updated : e))),
    }))
    return updated
  },

  // Neutralized 2026-06-14: the always-on, global, unfiltered `events` realtime
  // firehose was the single heaviest connection + fan-out cost (every session held
  // it for life). The events list now refreshes via polling — recover() in the
  // layouts (focus / online / 60 s interval) calls fetchEvents, and writes go
  // through the cached backend. Git history has the original INSERT/UPDATE/DELETE
  // handlers if Supabase Pro later lifts the 200-connection cap.
  subscribeToChanges: () => {
    return () => {}
  },

  fetchRegistrations: async (_userId) => {
    set((s) => ({ isLoading: s.registrations.length === 0, error: null }))
    try {
      const data = await apiFetch<FullRegistration[]>('/api/registrations/mine')
      set({ registrations: data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  register: async (eventId, _userId) => {
    // _userId is ignored — server derives userId from the token.
    const event = useEventsStore.getState().events.find((e) => e.id === eventId)
    if (event?.is_external) {
      throw new Error('This event uses external registration.')
    }
    const data = await apiFetch<FullRegistration>('/api/registrations', {
      method: 'POST',
      body: JSON.stringify({ eventId }),
    })
    // Server handles re-registration logic — just update local state
    set((s) => {
      const exists = s.registrations.some((r) => r.id === data.id)
      return {
        registrations: exists
          ? s.registrations.map((r) => (r.id === data.id ? data : r))
          : [...s.registrations, data],
      }
    })
  },

  cancelRegistration: async (regId) => {
    await apiFetch(`/api/registrations/${regId}/cancel`, { method: 'PATCH' })
    set((s) => ({
      registrations: s.registrations.map((r) =>
        r.id === regId
          ? { ...r, status: 'cancelled' as const, qr_code_token: null }
          : r
      ),
    }))
  },

  subscribeToRegistration: (registrationId, onStatusChange) => {
    const channel = supabase
      .channel(nextChan(`reg-${registrationId}`))
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'event_registrations',
          filter: `id=eq.${registrationId}::uuid`,
        },
        (payload) => {
          const updated = payload.new as FullRegistration
          if (updated.status === 'approved' || updated.status === 'rejected') {
            set((s) => ({
              registrations: s.registrations.map((r) =>
                r.id === registrationId ? { ...r, ...updated } : r
              ),
            }))
            onStatusChange(updated.status as 'approved' | 'rejected', updated)
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Best-effort: give up (don't retry) so we never storm Supabase past the
          // 200-connection cap. EventPending's 5 s poll of /registrations/mine
          // covers the approval/rejection flip when realtime is unavailable.
          console.warn(`[reg-${registrationId}] channel unavailable, falling back to polling:`, status, err)
          void supabase.removeChannel(channel)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  },

}))

// Selector helpers
export const getEventById = (id: string) =>
  useEventsStore.getState().events.find((e) => e.id === id)

export const getEventBySlug = (slug: string) =>
  useEventsStore.getState().events.find((e) => e.slug === slug)

export const getRegistrationByEventId = (eventId: string) =>
  useEventsStore.getState().registrations.find((r) => r.event_id === eventId)
