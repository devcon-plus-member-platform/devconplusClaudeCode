import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ChaptersController } from './chapters.controller';
import { ChaptersRepository } from './chapters.repository';
import { ChaptersService } from './chapters.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ChaptersController],
  providers: [ChaptersService, ChaptersRepository],
})
export class ChaptersModule {}
