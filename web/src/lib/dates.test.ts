import { describe, expect, it } from 'vitest'
import { formatDate, isEventArchived } from './dates'

describe('formatDate', () => {
  const date = '2026-02-20T10:00:00Z'

  it('short returns "Feb 20, 2026" format', () => {
    expect(formatDate.short(date)).toContain('Feb')
    expect(formatDate.short(date)).toContain('20')
    expect(formatDate.short(date)).toContain('2026')
  })

  it('compact returns month and day without year', () => {
    const result = formatDate.compact(date)
    expect(result).toContain('Feb')
    expect(result).toContain('20')
    expect(result).not.toContain('2026')
  })

  it('monthShort returns uppercase month abbreviation', () => {
    expect(formatDate.monthShort(date)).toBe('FEB')
  })

  it('day returns just the day number', () => {
    expect(formatDate.day(date)).toBe('20')
  })

  it('accepts Date objects', () => {
    const result = formatDate.short(new Date(date))
    expect(result).toContain('2026')
  })
})

describe('isEventArchived', () => {
  const now = new Date('2026-03-01T00:00:00Z')

  it('returns true when end_date is in the past', () => {
    const event = { end_date: '2026-02-28T23:59:59Z', event_date: '2026-02-28T09:00:00Z' }
    expect(isEventArchived(event as never, now)).toBe(true)
  })

  it('returns false when end_date is in the future', () => {
    const event = { end_date: '2026-03-02T00:00:00Z', event_date: '2026-02-28T09:00:00Z' }
    expect(isEventArchived(event as never, now)).toBe(false)
  })

  it('falls back to event_date when no end_date', () => {
    const event = { end_date: null, event_date: '2026-02-20T10:00:00Z' }
    expect(isEventArchived(event as never, now)).toBe(true)
  })

  it('returns false when both dates are null', () => {
    const event = { end_date: null, event_date: null }
    expect(isEventArchived(event as never, now)).toBe(false)
  })
})
