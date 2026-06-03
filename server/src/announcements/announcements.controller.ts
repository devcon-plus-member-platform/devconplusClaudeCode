import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import type { EventAnnouncement } from '../supabase/types';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAnnouncementsQueryDto } from './dto/list-announcements-query.dto';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  /** GET /api/announcements — member-safe recent announcements for approved registrations */
  @Get()
  @UseGuards(AuthGuard)
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAnnouncementsQueryDto,
  ): Promise<EventAnnouncement[]> {
    return this.service.listMine(user, query);
  }

  /** POST /api/announcements — chapter_officer+: create an event announcement */
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('chapter_officer')
  create(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EventAnnouncement> {
    return this.service.create(dto, user);
  }
}
