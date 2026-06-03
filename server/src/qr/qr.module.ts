import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import { RateLimitRepository } from '../common/throttler/rate-limit.repository';
import { QrController } from './qr.controller';
import { QrRepository } from './qr.repository';
import { QrService } from './qr.service';
import { QrTokenService } from './qr-token.service';

@Module({
  imports: [SupabaseModule],
  controllers: [QrController],
  providers: [
    QrService,
    QrTokenService,
    QrRepository,
    RateLimitRepository,
    RateLimitGuard,
  ],
})
export class QrModule {}
