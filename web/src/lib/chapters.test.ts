import { describe, expect, it } from 'vitest'
import { findChapterNameConflict, normalizeChapterName, pageForIndex } from './chapters'

describe('normalizeChapterName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeChapterName('  Cebu  ')).toBe('Cebu')
  })

  it('preserves a trailing * and preserves casing', () => {
    expect(normalizeChapterName('  Bacolod*  ')).toBe('Bacolod*')
    expect(normalizeChapterName('  manila  ')).toBe('manila')
  })
})

describe('findChapterNameConflict', () => {
  const chapters = [
    { id: 'cebu-1', name: 'Cebu' },
    { id: 'manila-1', name: 'Manila' },
    { id: 'bacolod-1', name: 'Bacolod*' },
  ]

  it('returns kind: duplicate for an exact name match', () => {
    const result = findChapterNameConflict('Cebu', chapters)
    expect(result).toEqual({ kind: 'duplicate', existing: { id: 'cebu-1', name: 'Cebu' } })
  })

  it('returns kind: duplicate for a case-only difference', () => {
    const result = findChapterNameConflict('cebu', chapters)
    expect(result).toEqual({ kind: 'duplicate', existing: { id: 'cebu-1', name: 'Cebu' } })
  })

  it('returns kind: duplicate for a whitespace-only difference', () => {
    const result = findChapterNameConflict('  Cebu  ', chapters)
    expect(result).toEqual({ kind: 'duplicate', existing: { id: 'cebu-1', name: 'Cebu' } })
  })

  it('returns kind: inactive-variant when the typed name matches an existing name ending in *', () => {
    const result = findChapterNameConflict('Bacolod', chapters)
    expect(result).toEqual({
      kind: 'inactive-variant',
      existing: { id: 'bacolod-1', name: 'Bacolod*' },
    })
  })

  it('returns null for a genuinely new name', () => {
    expect(findChapterNameConflict('Davao', chapters)).toBeNull()
  })

  it('returns null when the only match is the row named by excludeId', () => {
    expect(findChapterNameConflict('Cebu', chapters, 'cebu-1')).toBeNull()
  })
})

describe('pageForIndex', () => {
  it('maps index 0 with page size 10 to page 1', () => {
    expect(pageForIndex(0, 10)).toBe(1)
  })

  it('maps index 9 with page size 10 to page 1', () => {
    expect(pageForIndex(9, 10)).toBe(1)
  })

  it('maps index 10 with page size 10 to page 2', () => {
    expect(pageForIndex(10, 10)).toBe(2)
  })

  it('maps index 12 with page size 10 to page 2', () => {
    expect(pageForIndex(12, 10)).toBe(2)
  })

  it('guards a negative index by returning page 1', () => {
    expect(pageForIndex(-1, 10)).toBe(1)
  })

  it('guards a non-positive pageSize by returning page 1', () => {
    expect(pageForIndex(5, 0)).toBe(1)
    expect(pageForIndex(5, -3)).toBe(1)
  })
})
