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
import type {
  Reward,
  RewardRedemption,
  RewardRedemptionWithDetails,
} from '../supabase/types';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { RewardsService } from './rewards.service';

@Controller('rewards')
@UseGuards(AuthGuard)
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  // ── Reward CRUD (hq_admin writes) ────────────────────────────────────

  /** POST /api/rewards — create a reward (hq_admin+). */
  @Post()
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  createReward(@Body() dto: CreateRewardDto): Promise<Reward> {
    return this.rewardsService.createReward(dto);
  }

  /** PATCH /api/rewards/:id — update a reward (hq_admin+). */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  updateReward(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateRewardDto,
  ): Promise<Reward> {
    return this.rewardsService.updateReward(id, dto);
  }

  /** DELETE /api/rewards/:id — delete reward + cascade redemptions (hq_admin+). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('hq_admin')
  deleteReward(@Param() { id }: IdParamDto): Promise<void> {
    return this.rewardsService.deleteReward(id);
  }

  // ── Member redemption flows ───────────────────────────────────────────

  /**
   * POST /api/rewards/:id/redeem — member redeems a reward.
   * userId always comes from the verified token — never from the request body.
   */
  @Post(':id/redeem')
  redeemReward(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<{ redemptionId: string; claimPin: string | null }> {
    return this.rewardsService.redeemReward(user.profileId, id);
  }

  /** GET /api/rewards/redemptions/mine — caller's own redemption history. */
  @Get('redemptions/mine')
  getMemberRedemptions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RewardRedemption[]> {
    return this.rewardsService.getMemberRedemptions(user.profileId);
  }

  // ── Organizer / admin views ───────────────────────────────────────────

  /**
   * GET /api/rewards/redemptions — all pending + resolved claims (officer+).
   * Used by the organizer rewards management page.
   */
  @Get('redemptions')
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  getAllRedemptions(): Promise<RewardRedemptionWithDetails[]> {
    return this.rewardsService.getAllRedemptions();
  }

  /**
   * POST /api/rewards/redemptions/:id/approve — mark a pending claim as claimed (officer+).
   * organizerId comes from the token, never from the body.
   */
  @Post('redemptions/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  approveClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    return this.rewardsService.approveClaim(id, user.profileId);
  }

  /**
   * POST /api/rewards/redemptions/:id/refund — refund a pending/claimed redemption (officer+).
   * Points are returned to the member via the refund_reward_claim RPC.
   */
  @Post('redemptions/:id/refund')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('chapter_officer')
  refundClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    return this.rewardsService.refundClaim(id, user.profileId);
  }
}
