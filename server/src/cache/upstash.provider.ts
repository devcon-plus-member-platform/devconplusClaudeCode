import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

/** DI token for the (possibly null) Upstash Redis client. */
export const UPSTASH_CLIENT = Symbol('UPSTASH_CLIENT');

/**
 * Builds the Upstash REST client from env. When the credentials are absent
 * (local dev, CI, tests), this resolves to `null` — AppCacheService then runs
 * in pass-through no-op mode, so the app behaves exactly as it did pre-cache.
 * Cache is therefore *optional infrastructure*: nothing breaks without it.
 */
export const upstashProvider: Provider = {
  provide: UPSTASH_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis | null => {
    const url = config.get<string>('UPSTASH_REDIS_REST_URL');
    const token = config.get<string>('UPSTASH_REDIS_REST_TOKEN');
    const logger = new Logger('UpstashProvider');

    if (!url || !token) {
      logger.warn(
        'UPSTASH_REDIS_REST_URL/TOKEN not set — cache running in no-op mode',
      );
      return null;
    }

    logger.log('Upstash Redis cache client initialized');
    return new Redis({ url, token });
  },
};
