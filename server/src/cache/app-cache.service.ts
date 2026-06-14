import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { UPSTASH_CLIENT } from './upstash.provider';

/**
 * The only cache surface the rest of the app touches.
 *
 * Two hard guarantees:
 *  1. FAIL-OPEN. Every Redis operation is wrapped — any error/timeout falls
 *     back to the loader (reads) or is swallowed with a warn (writes/dels).
 *     A cache outage degrades to "uncached", never to a failed request. This
 *     matters most on the auth hot path, where the AuthGuard depends on it.
 *  2. NO-OP when unconfigured. If Upstash creds are absent the injected client
 *     is null and every method behaves as if there were no cache at all.
 *
 * All keys are prefixed with CACHE_PREFIX (defaults to NODE_ENV) so the shared
 * Upstash database is safe across the staging/prod containers on one EC2 box.
 */
@Injectable()
export class AppCacheService {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly prefix: string;

  constructor(
    @Inject(UPSTASH_CLIENT) private readonly redis: Redis | null,
    config: ConfigService,
  ) {
    this.prefix =
      config.get<string>('CACHE_PREFIX') ??
      config.get<string>('NODE_ENV') ??
      'dev';
  }

  /** Whether a live Upstash client is wired (false = no-op mode). */
  get enabled(): boolean {
    return this.redis !== null;
  }

  private k(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * Return the cached value for `key`, or run `loader`, cache its result for
   * `ttlSeconds`, and return it. Never throws from the cache path.
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    if (!this.redis) return loader();

    try {
      const cached = await this.redis.get<T>(this.k(key));
      if (cached !== null && cached !== undefined) return cached;
    } catch (err) {
      this.logger.warn(`cache get failed for "${key}": ${String(err)}`);
      return loader();
    }

    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /** Raw get — returns null on miss or any error. */
  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      return (await this.redis.get<T>(this.k(key))) ?? null;
    } catch (err) {
      this.logger.warn(`cache get failed for "${key}": ${String(err)}`);
      return null;
    }
  }

  /** Best-effort set with TTL. Swallows errors. */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(this.k(key), value, { ex: ttlSeconds });
    } catch (err) {
      this.logger.warn(`cache set failed for "${key}": ${String(err)}`);
    }
  }

  /**
   * Best-effort invalidation. A failed del is logged (loud, so a missed bust is
   * visible) but never throws — the TTL backstop self-heals it within seconds.
   */
  async del(...keys: string[]): Promise<void> {
    if (!this.redis || keys.length === 0) return;
    try {
      await this.redis.del(...keys.map((key) => this.k(key)));
    } catch (err) {
      this.logger.warn(`cache del failed for [${keys.join(', ')}]: ${String(err)}`);
    }
  }
}
