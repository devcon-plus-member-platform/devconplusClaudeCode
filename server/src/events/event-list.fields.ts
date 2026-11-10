import type { Event } from '../supabase/types';

/**
 * The event columns returned by the list endpoints (GET /events and the event
 * embedded in GET /registrations/mine): only what list cards, filters, tickets
 * and the dashboard actually render.
 *
 * Deliberately excluded: the heavy or internal columns that only the event
 * detail / edit screens need — description, custom_form_schema, tags, pricing,
 * capacity settings, created_by, created_at. Those come from
 * GET /events/slug/:slug, GET /events/:id and GET /events/manage.
 *
 * Keep in sync with EVENT_LIST_FIELDS in web/src/types/types.ts.
 */
export const EVENT_LIST_FIELDS = [
  'id',
  'slug',
  'title',
  'event_date',
  'end_date',
  'location',
  'category',
  'devcon_category',
  'status',
  'visibility',
  'chapter_id',
  'is_chapter_locked',
  'is_featured',
  'is_promoted',
  'is_external',
  'external_registration_url',
  'registration_closed',
  'requires_approval',
  'points_value',
  'cover_image_url',
] as const satisfies readonly (keyof Event)[];

export type EventListItem = Pick<Event, (typeof EVENT_LIST_FIELDS)[number]>;

/** PostgREST select string for EVENT_LIST_FIELDS. */
export const EVENT_LIST_COLUMNS = EVENT_LIST_FIELDS.join(', ');

/** One page of a list plus the full match count, so clients can tell when there is more. */
export interface Paginated<T> {
  rows: T[];
  total: number;
}
