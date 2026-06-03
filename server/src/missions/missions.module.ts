import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { MissionsController } from './missions.controller';
import { MissionsRepository } from './missions.repository';
import { MissionsService } from './missions.service';

@Module({
  imports: [SupabaseModule],
  controllers: [MissionsController],
  providers: [MissionsService, MissionsRepository],
})
export class MissionsModule {}
