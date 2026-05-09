import { createClient } from '@supabase/supabase-js'
import type { Database } from '@devcon-plus/supabase'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: async (name, acquireTimeout, fn) => {
        if (typeof navigator !== 'undefined' && navigator.locks) {
          if (acquireTimeout <= 0) {
            // Cap indefinite waits at 1 s. A backgrounded-tab token refresh can hold
            // this lock for minutes; without a cap every queued Supabase call hangs
            // indefinitely → all store isLoading flags stay true until the lock frees.
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), 1_000)
            try {
              return await navigator.locks.request(name, { signal: ctrl.signal }, fn)
            } catch (err) {
              if ((err as DOMException).name === 'AbortError') return fn()
              throw err
            } finally {
              clearTimeout(t)
            }
          }
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), acquireTimeout)
          try {
            return await navigator.locks.request(name, { signal: controller.signal }, fn)
          } catch (err) {
            if ((err as DOMException).name === 'AbortError') {
              // Lock acquisition timed out — call fn() without the lock so the
              // operation can proceed rather than hanging indefinitely.
              return fn()
            }
            throw err
          } finally {
            clearTimeout(timer)
          }
        }
        return fn()
      },
    },
    realtime: {
      // Run the Realtime heartbeat in a Web Worker so browser tab-throttling
      // cannot kill the 25 s ping and silently close the WebSocket.
      worker: true,
      params: {
        eventsPerSecond: 10,
      },
    },
  }
)

// Callback registered by the active layout — called when a heartbeat detects
// the socket is down. Set via onRealtimeDisconnect(); cleared on layout unmount.
let _onDisconnect: (() => void) | null = null

/**
 * Register a callback that fires whenever the Realtime heartbeat detects the
 * WebSocket is down ('disconnected' or 'timeout' status).
 * Returns a cleanup function that unregisters the callback.
 */
export function onRealtimeDisconnect(cb: () => void): () => void {
  _onDisconnect = cb
  return () => { if (_onDisconnect === cb) _onDisconnect = null }
}

// Use the official onHeartbeat API to detect silent disconnects.
// The heartbeat fires every 25 s (driven by the Web Worker when worker:true).
//
// IMPORTANT: do NOT call supabase.realtime.connect() here.
// The library's own reconnectTimer already handles socket reconnection with
// exponential backoff. Calling connect() from the heartbeat callback would
// race that timer and can cause an infinite reconnect loop.
// Our only job here is to notify the layout to recreate channels once the
// socket comes back.
supabase.realtime.onHeartbeat((status) => {
  if (status === 'disconnected' || status === 'timeout') {
    _onDisconnect?.()
  }
})
