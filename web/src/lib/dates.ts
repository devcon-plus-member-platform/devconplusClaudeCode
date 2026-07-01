import type { Event } from '@devcon-plus/supabase'

const PH = 'en-PH'

export const formatDate = {
  /** "Feb 20, 2026" — cards, lists */
  short: (date: string | Date) =>
    new Date(date).toLocaleDateString(PH, { month: 'short', day: 'numeric', year: 'numeric' }),

  /** "February 20, 2026" — article / detail headers */
  long: (date: string | Date) =>
    new Date(date).toLocaleDateString(PH, { month: 'long', day: 'numeric', year: 'numeric' }),

  /** "Sunday, February 20, 2026" — event detail, ticket, points history */
  full: (date: string | Date) =>
    new Date(date).toLocaleDateString(PH, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),

  /** "Feb 20" — transaction previews (no year) */
  compact: (date: string | Date) =>
    new Date(date).toLocaleDateString(PH, { month: 'short', day: 'numeric' }),

  /** "FEB" — event date-block month header */
  monthShort: (date: string | Date) =>
    new Date(date).toLocaleDateString(PH, { month: 'short' }).toUpperCase(),

  /** "20" — event date-block day number */
  day: (date: string | Date) =>
    new Date(date).toLocaleDateString(PH, { day: 'numeric' }),
}

/** Returns true when the event's end time (or start time if no end) has passed. */
export function isEventArchived(event: Event, now = new Date()): boolean {
  const cutoff = event.end_date ?? event.event_date
  return cutoff ? new Date(cutoff) < now : false
}

/**
 * Convert a stored timestamp (a UTC ISO string from the DB) into the value an
 * `<input type="datetime-local">` expects — `"YYYY-MM-DDTHH:mm"` in the viewer's
 * LOCAL wall-clock time. Returns '' for null/invalid input.
 *
 * `<input type="datetime-local">` is timezone-naive: it renders whatever local
 * wall-clock string you give it. Feeding it `toISOString()` (which is UTC) makes
 * the picker show the wrong hour. This shifts by the local offset first.
 */
export function toDatetimeLocalValue(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  // Subtract the local offset so the resulting ISO string's date/time components
  // read as local wall-clock, then trim to minute precision.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/**
 * Convert an `<input type="datetime-local">` value (naive local wall-clock, no
 * timezone) into a full UTC ISO string for storage in a `timestamptz` column.
 * Returns null for empty/invalid input.
 *
 * Without this, the naive string (e.g. "2026-07-02T19:00") is stored verbatim and
 * Postgres interprets it as UTC; the app later renders it in local time (UTC+8),
 * shifting the event to the next day. `new Date(naive)` parses as local time, so
 * `.toISOString()` yields the correct UTC instant.
 */
export function fromDatetimeLocalValue(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
