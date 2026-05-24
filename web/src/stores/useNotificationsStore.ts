// apps/member/src/stores/useNotificationsStore.ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

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
  fetchRecent: (approvedIds: string[], eventTitles: Record<string, string>) => Promise<void>
  subscribe: (approvedIds: string[], eventTitles: Record<string, string>) => () => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clearAll: () => void
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  unreadCount: 0,

  fetchRecent: async (approvedIds, eventTitles) => {
    if (approvedIds.length === 0) return
    const { data, error } = await supabase
      .from('event_announcements')
      .select('id, event_id, message, created_at')
      .in('event_id', approvedIds)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.warn('[fetchRecent] failed:', error.message)
      return
    }
    if (!data) return
    const notifications: Notification[] = data.map((row) => ({
      id: row.id,
      event_id: row.event_id,
      message: row.message,
      created_at: row.created_at ?? new Date().toISOString(),
      event_title: eventTitles[row.event_id] ?? 'Event',
      read: false,
    }))
    set({ notifications, unreadCount: notifications.length })
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
