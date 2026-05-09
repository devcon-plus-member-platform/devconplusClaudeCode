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
      // Use navigator.locks to serialize concurrent token-refresh calls and
      // prevent multiple tabs from consuming the same refresh token.
      // We honour the acquireTimeout passed by GoTrue (default 10 s) via an
      // AbortController signal. On timeout we fall back to calling fn()
      // directly — this trades a theoretical multi-tab refresh-token race for
      // the guarantee that a stale/hung background refresh never permanently
      // blocks user-initiated writes (e.g. form submissions).
      lock: async (name, acquireTimeout, fn) => {
        if (typeof navigator !== 'undefined' && navigator.locks) {
          if (acquireTimeout <= 0) {
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), 30_000)
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
              // Lock acquisition timed out (background refresh stalled).
              // Call fn() without the lock so the operation can proceed.
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
        // Throttle broadcast events to avoid overwhelming the client on busy channels
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
 * WebSocket is down ('disconnected' or 'timeout' status). This uses the official
 * onHeartbeat API rather than internal hooks, so it cannot race the built-in
 * auto-reconnect timer.
 * Returns a cleanup function that unregisters the callback.
 */
export function onRealtimeDisconnect(cb: () => void): () => void {
  _onDisconnect = cb
  return () => { if (_onDisconnect === cb) _onDisconnect = null }
}

// Use the official onHeartbeat API to detect silent disconnects.
// The heartbeat fires every 25 s (driven by the Web Worker when worker:true).
// Status 'disconnected' = socket not open when heartbeat tried to send.
// Status 'timeout'      = server stopped replying to pings.
//
// IMPORTANT: do NOT call supabase.realtime.connect() here.
// The library's own reconnectTimer already handles socket reconnection with
// exponential backoff. Calling connect() from the heartbeat callback would
// race that timer: if a socket is already CONNECTING (readyState=0), connect()
// replaces it with a new socket, orphaning the first → both fail → infinite loop
// that only a page reload can escape.
//
// Our only job here is to notify the layout to recreate channels once the socket
// comes back. The library reconnects the socket; we reconnect the channels.
supabase.realtime.onHeartbeat((status) => {
  if (status === 'disconnected' || status === 'timeout') {
    _onDisconnect?.()
  }
})
