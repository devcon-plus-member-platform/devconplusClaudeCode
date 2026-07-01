import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertSameChapter } from '../common/authz/chapter-scope';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { EventsRepository } from './events.repository';
import type { Event } from '../supabase/types';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  // Chapter officers cannot award more than this much attendance XP per event.
  // Admins (hq_admin / super_admin) are not capped.
  private static readonly OFFICER_MAX_XP = 350;

  constructor(
    private readonly repo: EventsRepository,
    private readonly cache: AppCacheService,
  ) {}

  // GET /events is identical for every user → one shared cache key.
  getAll(): Promise<Event[]> {
    return this.cache.getOrSet(CacheKeys.EVENTS_LIST, CACHE_TTL.EVENTS, () =>
      this.repo.findAll(),
    );
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

    const event = await this.repo.create({
      ...dto,
      status: 'upcoming',
      is_featured: false,
      is_promoted: false,
      tags: dto.tags ?? [],
      chapter_id: resolvedChapterId,
      created_by: profileId,
    });
    await this.cache.del(CacheKeys.EVENTS_LIST);
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
    await this.cache.del(CacheKeys.EVENTS_LIST);
    return updated;
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    if (event.chapter_id) assertSameChapter(user, event.chapter_id);
    await this.repo.deleteWithCascade(id);
    await this.cache.del(CacheKeys.EVENTS_LIST);
  }
}
