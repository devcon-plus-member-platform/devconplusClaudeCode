import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { NewsRepository } from './news.repository';
import type { NewsPost } from '../supabase/types';
import type { CreateNewsPostDto } from './dto/create-news-post.dto';
import type { UpdateNewsPostDto } from './dto/update-news-post.dto';

@Injectable()
export class NewsService {
  constructor(
    private readonly repo: NewsRepository,
    private readonly cache: AppCacheService,
  ) {}

  getAll(): Promise<NewsPost[]> {
    return this.cache.getOrSet(CacheKeys.NEWS_LIST, CACHE_TTL.NEWS, () =>
      this.repo.findAll(),
    );
  }

  getById(id: string): Promise<NewsPost> {
    return this.cache.getOrSet(CacheKeys.newsItem(id), CACHE_TTL.NEWS, async () => {
      const post = await this.repo.findById(id);
      if (!post) throw new NotFoundException(`News post ${id} not found`);
      return post;
    });
  }

  async create(
    dto: CreateNewsPostDto,
    user: AuthenticatedUser,
  ): Promise<NewsPost> {
    const post = await this.repo.create({
      ...dto,
      author_id: user.profileId,
    });
    await this.cache.del(CacheKeys.NEWS_LIST);
    return post;
  }

  async update(
    id: string,
    dto: UpdateNewsPostDto,
    _user: AuthenticatedUser,
  ): Promise<NewsPost> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`News post ${id} not found`);
    const updated = await this.repo.update(id, dto);
    await this.cache.del(CacheKeys.NEWS_LIST, CacheKeys.newsItem(id));
    return updated;
  }

  async delete(id: string, _user: AuthenticatedUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`News post ${id} not found`);
    await this.repo.delete(id);
    await this.cache.del(CacheKeys.NEWS_LIST, CacheKeys.newsItem(id));
  }
}
