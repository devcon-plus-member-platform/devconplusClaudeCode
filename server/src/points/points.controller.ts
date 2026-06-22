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
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { IdParamDto } from '../common/dto/id-param.dto';
import { CreateXpTierDto } from './dto/create-xp-tier.dto';
import { UpdateXpTierDto } from './dto/update-xp-tier.dto';
import { PointsService } from './points.service';

@Controller('points')
@UseGuards(AuthGuard)
export class PointsController {
  constructor(private readonly service: PointsService) {}

  // ── Member: reads ─────────────────────────────────────────────────────────

  /**
   * GET /api/points/transactions — caller's point transaction history,
   * newest first. Optional `?limit=N` (clamped to [1, 200] by the service);
   * the dashboard preview requests a small limit, history pages the default.
   */
  @Get('transactions')
  getTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit === undefined ? undefined : Number.parseInt(limit, 10);
    return this.service.getTransactions(
      user,
      Number.isFinite(parsed as number) ? parsed : undefined,
    );
  }

  /** GET /api/points/summary — caller's spendable + lifetime point totals */
  @Get('summary')
  getPointSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getPointSummary(user);
  }

  /** GET /api/points/admin/user/:id — hq_admin: recent transactions for any member */
  @Get('admin/user/:id')
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  getAdminUserTransactions(@Param() { id }: IdParamDto) {
    return this.service.getAdminUserTransactions(id);
  }

  // ── XP Tiers ─────────────────────────────────────────────────────────────

  /** GET /api/points/tiers — list all XP tier definitions */
  @Get('tiers')
  getAllTiers() {
    return this.service.getAllTiers();
  }

  /** POST /api/points/tiers — hq_admin: create an XP tier */
  @Post('tiers')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  createTier(@Body() dto: CreateXpTierDto) {
    return this.service.createTier(dto);
  }

  /** PATCH /api/points/tiers/:id — hq_admin: update an XP tier */
  @Patch('tiers/:id')
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  updateTier(@Param() { id }: IdParamDto, @Body() dto: UpdateXpTierDto) {
    return this.service.updateTier(id, dto);
  }

  /** DELETE /api/points/tiers/:id — hq_admin: delete an XP tier */
  @Delete('tiers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  deleteTier(@Param() { id }: IdParamDto) {
    return this.service.deleteTier(id);
  }
}
