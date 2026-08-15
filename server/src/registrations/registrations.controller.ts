import {
  Body,
  Controller,
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
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { IdParamDto } from '../common/dto/id-param.dto';
import { BulkRegistrationIdsDto } from './dto/bulk-registration-ids.dto';
import { RegisterDto } from './dto/register.dto';
import { RegistrationsService } from './registrations.service';

@Controller('registrations')
@UseGuards(AuthGuard)
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  // ── Member ────────────────────────────────────────────────────────────────

  /** GET /api/registrations/mine — caller's own event registrations */
  @Get('mine')
  getMyRegistrations(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMyRegistrations(user);
  }

  /** POST /api/registrations — register for an event (re-registers if cancelled) */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDto) {
    return this.service.register(user, dto.eventId, dto.formResponses);
  }

  /** PATCH /api/registrations/:id/cancel — cancel own registration */
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelRegistration(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.cancelRegistration(user, id);
  }

  // ── Organizer ─────────────────────────────────────────────────────────────

  /** GET /api/registrations/event/:eventId — all registrants for an event (chapter-scoped) */
  @Get('event/:id')
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  getEventRegistrants(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ) {
    return this.service.getEventRegistrants(user, id);
  }

  /**
   * POST /api/registrations/event/:id/bulk-approve — approve many at once.
   *
   * The event id lives in the path so chapter scope is checked ONCE for the whole
   * batch. No route collision with `:id/approve` — that pattern is two segments,
   * this one is three.
   */
  @Post('event/:id/bulk-approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  bulkApprove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: BulkRegistrationIdsDto,
  ) {
    return this.service.bulkApprove(user, id, dto.registrationIds);
  }

  /** POST /api/registrations/event/:id/bulk-reject — reject many at once */
  @Post('event/:id/bulk-reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  bulkReject(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
    @Body() dto: BulkRegistrationIdsDto,
  ) {
    return this.service.bulkReject(user, id, dto.registrationIds);
  }

  /** POST /api/registrations/:id/approve — approve registration */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  approveRegistration(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.approveRegistration(user, id);
  }

  /** POST /api/registrations/:id/reject — reject registration */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  rejectRegistration(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.rejectRegistration(user, id);
  }

  /** POST /api/registrations/:id/revert — revert registration to pending */
  @Post(':id/revert')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  revertRegistration(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.revertRegistration(user, id);
  }

  /** POST /api/registrations/:id/manual-checkin — manual_checkin RPC */
  @Post(':id/manual-checkin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  manualCheckin(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.manualCheckin(user, id);
  }
}
