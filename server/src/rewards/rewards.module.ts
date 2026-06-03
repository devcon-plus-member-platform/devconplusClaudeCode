import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { RewardsController } from './rewards.controller';
import { RewardsRepository } from './rewards.repository';
import { RewardsService } from './rewards.service';

@Module({
  imports: [SupabaseModule],
  controllers: [RewardsController],
  providers: [RewardsService, RewardsRepository],
  exports: [RewardsService],
})
export class RewardsModule {}
