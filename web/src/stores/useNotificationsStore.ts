import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'

let _chanSeq = 0
const nextChan = (base: string) => `${base}-${++_chanSeq}`
import { toast } from 'sonner'

export interface Notification {
  id: string
  event_id: string
  event_title: string
  message: string
  created_at: string
  read: boolean
}

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  fetchRecent: (approvedIds: string[], eventTitles: Record<string, string>) => Promise<void>
  subscribe: (approvedIds: string[], eventTitles: Record<string, string>) => () => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clearAll: () => void
}

interface AnnouncementRow {
  id: string
  event_id: string
  message: string
  created_at: string | null
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchRecent: async (approvedIds, eventTitles) => {
    // No approved events → nothing to load; resolve to the empty state, never stay loading.
    if (approvedIds.length === 0) {
      set({ isLoading: false })
      return
    }

    // Show a loading state only on the first load (no cached notifications yet),
    // mirroring the other data stores — avoids a skeleton flash on recovery refetches.
    set((s) => ({ isLoading: s.notifications.length === 0 }))

    let data: AnnouncementRow[] | null = null

    try {
      data = await apiFetch<AnnouncementRow[]>(
        `/api/announcements?event_ids=${encodeURIComponent(approvedIds.join(','))}`
      )
    } catch (err) {
      console.warn('[fetchRecent] failed:', err instanceof Error ? err.message : String(err))
      set({ isLoading: false })
      return
    }

    if (!data) {
      set({ isLoading: false })
      return
    }
    const notifications: Notification[] = data.map((row) => ({
      id: row.id,
      event_id: row.event_id,
      message: row.message,
      created_at: row.created_at ?? new Date().toISOString(),
      event_title: eventTitles[row.event_id] ?? 'Event',
      read: false,
    }))
    set({ notifications, unreadCount: notifications.length, isLoading: false })
  },

  subscribe: (approvedIds, eventTitles) => {
    if (approvedIds.length === 0) return () => {}
    const approvedSet = new Set(approvedIds)
    const channel = supabase
      .channel(nextChan('member-announcements'))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_announcements',
          // No filter — Supabase Realtime postgres_changes does not reliably
          // support the `in` operator. Filter in the handler instead.
        },
        (payload) => {
          const row = payload.new as {
            id: string
            event_id: string
            message: string
            created_at: string | null
          }
          // Drop announcements for events the user is not registered to
          if (!approvedSet.has(row.event_id)) return
          const eventTitle = eventTitles[row.event_id] ?? 'Event'
          const notification: Notification = {
            id: row.id,
            event_id: row.event_id,
            event_title: eventTitle,
            message: row.message,
            created_at: row.created_at ?? new Date().toISOString(),
            read: false,
          }
          set((state) => ({
            notifications: [notification, ...state.notifications],
            unreadCount: state.unreadCount + 1,
          }))
          const preview = row.message.length > 60
            ? `${row.message.slice(0, 60)}…`
            : row.message
          toast.info(`${eventTitle}: ${preview}`)
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[member-announcements] channel error:', err)
        } else if (status === 'TIMED_OUT') {
          console.warn('[member-announcements] timed out — Supabase will retry')
        }
      })

    return () => { void supabase.removeChannel(channel) }
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  dismiss: (id) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === id)
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: target && !target.read
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      }
    }),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}))
