import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { IdParamDto } from '../common/dto/id-param.dto';
import { ApplyVolunteerDto } from './dto/apply-volunteer.dto';
import { VolunteersService } from './volunteers.service';

@Controller('volunteers')
@UseGuards(AuthGuard)
export class VolunteersController {
  constructor(private readonly service: VolunteersService) {}

  // ── Member ────────────────────────────────────────────────────────────────

  /** GET /api/volunteers/me — caller's own volunteer applications */
  @Get('me')
  getMyApplications(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMyApplications(user);
  }

  /** POST /api/volunteers — apply to volunteer for an event */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyVolunteerDto) {
    return this.service.apply(user, dto);
  }

  // ── Organizer ─────────────────────────────────────────────────────────────

  /** GET /api/volunteers/organizer — chapter-scoped applications (chapter from token) */
  @Get('organizer')
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  getChapterApplications(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getChapterApplications(user);
  }

  /** POST /api/volunteers/:id/approve — approve + award points via RPC */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  approve(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.approve(user, id);
  }

  /** POST /api/volunteers/:id/reject — reject without points change */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  reject(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.reject(user, id);
  }

  /** POST /api/volunteers/:id/revert — revert to pending, clears reviewer fields */
  @Post(':id/revert')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  revert(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.revert(user, id);
  }
}
