import { useState, useEffect, useRef } from 'react'

const KONAMI_SEQUENCE = [
  'ArrowUp', 'ArrowUp',
  'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA',
  'Enter',
] as const

export function useKonamiCode(): { triggered: boolean; reset: () => void } {
  const [triggered, setTriggered] = useState(false)
  const positionRef = useRef(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Security guard: never track keystrokes inside form fields
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return

      if (e.code === KONAMI_SEQUENCE[positionRef.current]) {
        positionRef.current += 1
        if (positionRef.current === KONAMI_SEQUENCE.length) {
          positionRef.current = 0
          setTriggered(true)
        }
      } else {
        // On mismatch: restart from 1 if current key matches the first in sequence,
        // otherwise reset to 0. Handles overlapping prefixes (e.g. ↑ ↑ ↑ ↑ ...).
        positionRef.current = e.code === KONAMI_SEQUENCE[0] ? 1 : 0
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const reset = () => setTriggered(false)

  return { triggered, reset }
}
