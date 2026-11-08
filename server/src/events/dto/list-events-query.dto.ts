import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Largest page a client may request from the event list endpoints. */
export const EVENTS_PAGE_MAX = 100;
/** Page size used when the client sends no ?limit=. */
export const EVENTS_PAGE_DEFAULT = 20;

export const EVENT_LIST_SCOPES = ['all', 'upcoming', 'past'] as const;
export type EventListScope = (typeof EVENT_LIST_SCOPES)[number];

/** ?limit=&offset= paging shared by GET /events and GET /events/manage. */
export class EventsPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(EVENTS_PAGE_MAX)
  limit: number = EVENTS_PAGE_DEFAULT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

/**
 * GET /events query.
 *   scope=upcoming → not yet ended (or date TBA), soonest first
 *   scope=past     → already ended, most recent first
 *   scope=all      → every event, newest date first (default)
 * "Ended" matches isEventArchived() on the web: end_date, else event_date, is in the past.
 */
export class ListEventsQueryDto extends EventsPageQueryDto {
  @IsOptional()
  @IsIn(EVENT_LIST_SCOPES)
  scope: EventListScope = 'all';
}

/** :slug route param for GET /events/slug/:slug. */
export class SlugParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  slug!: string;
}
