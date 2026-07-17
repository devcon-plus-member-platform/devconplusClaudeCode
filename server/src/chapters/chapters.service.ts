import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { ChaptersRepository, type ChapterStatsRow } from './chapters.repository';
import type { Chapter } from '../supabase/types';
import type { CreateChapterDto } from './dto/create-chapter.dto';
import type { UpdateChapterDto } from './dto/update-chapter.dto';

@Injectable()
export class ChaptersService {
  constructor(
    private readonly repo: ChaptersRepository,
    private readonly cache: AppCacheService,
  ) {}

  getAll(): Promise<Chapter[]> {
    return this.cache.getOrSet(CacheKeys.CHAPTERS_LIST, CACHE_TTL.CHAPTERS, () =>
      this.repo.findAll(),
    );
  }

  // NOT cached: member/event/XP counts change on every signup, event, or point award.
  getStatsByChapter(): Promise<ChapterStatsRow[]> {
    return this.repo.getStatsByChapter();
  }

  async create(dto: CreateChapterDto, _user: AuthenticatedUser): Promise<Chapter> {
    const chapter = await this.repo.create(dto);
    await this.cache.del(CacheKeys.CHAPTERS_LIST);
    return chapter;
  }

  async update(
    id: string,
    dto: UpdateChapterDto,
    _user: AuthenticatedUser,
  ): Promise<Chapter> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    const updated = await this.repo.update(id, dto);
    await this.cache.del(CacheKeys.CHAPTERS_LIST);
    return updated;
  }

  async delete(id: string, _user: AuthenticatedUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    await this.repo.delete(id);
    await this.cache.del(CacheKeys.CHAPTERS_LIST);
  }
}
