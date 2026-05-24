import { useCallback, useEffect, useRef, useState } from 'react'

const NAMESPACE = 'devcon-draft:'
const DRAFT_DEBOUNCE_MS = 400

function readStorage(storage: Storage, key: string): Record<string, unknown> {
  try {
    const raw = storage.getItem(NAMESPACE + key)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function writeStorage(storage: Storage, key: string, value: Record<string, unknown>): void {
  try {
    storage.setItem(NAMESPACE + key, JSON.stringify(value))
  } catch (err) {
    console.warn('[useFormDraft] write failed', err)
  }
}

function removeStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(NAMESPACE + key)
  } catch {
    // ignore — draft loss is acceptable
  }
}

export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  storageType: 'session' | 'local',
  options?: { exclude?: string[] },
): {
  draft: Partial<T>
  saveDraft: (values: Partial<T>) => void
  clearDraft: () => void
} {
  const storage = storageType === 'session' ? sessionStorage : localStorage
  const exclude = options?.exclude ?? []

  const [draft, setDraft] = useState<Partial<T>>(() => {
    const raw = readStorage(storage, key)
    // Strip internal metadata before returning to caller
    const { _savedAt: _omit, ...rest } = raw
    return rest as Partial<T>
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveDraft = useCallback(
    (values: Partial<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const filtered = Object.fromEntries(
          Object.entries(values).filter(([k]) => !(exclude as string[]).includes(k)),
        )
        writeStorage(storage, key, { ...filtered, _savedAt: new Date().toISOString() })
      }, DRAFT_DEBOUNCE_MS)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storage, key],
  )

  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    removeStorage(storage, key)
    setDraft({})
  }, [storage, key])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { draft, saveDraft, clearDraft }
}
