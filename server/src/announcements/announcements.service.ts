import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertSameChapter } from '../common/authz/chapter-scope';
import type { EventAnnouncement } from '../supabase/types';
import { AnnouncementsRepository } from './announcements.repository';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { ListAnnouncementsQueryDto } from './dto/list-announcements-query.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly repo: AnnouncementsRepository) {}

  async listMine(
    user: AuthenticatedUser,
    query: ListAnnouncementsQueryDto,
  ): Promise<EventAnnouncement[]> {
    const approvedEventIds = await this.repo.findApprovedEventIdsByUser(user.profileId);
    if (approvedEventIds.length === 0) return [];

    const requestedEventIds = (query.event_ids ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const allowedIds =
      requestedEventIds.length === 0
        ? approvedEventIds
        : requestedEventIds.filter((id) => approvedEventIds.includes(id));

    if (allowedIds.length === 0) return [];
    return this.repo.findRecentByEventIds(allowedIds);
  }

  async create(
    dto: CreateAnnouncementDto,
    user: AuthenticatedUser,
  ): Promise<EventAnnouncement> {
    const chapterId = await this.repo.findEventChapterId(dto.event_id);
    if (!chapterId) throw new NotFoundException(`Event ${dto.event_id} not found`);
    assertSameChapter(user, chapterId);
    return this.repo.create({
      event_id: dto.event_id,
      organizer_id: user.profileId,
      message: dto.message.trim(),
    });
  }
}
