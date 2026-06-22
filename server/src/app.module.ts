import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserAwareThrottlerGuard } from './common/throttler/user-aware-throttler.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { EmailModule } from './email/email.module';
import { FirebaseModule } from './firebase/firebase.module';
import { SupabaseModule } from './supabase/supabase.module';
import { CacheModule } from './cache/cache.module';
import { RewardsModule } from './rewards/rewards.module';
import { UsersModule } from './users/users.module';
import { VolunteersModule } from './volunteers/volunteers.module';
import { UpgradesModule } from './upgrades/upgrades.module';
import { AdminModule } from './admin/admin.module';
import { QrModule } from './qr/qr.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { PointsModule } from './points/points.module';
import { MissionsModule } from './missions/missions.module';
import { InterestsModule } from './interests/interests.module';
import { NewsModule } from './news/news.module';
import { ChaptersModule } from './chapters/chapters.module';
import { ReferralsModule } from './referrals/referrals.module';
import { JobsModule } from './jobs/jobs.module';
import { EventsModule } from './events/events.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    // Coarse flood guard (in-memory, single-instance EC2). Keyed by authenticated
    // user when a Bearer token is present, else by IP — see UserAwareThrottlerGuard.
    // Identity-keyed security buckets (login, qr_scan, org_upgrade, etc.) use the
    // custom RateLimitGuard + check_rate_limit RPC instead.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 minute window
        // Raised from 300: authenticated traffic is now keyed per-user, so this
        // mainly bounds anonymous/guest requests. It must clear a shared venue/CGNAT
        // IP — a few hundred simultaneous sign-ins + guest browsing on launch — without
        // flood-blocking. Tune via redeploy if a launch event is larger.
        limit: 1200,
      },
    ]),
    FirebaseModule,
    SupabaseModule,
    // Global cache layer (Upstash Redis; no-op when UPSTASH_* env is absent).
    CacheModule,
    EmailModule,
    AuthModule,
    UsersModule,
    RewardsModule,
    VolunteersModule,
    UpgradesModule,
    AdminModule,
    QrModule,
    RegistrationsModule,
    PointsModule,
    MissionsModule,
    InterestsModule,
    NewsModule,
    ChaptersModule,
    ReferralsModule,
    JobsModule,
    EventsModule,
    AnnouncementsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Log every request centrally so all routes include their final status code.
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    // Apply the coarse throttler globally so every endpoint gets flood protection
    // without needing to add @UseGuards() on every controller. UserAwareThrottlerGuard
    // keys by authenticated user (Bearer sub) when possible, else by IP.
    { provide: APP_GUARD, useClass: UserAwareThrottlerGuard },
  ],
})
export class AppModule {}
