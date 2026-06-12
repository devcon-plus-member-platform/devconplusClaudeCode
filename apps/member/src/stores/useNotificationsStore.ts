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

export interface UserNotification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'points_approved' | 'points_rejected' | 'system'
  read: boolean
  created_at: string
}

interface NotificationsState {
  notifications: Notification[]
  userNotifications: UserNotification[]
  unreadCount: number
  fetchRecent: (approvedIds: string[], eventTitles: Record<string, string>) => Promise<void>
  fetchUserNotifications: (userId: string) => Promise<void>
  subscribe: (approvedIds: string[], eventTitles: Record<string, string>) => () => void
  subscribeUserNotifications: (userId: string) => () => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clearAll: () => void
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  userNotifications: [],
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

  fetchUserNotifications: async (userId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (!data) return
    const notifs = data as UserNotification[]
    const unreadUser = notifs.filter((n: UserNotification) => !n.read).length
    set((state) => ({
      userNotifications: notifs,
      unreadCount: state.notifications.filter((n) => !n.read).length + unreadUser,
    }))
  },

  subscribeUserNotifications: (userId: string) => {
    const channel = supabase
      .channel(nextChan('user-notifications'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as UserNotification
          set((state) => ({
            userNotifications: [row, ...state.userNotifications],
            unreadCount: state.unreadCount + 1,
          }))
          const icon = row.type === 'points_approved' ? '🎉' : '❌'
          toast.info(`${icon} ${row.title}: ${row.message.slice(0, 60)}…`)
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[user-notifications] channel error', status, err)
        }
      })
    return () => { void supabase.removeChannel(channel) }
  },

  markAllRead: () => {
    const { userNotifications } = get()
    const unreadIds = userNotifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase as any).from('user_notifications').update({ read: true }).in('id', unreadIds)
    }
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      userNotifications: state.userNotifications.map((n) => ({ ...n, read: true })),
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
