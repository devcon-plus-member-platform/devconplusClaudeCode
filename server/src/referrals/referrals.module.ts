import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsRepository } from './referrals.repository';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralsRepository],
})
export class ReferralsModule {}
