import { describe, expect, it, vi } from 'vitest'
import { fetchAllPages, isMissingRoute } from './pagination'

type Row = { id: string }
const rows = (from: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `e${from + i}` }))

describe('fetchAllPages', () => {
  it('follows total across pages until every row is loaded', async () => {
    const all = rows(0, 250)
    const fetchPage = vi.fn(async (offset: number, limit: number) => ({
      rows: all.slice(offset, offset + limit),
      total: all.length,
    }))

    const result = await fetchAllPages(fetchPage, 100)

    expect(result).toHaveLength(250)
    expect(fetchPage.mock.calls.map(([offset]) => offset)).toEqual([0, 100, 200])
  })

  it('stops after one request when everything fits on the first page', async () => {
    const fetchPage = vi.fn(async () => ({ rows: rows(0, 7), total: 7 }))
    expect(await fetchAllPages(fetchPage, 100)).toHaveLength(7)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('de-duplicates a row that shifted onto the next page', async () => {
    const pages = [
      { rows: rows(0, 2), total: 4 },
      { rows: [{ id: 'e1' }, ...rows(2, 2)], total: 4 },
    ]
    const result = await fetchAllPages(async (offset) => pages[offset === 0 ? 0 : 1], 2)
    expect(result.map((r) => r.id)).toEqual(['e0', 'e1', 'e2', 'e3'])
  })

  it('stops instead of looping when a page comes back empty early', async () => {
    const fetchPage = vi.fn(async (offset: number) => ({ rows: offset === 0 ? rows(0, 2) : [], total: 10 }))
    expect(await fetchAllPages(fetchPage, 2)).toHaveLength(2)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('treats a plain array (a server from before pagination) as the complete list', async () => {
    const fetchPage = vi.fn(async () => rows(0, 120))
    expect(await fetchAllPages(fetchPage, 100)).toHaveLength(120)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})

describe('isMissingRoute', () => {
  it('recognises the NestJS "route does not exist" 404', () => {
    expect(isMissingRoute(new Error('Cannot GET /api/events/slug/abc'))).toBe(true)
  })

  it('does not mistake a genuine not-found or other errors for it', () => {
    expect(isMissingRoute(new Error('Event not found'))).toBe(false)
    expect(isMissingRoute(new Error('API error 500'))).toBe(false)
    expect(isMissingRoute('Cannot GET /x')).toBe(false)
  })
})
