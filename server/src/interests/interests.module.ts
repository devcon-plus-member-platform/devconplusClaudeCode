import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { InterestsController } from './interests.controller';
import { InterestsRepository } from './interests.repository';
import { InterestsService } from './interests.service';

@Module({
  imports: [SupabaseModule],
  controllers: [InterestsController],
  providers: [InterestsService, InterestsRepository],
})
export class InterestsModule {}
