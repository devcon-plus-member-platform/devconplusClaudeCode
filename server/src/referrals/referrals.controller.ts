import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ReferralsService, type ReferralSummary } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  /** GET /api/referrals/me — authenticated user's referral summary. */
  @Get('me')
  @UseGuards(AuthGuard)
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<ReferralSummary> {
    return this.service.getSummary(user.profileId);
  }
}
