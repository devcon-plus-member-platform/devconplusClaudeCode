import { Injectable } from '@nestjs/common';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { InterestsRepository } from './interests.repository';
import type { InterestOption } from '../supabase/types';

@Injectable()
export class InterestsService {
  constructor(
    private readonly repo: InterestsRepository,
    private readonly cache: AppCacheService,
  ) {}

  // Static seed data (no write endpoints) → long TTL, no invalidation needed.
  getOptions(): Promise<InterestOption[]> {
    return this.cache.getOrSet(CacheKeys.INTERESTS_OPTIONS, CACHE_TTL.INTERESTS, () =>
      this.repo.findOptions(),
    );
  }
}
