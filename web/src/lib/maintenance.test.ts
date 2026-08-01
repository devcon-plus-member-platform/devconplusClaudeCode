import { describe, expect, it } from 'vitest'
import {
  MAINTENANCE_BYPASS_KEY,
  MAINTENANCE_BYPASS_PARAM,
  MAINTENANCE_CONFIG,
  isMaintenanceBypassed,
} from './maintenance'

/** Minimal in-memory Storage stub — enough for the two methods under test. */
function memoryStore(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

/** Stands in for Safari private mode, where storage access throws. */
const throwingStore: Storage = {
  get length(): number {
    throw new Error('denied')
  },
  clear: () => {
    throw new Error('denied')
  },
  getItem: () => {
    throw new Error('denied')
  },
  key: () => {
    throw new Error('denied')
  },
  removeItem: () => {
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('denied')
  },
}

const MATCHING = `?${MAINTENANCE_BYPASS_PARAM}=${MAINTENANCE_BYPASS_KEY}`

describe('isMaintenanceBypassed', () => {
  it('bypasses when the query param matches the key', () => {
    expect(isMaintenanceBypassed(MATCHING, memoryStore())).toBe(true)
  })

  it('persists the bypass so it survives navigation within the tab', () => {
    const store = memoryStore()
    isMaintenanceBypassed(MATCHING, store)
    // Later navigation has no query string, but the flag carries it through.
    expect(isMaintenanceBypassed('', store)).toBe(true)
  })

  it('does not bypass on a wrong key', () => {
    expect(
      isMaintenanceBypassed(`?${MAINTENANCE_BYPASS_PARAM}=nope`, memoryStore()),
    ).toBe(false)
  })

  it('does not bypass with no query param and a clean store', () => {
    expect(isMaintenanceBypassed('', memoryStore())).toBe(false)
    expect(isMaintenanceBypassed('?foo=bar', memoryStore())).toBe(false)
  })

  it('ignores unrelated params alongside a valid key', () => {
    expect(isMaintenanceBypassed(`?a=1&${MAINTENANCE_BYPASS_PARAM}=${MAINTENANCE_BYPASS_KEY}&b=2`, memoryStore())).toBe(true)
  })

  it('survives storage that throws (Safari private mode)', () => {
    expect(() => isMaintenanceBypassed('', throwingStore)).not.toThrow()
    expect(isMaintenanceBypassed('', throwingStore)).toBe(false)
    // A matching param still bypasses even though the flag cannot be persisted.
    expect(isMaintenanceBypassed(MATCHING, throwingStore)).toBe(true)
  })

  it('survives a missing store entirely', () => {
    expect(isMaintenanceBypassed('', null)).toBe(false)
    expect(isMaintenanceBypassed(MATCHING, null)).toBe(true)
  })
})

describe('MAINTENANCE_CONFIG', () => {
  it('has copy ready to show without further edits', () => {
    expect(MAINTENANCE_CONFIG.heading).toBeTruthy()
    expect(MAINTENANCE_CONFIG.message).toBeTruthy()
  })

  it('uses the DEVCON+ platform contact address', () => {
    expect(MAINTENANCE_CONFIG.contactEmail).toBe('plusmemberplatform@devcon.ph')
  })
})
