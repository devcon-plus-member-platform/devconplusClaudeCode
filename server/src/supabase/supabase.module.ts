import { Global, Module } from '@nestjs/common';
import { SupabaseJwtService } from './supabase-jwt.service';
import { SupabaseService } from './supabase.service';

// Global module so any feature can inject either service without re-importing.
@Global()
@Module({
  providers: [SupabaseService, SupabaseJwtService],
  exports: [SupabaseService, SupabaseJwtService],
})
export class SupabaseModule {}
