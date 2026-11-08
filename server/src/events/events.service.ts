import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildEventSlug } from './event-slug';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertSameChapter } from '../common/authz/chapter-scope';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { EventsRepository } from './events.repository';
import type { Event } from '../supabase/types';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type { EventsPageQueryDto, ListEventsQueryDto } from './dto/list-events-query.dto';
import type { EventListItem, Paginated } from './event-list.fields';

export interface EventCapacitySummary {
  capacity: number | null;
  no_show_buffer: number;
  approved_count: number;
  pending_count: number;
  effective_cap: number | null;
  is_full: boolean;
}

@Injectable()
export class EventsService {
  // Chapter officers cannot award more than this much attendance XP per event.
  // Admins (hq_admin / super_admin) are not capped.
  private static readonly OFFICER_MAX_XP = 350;

  constructor(
    private readonly repo: EventsRepository,
    private readonly cache: AppCacheService,
  ) {}

  /** GET /events — one page of the public list. Same for every user → cached per page. */
  async listPage(query: ListEventsQueryDto): Promise<Paginated<EventListItem>> {
    const { scope, limit, offset } = query;
    const version = await this.cacheVersion();
    return this.cache.getOrSet(
      CacheKeys.eventsPage(version, scope, limit, offset),
      CACHE_TTL.EVENTS,
      () => this.repo.findPage({ scope, limit, offset }),
    );
  }

  /**
   * @deprecated GET /events with no query string — the response shape app
   * versions from before pagination expect (see EventsRepository.findAllLegacy).
   */
  async listAllLegacy(): Promise<Event[]> {
    const version = await this.cacheVersion();
    return this.cache.getOrSet(CacheKeys.eventsLegacyAll(version), CACHE_TTL.EVENTS, () =>
      this.repo.findAllLegacy(),
    );
  }

  /**
   * GET /events/manage — full rows for the organizer/admin screens. Chapter
   * officers only ever receive their own chapter's events; HQ and super admins
   * receive every event (the admin console manages all chapters).
   */
  async managePage(
    query: EventsPageQueryDto,
    user: AuthenticatedUser,
  ): Promise<Paginated<Event>> {
    const { role, chapter_id } = user.profile;
    const isAdmin = role === 'hq_admin' || role === 'super_admin';
    if (!isAdmin && !chapter_id) return { rows: [], total: 0 };

    const chapterScope = isAdmin ? null : chapter_id;
    const { limit, offset } = query;
    const version = await this.cacheVersion();
    return this.cache.getOrSet(
      CacheKeys.eventsManagePage(version, chapterScope ?? 'all', limit, offset),
      CACHE_TTL.EVENTS,
      () => this.repo.findManagePage({ limit, offset }, chapterScope),
    );
  }

  /** GET /events/slug/:slug — one full event for the event pages. */
  async getBySlug(slug: string): Promise<Event> {
    const version = await this.cacheVersion();
    const event = await this.cache.getOrSet(
      CacheKeys.eventBySlug(version, slug),
      CACHE_TTL.EVENTS,
      () => this.repo.findBySlug(slug),
    );
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** GET /events/:id — one full event by id. */
  async getById(id: string): Promise<Event> {
    const version = await this.cacheVersion();
    const event = await this.cache.getOrSet(
      CacheKeys.eventById(version, id),
      CACHE_TTL.EVENTS,
      () => this.repo.findById(id),
    );
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  /** Current events cache version ('0' until the first write, or with no cache configured). */
  private async cacheVersion(): Promise<string> {
    const version = await this.cache.get<number | string>(CacheKeys.EVENTS_VERSION);
    return String(version ?? 0);
  }

  /** Makes every cached events page and item stale at once (see cache-keys.ts). */
  private async bumpCacheVersion(): Promise<void> {
    await this.cache.set(CacheKeys.EVENTS_VERSION, Date.now(), CACHE_TTL.EVENTS_VERSION);
  }

  /**
   * Password-gated raffle-wheel participants. The password must match the part
   * before "@" of the event creator's email (or any hq_admin/super_admin email
   * as a fallback/override). Returns anonymized names only — no email/school.
   */
  async getWheelParticipants(
    id: string,
    password: string,
  ): Promise<Array<{ name: string; checked_in: boolean; status: string }>> {
    const acceptable = await this.repo.findWheelAccessLocalParts(id);
    if (acceptable.length === 0) {
      throw new NotFoundException("This event isn't available for the wheel.");
    }
    if (!acceptable.includes(password.trim().toLowerCase())) {
      throw new ForbiddenException('Incorrect password');
    }
    return this.repo.findParticipants(id);
  }

  async create(dto: CreateEventDto, user: AuthenticatedUser): Promise<Event> {
    const { role, chapter_id, id: profileId } = user.profile;

    // Chapter officers are capped at OFFICER_MAX_XP attendance XP; admins are not.
    if (
      role === 'chapter_officer' &&
      (dto.points_value ?? 0) > EventsService.OFFICER_MAX_XP
    ) {
      throw new BadRequestException(
        `Chapter officers cannot set attendance XP above ${EventsService.OFFICER_MAX_XP}`,
      );
    }

    // chapter_officers are locked to their own chapter — ignore any chapter_id in the DTO.
    // hq_admin+ may target any chapter, OR pass null for an HQ-wide (all-chapters) event.
    // Preserve an explicit null; only fall back to their own chapter when the field is omitted.
    // (Using `??` here would collapse null → own chapter, silently un-scoping HQ events.)
    const resolvedChapterId =
      role === 'hq_admin' || role === 'super_admin'
        ? (dto.chapter_id !== undefined ? dto.chapter_id : chapter_id)
        : chapter_id;

    // The id is generated here (not by the database) so the slug can include it:
    // events.slug is required, and the database doesn't fill it in by itself.
    const id = randomUUID();
    const slug = dto.slug?.trim() || buildEventSlug(dto.title, id);

    const event = await this.repo.create({
      ...dto,
      id,
      slug,
      status: 'upcoming',
      is_featured: false,
      is_promoted: false,
      tags: dto.tags ?? [],
      chapter_id: resolvedChapterId,
      created_by: profileId,
    });
    await this.bumpCacheVersion();
    return event;
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    user: AuthenticatedUser,
  ): Promise<Event> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    if (event.chapter_id) assertSameChapter(user, event.chapter_id);
    // Prevent officers from moving an event to a different chapter via PATCH.
    const { role } = user.profile;
    // Chapter officers are capped at OFFICER_MAX_XP attendance XP; admins are not.
    if (
      role === 'chapter_officer' &&
      dto.points_value != null &&
      dto.points_value > EventsService.OFFICER_MAX_XP
    ) {
      throw new BadRequestException(
        `Chapter officers cannot set attendance XP above ${EventsService.OFFICER_MAX_XP}`,
      );
    }
    const payload: UpdateEventDto = { ...dto };
    if (role !== 'hq_admin' && role !== 'super_admin') {
      delete payload.chapter_id;
    }
    const updated = await this.repo.update(id, payload);
    await this.bumpCacheVersion();
    return updated;
  }

  async getCapacity(id: string): Promise<EventCapacitySummary> {
    const summary = await this.repo.findCapacitySummary(id);
    if (!summary) throw new NotFoundException(`Event ${id} not found`);
    const effectiveCap =
      summary.capacity != null ? summary.capacity + summary.no_show_buffer : null;
    const committed = summary.approved_count + summary.pending_count;
    const isFull = effectiveCap != null && committed >= effectiveCap;
    return { ...summary, effective_cap: effectiveCap, is_full: isFull };
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    if (event.chapter_id) assertSameChapter(user, event.chapter_id);
    await this.repo.deleteWithCascade(id);
    await this.bumpCacheVersion();
  }
}
