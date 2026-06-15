import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { RateLimitRepository } from '../common/throttler/rate-limit.repository';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import {
  CoOrganizersController,
  OrgCodesController,
  UpgradesController,
} from './upgrades.controller';
import { UpgradesRepository } from './upgrades.repository';
import { UpgradesService } from './upgrades.service';

@Module({
  imports: [SupabaseModule],
  controllers: [UpgradesController, OrgCodesController, CoOrganizersController],
  providers: [
    UpgradesService,
    UpgradesRepository,
    // Rate-limit dependencies required by POST /api/upgrades/request
    RateLimitRepository,
    RateLimitGuard,
  ],
})
export class UpgradesModule {}
