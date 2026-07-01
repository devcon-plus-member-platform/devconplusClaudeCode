import { describe, expect, it } from 'vitest'
import { formatDate, isEventArchived, toDatetimeLocalValue, fromDatetimeLocalValue } from './dates'

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

describe('datetime-local conversion', () => {
  it('fromDatetimeLocalValue returns a UTC ISO string for a naive local value', () => {
    const iso = fromDatetimeLocalValue('2026-07-02T19:00')
    expect(iso).not.toBeNull()
    // A naive local value is a valid instant that parses back to the same moment.
    expect(new Date(iso!).getTime()).toBe(new Date('2026-07-02T19:00').getTime())
  })

  it('round-trips a datetime-local value regardless of local timezone', () => {
    // The picker value must survive form-populate → submit → re-populate unchanged.
    const local = '2026-07-02T19:00'
    expect(toDatetimeLocalValue(fromDatetimeLocalValue(local))).toBe(local)
  })

  it('returns empty/null for missing input', () => {
    expect(toDatetimeLocalValue(null)).toBe('')
    expect(toDatetimeLocalValue(undefined)).toBe('')
    expect(toDatetimeLocalValue('')).toBe('')
    expect(fromDatetimeLocalValue(null)).toBeNull()
    expect(fromDatetimeLocalValue('')).toBeNull()
  })

  it('returns empty/null for invalid input', () => {
    expect(toDatetimeLocalValue('not-a-date')).toBe('')
    expect(fromDatetimeLocalValue('not-a-date')).toBeNull()
  })
})
