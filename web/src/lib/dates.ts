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
