import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsRepository } from './registrations.repository';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [SupabaseModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, RegistrationsRepository],
})
export class RegistrationsModule {}
