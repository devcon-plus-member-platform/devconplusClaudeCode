import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { FeaturedStoriesRepository } from './featured-stories.repository';
import type { FeaturedStory } from '../supabase/types';
import type { CreateFeaturedStoryDto } from './dto/create-featured-story.dto';
import type { UpdateFeaturedStoryDto } from './dto/update-featured-story.dto';

@Injectable()
export class FeaturedStoriesService {
  constructor(
    private readonly repo: FeaturedStoriesRepository,
    private readonly cache: AppCacheService,
  ) {}

  /** GET /featured-stories — active-only, for the Home dashboard carousel. */
  getActive(): Promise<FeaturedStory[]> {
    return this.cache.getOrSet(
      CacheKeys.FEATURED_STORIES_ACTIVE,
      CACHE_TTL.FEATURED_STORIES,
      () => this.repo.findActive(),
    );
  }

  /** GET /featured-stories/admin — all rows, for the CMS manager. */
  getAllForAdmin(): Promise<FeaturedStory[]> {
    return this.cache.getOrSet(
      CacheKeys.FEATURED_STORIES_ALL,
      CACHE_TTL.FEATURED_STORIES,
      () => this.repo.findAll(),
    );
  }

  async create(
    dto: CreateFeaturedStoryDto,
    _user: AuthenticatedUser,
  ): Promise<FeaturedStory> {
    const story = await this.repo.create(dto);
    await this.invalidate();
    return story;
  }

  async update(
    id: string,
    dto: UpdateFeaturedStoryDto,
    _user: AuthenticatedUser,
  ): Promise<FeaturedStory> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Featured story ${id} not found`);
    const updated = await this.repo.update(id, dto);
    await this.invalidate();
    return updated;
  }

  async delete(id: string, _user: AuthenticatedUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Featured story ${id} not found`);
    await this.repo.delete(id);
    await this.invalidate();
  }

  private invalidate(): Promise<void> {
    return this.cache.del(
      CacheKeys.FEATURED_STORIES_ACTIVE,
      CacheKeys.FEATURED_STORIES_ALL,
    );
  }
}
