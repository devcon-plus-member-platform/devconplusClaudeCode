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
import { CreateXpTierDto } from './dto/create-xp-tier.dto';
import { UpdateXpTierDto } from './dto/update-xp-tier.dto';
import { PointsService } from './points.service';

@Controller('points')
@UseGuards(AuthGuard)
export class PointsController {
  constructor(private readonly service: PointsService) {}

  // ── Member: reads ─────────────────────────────────────────────────────────

  /** GET /api/points/transactions — caller's full point transaction history */
  @Get('transactions')
  getTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getTransactions(user);
  }

  /** GET /api/points/summary — caller's spendable + lifetime point totals */
  @Get('summary')
  getPointSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getPointSummary(user);
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
