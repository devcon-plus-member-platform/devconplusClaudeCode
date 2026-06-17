import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import type { Event } from '../supabase/types';

@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}

  /** GET /api/events — public event catalog. */
  @Get()
  getAll(): Promise<Event[]> {
    return this.service.getAll();
  }

  /** GET /api/events/:id/participants — public raffle-wheel names (no email/school). */
  @Get(':id/participants')
  getParticipants(
    @Param() { id }: IdParamDto,
  ): Promise<Array<{ name: string; checked_in: boolean; status: string }>> {
    return this.service.getParticipants(id);
  }

  /** POST /api/events — create an event (chapter_officer+). */
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('chapter_officer')
  create(
    @Body() dto: CreateEventDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Event> {
    return this.service.create(dto, user);
  }

  /** PATCH /api/events/:id — update an event (chapter_officer+, chapter-scoped). */
  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('chapter_officer')
  update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Event> {
    return this.service.update(id, dto, user);
  }

  /** DELETE /api/events/:id — delete an event + cascade registrations (chapter_officer+). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('chapter_officer')
  delete(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.service.delete(id, user);
  }
}
