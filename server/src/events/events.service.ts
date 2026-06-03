import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertSameChapter } from '../common/authz/chapter-scope';
import { EventsRepository } from './events.repository';
import type { Event } from '../supabase/types';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly repo: EventsRepository) {}

  getAll(): Promise<Event[]> {
    return this.repo.findAll();
  }

  async create(dto: CreateEventDto, user: AuthenticatedUser): Promise<Event> {
    const { role, chapter_id, id: profileId } = user.profile;

    // chapter_officers are locked to their own chapter — ignore any chapter_id in the DTO.
    // hq_admin+ may specify an arbitrary chapter_id via the DTO.
    const resolvedChapterId =
      role === 'hq_admin' || role === 'super_admin'
        ? (dto.chapter_id ?? chapter_id)
        : chapter_id;

    return this.repo.create({
      ...dto,
      status: 'upcoming',
      is_featured: false,
      is_promoted: false,
      tags: dto.tags ?? [],
      chapter_id: resolvedChapterId,
      created_by: profileId,
    });
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
    const payload: UpdateEventDto = { ...dto };
    if (role !== 'hq_admin' && role !== 'super_admin') {
      delete payload.chapter_id;
    }
    return this.repo.update(id, payload);
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    if (event.chapter_id) assertSameChapter(user, event.chapter_id);
    return this.repo.deleteWithCascade(id);
  }
}
