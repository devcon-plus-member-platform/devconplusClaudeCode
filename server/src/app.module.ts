import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { EmailModule } from './email/email.module';
import { FirebaseModule } from './firebase/firebase.module';
import { SupabaseModule } from './supabase/supabase.module';
import { RewardsModule } from './rewards/rewards.module';
import { UsersModule } from './users/users.module';
import { VolunteersModule } from './volunteers/volunteers.module';
import { UpgradesModule } from './upgrades/upgrades.module';
import { AdminModule } from './admin/admin.module';
import { QrModule } from './qr/qr.module';
import { RegistrationsModule } from './registrations/registrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Coarse per-IP flood guard (in-memory, single-instance EC2).
    // Identity-keyed security buckets (qr_scan, org_upgrade, etc.) use the
    // custom RateLimitGuard + check_rate_limit RPC instead.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 minute window
        limit: 300,  // 300 requests per IP per minute before flood-blocking
      },
    ]),
    FirebaseModule,
    SupabaseModule,
    EmailModule,
    AuthModule,
    UsersModule,
    RewardsModule,
    VolunteersModule,
    UpgradesModule,
    AdminModule,
    QrModule,
    RegistrationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply the coarse throttler globally so every endpoint gets flood protection
    // without needing to add @UseGuards(ThrottlerGuard) on every controller.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
