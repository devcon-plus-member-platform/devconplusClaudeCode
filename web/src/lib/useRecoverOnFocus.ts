import { useEffect, useRef } from 'react'

/**
 * Re-runs a callback when the tab regains visibility (e.g. after idle / sleep).
 * Does NOT run on mount — the caller's own useEffect handles that.
 */
export function useRecoverOnFocus(callback: () => void, enabled = true) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [enabled])
}
