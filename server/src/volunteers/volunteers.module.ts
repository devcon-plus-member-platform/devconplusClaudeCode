import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { VolunteersController } from './volunteers.controller';
import { VolunteersRepository } from './volunteers.repository';
import { VolunteersService } from './volunteers.service';

@Module({
  imports: [SupabaseModule],
  controllers: [VolunteersController],
  providers: [VolunteersService, VolunteersRepository],
})
export class VolunteersModule {}
