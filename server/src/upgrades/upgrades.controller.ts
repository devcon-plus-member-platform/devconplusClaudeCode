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
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { IdParamDto } from '../common/dto/id-param.dto';
import { RateLimit } from '../common/throttler/rate-limit.decorator';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import { CreateOrgCodeDto } from './dto/create-org-code.dto';
import { RequestUpgradeDto } from './dto/request-upgrade.dto';
import { UpdateOrgCodeDto } from './dto/update-org-code.dto';
import { UpgradesService } from './upgrades.service';

// ── Upgrade Requests (/api/upgrades) ─────────────────────────────────────────

@Controller('upgrades')
@UseGuards(AuthGuard)
export class UpgradesController {
  constructor(private readonly service: UpgradesService) {}

  /** POST /api/upgrades/request — member submits an organizer code (rate-limited) */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RateLimitGuard)
  @RateLimit('org_upgrade')
  requestUpgrade(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestUpgradeDto) {
    return this.service.requestUpgrade(user, dto);
  }

  /** GET /api/upgrades — hq_admin: all requests with member details */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  getAllRequests() {
    return this.service.getAllRequests();
  }

  /** GET /api/upgrades/chapter — officer: pending requests for their chapter */
  @Get('chapter')
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  getChapterRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getChapterRequests(user);
  }

  /** POST /api/upgrades/:id/approve — hq_admin: approve_organizer_upgrade RPC */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  approveRequest(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.approveRequest(user, id);
  }

  /** POST /api/upgrades/:id/reject — chapter_officer+: reject (chapter-scoped for officers) */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  rejectRequest(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.rejectRequest(user, id);
  }

  /** POST /api/upgrades/:id/officer-approve — officer: officer_approve_upgrade RPC */
  @Post(':id/officer-approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  officerApproveRequest(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.officerApproveRequest(user, id);
  }
}

// ── Organizer Codes (/api/org-codes) ─────────────────────────────────────────

@Controller('org-codes')
@UseGuards(AuthGuard)
export class OrgCodesController {
  constructor(private readonly service: UpgradesService) {}

  /** GET /api/org-codes — hq_admin: all codes */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  getAllCodes() {
    return this.service.getAllCodes();
  }

  /** GET /api/org-codes/chapter — officer: active code for their chapter */
  @Get('chapter')
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  getChapterActiveCode(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getChapterActiveCode(user);
  }

  /** POST /api/org-codes — hq_admin: create a new organizer code */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  createCode(@Body() dto: CreateOrgCodeDto) {
    return this.service.createCode(dto);
  }

  /** PATCH /api/org-codes/:id — hq_admin: toggle is_active, rotate code value, etc. */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  updateCode(@Param() { id }: IdParamDto, @Body() dto: UpdateOrgCodeDto) {
    return this.service.updateCode(id, dto);
  }

  /** DELETE /api/org-codes/:id — hq_admin: delete */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  deleteCode(@Param() { id }: IdParamDto) {
    return this.service.deleteCode(id);
  }
}

// ── Co-organizers (/api/co-organizers) ───────────────────────────────────────

@Controller('co-organizers')
@UseGuards(AuthGuard)
export class CoOrganizersController {
  constructor(private readonly service: UpgradesService) {}

  /** GET /api/co-organizers — officer: list co-organizers in their chapter */
  @Get()
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  getCoOrganizers(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getCoOrganizers(user);
  }

  /** POST /api/co-organizers/:id/remove — officer: demote co-organizer */
  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  removeCoOrganizer(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.service.removeCoOrganizer(user, id);
  }
}
