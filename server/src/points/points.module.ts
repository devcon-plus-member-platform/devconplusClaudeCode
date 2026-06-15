import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { PointsController } from './points.controller';
import { PointsRepository } from './points.repository';
import { PointsService } from './points.service';

@Module({
  imports: [SupabaseModule],
  controllers: [PointsController],
  providers: [PointsService, PointsRepository],
})
export class PointsModule {}
