import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { FeaturedStoriesController } from './featured-stories.controller';
import { FeaturedStoriesRepository } from './featured-stories.repository';
import { FeaturedStoriesService } from './featured-stories.service';

@Module({
  imports: [SupabaseModule],
  controllers: [FeaturedStoriesController],
  providers: [FeaturedStoriesService, FeaturedStoriesRepository],
})
export class FeaturedStoriesModule {}
