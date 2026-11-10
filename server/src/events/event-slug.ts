/**
 * Builds an event's URL slug: the title in kebab-case plus the first 8
 * characters of the event id, e.g. "DEVCON Summit 2027!" → "devcon-summit-2027-1a2b3c4d".
 *
 * Same format as the slug backfill in supabase/migrations/20260331_event_url_slugs.sql,
 * so new and existing events look alike. The id suffix keeps slugs unique even
 * for events with identical titles.
 *
 * events.slug is NOT NULL, but no committed migration generates it on insert,
 * so the server always sets it when creating an event.
 */
export function buildEventSlug(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'event'}-${id.slice(0, 8)}`;
}
