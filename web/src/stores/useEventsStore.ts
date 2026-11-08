import { create } from 'zustand'
import type {
  Event,
  EventCategory,
  EventCapacitySummary,
  EventListItem,
  DevconCategory,
  Json,
  MyRegistration,
  Paginated,
} from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
import { apiFetch, fetchAllPages, publicFetch } from '../lib/api'
import { isEventArchived } from '../lib/dates'

/** Page size for past events, which grow forever and so are loaded on demand. */
export const PAST_EVENTS_PAGE_SIZE = 50

/**
 * Every event the caller may manage, as full rows (GET /api/events/manage,
 * paged through to `total`). Chapter officers get their own chapter; HQ and
 * super admins get every chapter. Used by the organizer and admin screens.
 */
export function fetchAllManagedEvents(): Promise<Event[]> {
  return fetchAllPages((offset, limit) =>
    apiFetch<Paginated<Event>>(`/api/events/manage?limit=${limit}&offset=${offset}`),
  )
}

/** Every upcoming (not yet ended, or date TBA) event, as list items. */
function fetchAllUpcomingEvents(): Promise<EventListItem[]> {
  return fetchAllPages((offset, limit) =>
    publicFetch<Paginated<EventListItem>>(`/api/events?scope=upcoming&limit=${limit}&offset=${offset}`),
  )
}

/** Keeps a list item in the upcoming list only while the event hasn't ended. */
function upsertUpcoming(list: EventListItem[], event: EventListItem): EventListItem[] {
  const rest = list.filter((e) => e.id !== event.id)
  return isEventArchived(event) ? rest : sortByEventDate([...rest, event])
}

/** Drops the cached full event (by slug) whose id matches. */
function withoutDetail(bySlug: Record<string, Event>, id: string): Record<string, Event> {
  return Object.fromEntries(Object.entries(bySlug).filter(([, e]) => e.id !== id))
}

// Monotonic counter to generate unique channel names on every subscribe call.
// supabase.channel(name) deduplicates by name — returning the same (possibly
// stale) channel if the previous removal hasn't resolved yet. Unique names
// guarantee a fresh channel object regardless of async cleanup timing.
let _chanSeq = 0
const nextChan = (base: string) => `${base}-${++_chanSeq}`

// A member's registration with its event attached (GET /api/registrations/mine).
type FullRegistration = MyRegistration

// Sort ascending by event_date — reused across create, update, and realtime inserts
function sortByEventDate<T extends Pick<Event, 'event_date'>>(events: T[]): T[] {
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
  no_show_buffer?: number
  registration_closed?: boolean
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
  no_show_buffer?: number
  registration_closed?: boolean
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
  /**
   * Every upcoming event (not yet ended, or date TBA), soonest first, as list
   * items. Complete — fetched page by page until the server's `total` — because
   * the member screens search and filter it in the browser.
   */
  events: EventListItem[]
  /** Past events, most recent first, loaded a page at a time (see loadMorePastEvents). */
  pastEvents: EventListItem[]
  /** Server-side count of past events; null until the first past page loads. */
  pastEventsTotal: number | null
  isPastLoading: boolean
  /** Full rows of every event the signed-in organizer/admin may manage. */
  managedEvents: Event[]
  isManagedLoading: boolean
  managedError: string | null
  /** Full events fetched one at a time for the event pages, keyed by slug. */
  eventsBySlug: Record<string, Event>
  registrations: FullRegistration[]
  isLoading: boolean
  error: string | null

  fetchEvents: () => Promise<void>
  fetchPastEvents: () => Promise<void>
  loadMorePastEvents: () => Promise<void>
  fetchManagedEvents: () => Promise<void>
  /** Loads one full event by slug into eventsBySlug; resolves null if it can't be loaded. */
  fetchEventBySlug: (slug: string) => Promise<Event | null>
  createEvent: (payload: CreateEventPayload) => Promise<Event>
  deleteEvent: (id: string) => Promise<void>
  updateEvent: (id: string, payload: UpdateEventPayload) => Promise<Event>
  fetchEventCapacity: (eventId: string) => Promise<EventCapacitySummary>
  subscribeToChanges: () => () => void
  fetchRegistrations: (userId: string) => Promise<void>
  register: (
    eventId: string,
    userId: string,
    formResponses?: Record<string, string | string[]>
  ) => Promise<void>
  cancelRegistration: (regId: string) => Promise<void>
  subscribeToRegistration: (
    registrationId: string,
    onStatusChange: (status: 'approved' | 'rejected', reg: FullRegistration) => void
  ) => () => void
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  pastEvents: [],
  pastEventsTotal: null,
  isPastLoading: false,
  managedEvents: [],
  isManagedLoading: false,
  managedError: null,
  eventsBySlug: {},
  registrations: [],
  isLoading: false,
  error: null,

  fetchEvents: async () => {
    set((s) => ({ isLoading: s.events.length === 0, error: null }))
    try {
      const data = await fetchAllUpcomingEvents()
      set({ events: sortByEventDate(data) })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  // First page of past events — also used to refresh what's already shown.
  fetchPastEvents: async () => {
    set({ isPastLoading: true })
    try {
      const page = await publicFetch<Paginated<EventListItem>>(
        `/api/events?scope=past&limit=${PAST_EVENTS_PAGE_SIZE}&offset=0`,
      )
      set({ pastEvents: page.rows, pastEventsTotal: page.total })
    } catch {
      // Past events are supplementary — keep whatever is already shown.
    } finally {
      set({ isPastLoading: false })
    }
  },

  // Next page of past events, appended (de-duplicated by id).
  loadMorePastEvents: async () => {
    const { pastEvents, pastEventsTotal, isPastLoading } = get()
    if (isPastLoading || (pastEventsTotal !== null && pastEvents.length >= pastEventsTotal)) return
    set({ isPastLoading: true })
    try {
      const page = await publicFetch<Paginated<EventListItem>>(
        `/api/events?scope=past&limit=${PAST_EVENTS_PAGE_SIZE}&offset=${pastEvents.length}`,
      )
      set((s) => {
        const seen = new Set(s.pastEvents.map((e) => e.id))
        return {
          pastEvents: [...s.pastEvents, ...page.rows.filter((e) => !seen.has(e.id))],
          pastEventsTotal: page.total,
        }
      })
    } catch {
      // Leave the list as is; the next tap retries.
    } finally {
      set({ isPastLoading: false })
    }
  },

  fetchManagedEvents: async () => {
    set((s) => ({ isManagedLoading: s.managedEvents.length === 0, managedError: null }))
    try {
      const data = await fetchAllManagedEvents()
      set({ managedEvents: sortByEventDate(data) })
    } catch (err) {
      set({ managedError: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isManagedLoading: false })
    }
  },

  fetchEventBySlug: async (slug) => {
    try {
      const event = await publicFetch<Event>(`/api/events/slug/${encodeURIComponent(slug)}`)
      set((s) => ({ eventsBySlug: { ...s.eventsBySlug, [slug]: event } }))
      return event
    } catch {
      return null
    }
  },

  createEvent: async (payload) => {
    const newEvent = await apiFetch<Event>('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    set((s) => ({
      events: upsertUpcoming(s.events, newEvent),
      managedEvents: sortByEventDate([...s.managedEvents, newEvent]),
      eventsBySlug: { ...s.eventsBySlug, [newEvent.slug]: newEvent },
    }))
    return newEvent
  },

  deleteEvent: async (id) => {
    // Server cascades event_registrations deletion before removing the event.
    await apiFetch<void>(`/api/events/${id}`, { method: 'DELETE' })
    set((s) => ({
      events: s.events.filter((e) => e.id !== id),
      pastEvents: s.pastEvents.filter((e) => e.id !== id),
      managedEvents: s.managedEvents.filter((e) => e.id !== id),
      eventsBySlug: withoutDetail(s.eventsBySlug, id),
    }))
  },

  updateEvent: async (id, payload) => {
    const updated = await apiFetch<Event>(`/api/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    set((s) => ({
      events: upsertUpcoming(s.events, updated),
      pastEvents: s.pastEvents.map((e) => (e.id === id ? updated : e)),
      managedEvents: sortByEventDate(s.managedEvents.map((e) => (e.id === id ? updated : e))),
      eventsBySlug: { ...withoutDetail(s.eventsBySlug, id), [updated.slug]: updated },
    }))
    return updated
  },

  fetchEventCapacity: (eventId) => {
    return publicFetch<EventCapacitySummary>(`/api/events/${eventId}/capacity`)
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

  register: async (eventId, _userId, formResponses) => {
    // _userId is ignored — server derives userId from the token.
    const { events, eventsBySlug } = useEventsStore.getState()
    const event =
      events.find((e) => e.id === eventId) ??
      Object.values(eventsBySlug).find((e) => e.id === eventId)
    if (event?.is_external) {
      throw new Error('This event uses external registration.')
    }
    // Custom-question answers travel WITH the registration. They must not be
    // patched in afterwards from the browser: members hold no RLS grant to
    // update their own registration row, so that write is silently rejected.
    const data = await apiFetch<FullRegistration>('/api/registrations', {
      method: 'POST',
      body: JSON.stringify(
        formResponses && Object.keys(formResponses).length > 0
          ? { eventId, formResponses }
          : { eventId }
      ),
    })
    // Server handles re-registration logic — just update local state. The POST
    // response has no event attached, so carry over the one we already know.
    set((s) => {
      const previous = s.registrations.find((r) => r.id === data.id)
      const withEvent: FullRegistration = { ...data, event: data.event ?? previous?.event ?? event ?? null }
      return {
        registrations: previous
          ? s.registrations.map((r) => (r.id === data.id ? withEvent : r))
          : [...s.registrations, withEvent],
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
