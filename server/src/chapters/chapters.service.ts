import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { assertSameChapter } from '../common/authz/chapter-scope';
import { ChaptersRepository, type ChapterStatsRow } from './chapters.repository';
import {
  computeChapterStanding,
  type ChapterStanding,
} from './chapter-standing';
import { getCurrentSeason } from './season';
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

  /**
   * Single-chapter participation standing (ticket 01).
   *
   * A chapter officer may request only their own chapter, enforced through
   * the existing chapter-scope helper; HQ admin and above may request any
   * chapter. Returns aggregate counts only — no member names or identifiers.
   */
  async getChapterStanding(
    user: AuthenticatedUser,
    chapterId: string,
  ): Promise<ChapterStanding> {
    assertSameChapter(user, chapterId);

    const chapter = await this.repo.findById(chapterId);
    if (!chapter) throw new NotFoundException(`Chapter ${chapterId} not found`);

    const season = getCurrentSeason(new Date());
    const startIso = season.start.toISOString();
    const endIso = season.end.toISOString();

    const [seasonEvents, profiles] = await Promise.all([
      this.repo.findSeasonEvents(chapterId, startIso, endIso),
      this.repo.findChapterProfiles(chapterId),
    ]);
    const [registrations, transactions] = await Promise.all([
      this.repo.findEventRegistrations(seasonEvents.map((e) => e.id)),
      this.repo.findSeasonTransactions(startIso, endIso),
    ]);

    return computeChapterStanding({
      chapterId: chapter.id,
      chapter: chapter.name,
      region: chapter.region,
      seasonEvents,
      profiles,
      registrations,
      transactions,
      seasonStartIso: startIso,
      computedAtIso: new Date().toISOString(),
    });
  }

  async create(dto: CreateChapterDto, _user: AuthenticatedUser): Promise<Chapter> {
    const name = dto.name.trim();
    if (await this.repo.findByNameCaseInsensitive(name)) {
      throw new ConflictException(`A chapter named "${name}" already exists.`);
    }
    const chapter = await this.repo.create({ ...dto, name });
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

    let updateDto = dto;
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (await this.repo.findByNameCaseInsensitive(name, id)) {
        throw new ConflictException(`A chapter named "${name}" already exists.`);
      }
      updateDto = { ...dto, name };
    }

    const updated = await this.repo.update(id, updateDto);
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
