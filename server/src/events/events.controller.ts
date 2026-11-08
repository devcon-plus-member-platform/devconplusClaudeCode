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
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { IdParamDto } from '../common/dto/id-param.dto';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { WheelAccessDto } from './dto/wheel-access.dto';
import {
  EventsPageQueryDto,
  ListEventsQueryDto,
  SlugParamDto,
} from './dto/list-events-query.dto';
import { EventsService, type EventCapacitySummary } from './events.service';
import type { EventListItem, Paginated } from './event-list.fields';
import type { Event } from '../supabase/types';

// Route order matters: the static paths ('manage', 'slug/:slug') are declared
// before ':id' so Express never tries to read them as an event id.
@Controller('events')
export class EventsController {
  constructor(private readonly service: EventsService) {}

  /**
   * GET /api/events?scope=&limit=&offset= — public event catalog, one page at a
   * time: { rows, total }. limit defaults to 20 and is capped at 100.
   */
  @Get()
  list(@Query() query: ListEventsQueryDto): Promise<Paginated<EventListItem>> {
    return this.service.listPage(query);
  }

  /**
   * GET /api/events/manage?limit=&offset= — full event rows for the organizer
   * and admin screens: { rows, total }. Officers get their own chapter only.
   */
  @Get('manage')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('chapter_officer')
  manage(
    @Query() query: EventsPageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<Event>> {
    return this.service.managePage(query, user);
  }

  /** GET /api/events/slug/:slug — one full event for the event pages. */
  @Get('slug/:slug')
  getBySlug(@Param() { slug }: SlugParamDto): Promise<Event> {
    return this.service.getBySlug(slug);
  }

  /**
   * GET /api/events/:id/capacity — public live capacity snapshot for a single
   * event. Deliberately not folded into GET /api/events (the hot list
   * endpoint) — see events-endpoint-load-bottleneck perf notes.
   */
  @Get(':id/capacity')
  getCapacity(@Param() { id }: IdParamDto): Promise<EventCapacitySummary> {
    return this.service.getCapacity(id);
  }

  /** GET /api/events/:id — one full event by id. */
  @Get(':id')
  getById(@Param() { id }: IdParamDto): Promise<Event> {
    return this.service.getById(id);
  }

  /**
   * POST /api/events/:id/participants — password-gated raffle-wheel names.
   * Public route, but the password (event creator's / admin email local-part) is
   * validated server-side and anonymized names are returned only on success.
   */
  @Post(':id/participants')
  @HttpCode(HttpStatus.OK)
  getParticipants(
    @Param() { id }: IdParamDto,
    @Body() dto: WheelAccessDto,
  ): Promise<Array<{ name: string; checked_in: boolean; status: string }>> {
    return this.service.getWheelParticipants(id, dto.password);
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
