import { Global, Module } from '@nestjs/common';
import { AppCacheService } from './app-cache.service';
import { upstashProvider } from './upstash.provider';

/**
 * Global cache module. Marked @Global so every feature module can inject
 * AppCacheService without importing CacheModule explicitly.
 */
@Global()
@Module({
  providers: [upstashProvider, AppCacheService],
  exports: [AppCacheService],
})
export class CacheModule {}
