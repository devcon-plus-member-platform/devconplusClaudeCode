import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import { RateLimitRepository } from '../common/throttler/rate-limit.repository';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [SupabaseModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, RateLimitGuard, RateLimitRepository],
  exports: [UsersService],
})
export class UsersModule {}
