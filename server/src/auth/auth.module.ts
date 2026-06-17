import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import { RateLimitRepository } from '../common/throttler/rate-limit.repository';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

// FirebaseModule and SupabaseModule are @Global() — injected automatically.
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RateLimitGuard, RateLimitRepository],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
