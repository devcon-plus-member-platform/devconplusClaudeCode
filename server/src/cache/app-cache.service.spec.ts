import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { AppCacheService } from './app-cache.service';

// Minimal fake of the Upstash client surface AppCacheService uses.
function makeRedis() {
  return {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
}

function makeConfig(prefix: string | undefined = 'test') {
  return {
    get: jest.fn((key: string) => (key === 'CACHE_PREFIX' ? prefix : undefined)),
  } as unknown as ConfigService;
}

describe('AppCacheService', () => {
  // ── No-op mode (Upstash not configured) ──────────────────────────────────
  describe('no-op mode (redis = null)', () => {
    let cache: AppCacheService;
    beforeEach(() => {
      cache = new AppCacheService(null, makeConfig());
    });

    it('reports disabled', () => {
      expect(cache.enabled).toBe(false);
    });

    it('getOrSet runs the loader and returns its value', async () => {
      const loader = jest.fn().mockResolvedValue('fresh');
      expect(await cache.getOrSet('k', 60, loader)).toBe('fresh');
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('get returns null, set/del resolve without throwing', async () => {
      expect(await cache.get('k')).toBeNull();
      await expect(cache.set('k', 1, 60)).resolves.toBeUndefined();
      await expect(cache.del('k')).resolves.toBeUndefined();
    });
  });

  // ── Enabled mode ─────────────────────────────────────────────────────────
  describe('enabled mode', () => {
    let redis: ReturnType<typeof makeRedis>;
    let cache: AppCacheService;
    beforeEach(() => {
      redis = makeRedis();
      cache = new AppCacheService(redis as unknown as Redis, makeConfig('prod'));
    });

    it('returns the cached value on hit without calling the loader', async () => {
      redis.get.mockResolvedValue({ cached: true });
      const loader = jest.fn();
      expect(await cache.getOrSet('events:list', 60, loader)).toEqual({ cached: true });
      expect(loader).not.toHaveBeenCalled();
      expect(redis.get).toHaveBeenCalledWith('prod:events:list');
    });

    it('on miss: runs loader, sets the prefixed key with TTL, returns value', async () => {
      redis.get.mockResolvedValue(null);
      const loader = jest.fn().mockResolvedValue(['a', 'b']);
      expect(await cache.getOrSet('events:list', 60, loader)).toEqual(['a', 'b']);
      expect(loader).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith('prod:events:list', ['a', 'b'], { ex: 60 });
    });

    it('FAIL-OPEN: falls back to the loader when redis.get throws', async () => {
      redis.get.mockRejectedValue(new Error('upstash down'));
      const loader = jest.fn().mockResolvedValue('from-db');
      expect(await cache.getOrSet('k', 60, loader)).toBe('from-db');
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('del prefixes every key and forwards them to redis.del', async () => {
      await cache.del('rewards:catalog', 'rewards:all');
      expect(redis.del).toHaveBeenCalledWith('prod:rewards:catalog', 'prod:rewards:all');
    });

    it('del swallows redis errors (best-effort invalidation never throws)', async () => {
      redis.del.mockRejectedValue(new Error('upstash down'));
      await expect(cache.del('k')).resolves.toBeUndefined();
    });

    it('del with no keys is a no-op', async () => {
      await cache.del();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  // ── Prefix fallback ──────────────────────────────────────────────────────
  it('falls back to NODE_ENV then "dev" when CACHE_PREFIX is unset', () => {
    const config = {
      get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'staging' : undefined)),
    } as unknown as ConfigService;
    const redis = makeRedis();
    const cache = new AppCacheService(redis as unknown as Redis, config);
    return cache.del('k').then(() => {
      expect(redis.del).toHaveBeenCalledWith('staging:k');
    });
  });
});
