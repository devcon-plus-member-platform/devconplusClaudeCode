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
  orderStandings,
  type ChapterStanding,
  type StandingsResponse,
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
   *
   * The season filter ends at the present moment, not at next June: an event
   * that has not taken place yet is not counted as held, so it neither
   * creates eligibility nor divides the average. Cached for one hour like the
   * standings list; the scope check runs before the cache is consulted.
   */
  async getChapterStanding(
    user: AuthenticatedUser,
    chapterId: string,
  ): Promise<ChapterStanding> {
    assertSameChapter(user, chapterId);

    const now = new Date();
    const season = getCurrentSeason(now);
    const startIso = season.start.toISOString();
    const endIso = season.end.toISOString();
    // Upper bound of the season window: the earlier of the season end and now.
    const heldThroughIso = now.toISOString() < endIso ? now.toISOString() : endIso;

    return this.cache.getOrSet(
      CacheKeys.standing(startIso, chapterId),
      CACHE_TTL.STANDINGS,
      async () => {
        const chapter = await this.repo.findById(chapterId);
        if (!chapter)
          throw new NotFoundException(`Chapter ${chapterId} not found`);

        const [seasonEvents, profiles] = await Promise.all([
          this.repo.findSeasonEvents(chapterId, startIso, heldThroughIso),
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
      },
    );
  }

  /**
   * All-chapters standings for the current season (ticket 02).
   *
   * Every officer sees the same ordered list of aggregate figures — no
   * member names cross a chapter boundary. Ordering and rank assignment are
   * the server's responsibility so both surfaces agree. Cached for one hour:
   * the feature is read-only, so hourly staleness is acceptable and no write
   * invalidates the key.
   */
  async getStandings(): Promise<StandingsResponse> {
    const now = new Date();
    const season = getCurrentSeason(now);
    const startIso = season.start.toISOString();
    const endIso = season.end.toISOString();
    // Same present-moment bound as the single-chapter view: scheduled events
    // are not held events.
    const heldThroughIso = now.toISOString() < endIso ? now.toISOString() : endIso;

    return this.cache.getOrSet(
      CacheKeys.standings(startIso),
      CACHE_TTL.STANDINGS,
      async () => {
        const [chapters, seasonEvents, profiles] = await Promise.all([
          this.repo.findAll(),
          this.repo.findAllSeasonEvents(startIso, heldThroughIso),
          this.repo.findAllProfiles(),
        ]);
        const [registrations, transactions] = await Promise.all([
          this.repo.findEventRegistrations(seasonEvents.map((e) => e.id)),
          this.repo.findSeasonTransactions(startIso, endIso),
        ]);

        const computedAtIso = new Date().toISOString();
        const eventsByChapter = new Map<string, typeof seasonEvents>();
        for (const e of seasonEvents) {
          if (!e.chapter_id) continue;
          const list = eventsByChapter.get(e.chapter_id) ?? [];
          list.push(e);
          eventsByChapter.set(e.chapter_id, list);
        }
        const profilesByChapter = new Map<string, typeof profiles>();
        for (const p of profiles) {
          if (!p.chapter_id) continue;
          const list = profilesByChapter.get(p.chapter_id) ?? [];
          list.push(p);
          profilesByChapter.set(p.chapter_id, list);
        }
        const eventChapterById = new Map(
          seasonEvents
            .filter((e) => e.chapter_id !== null)
            .map((e) => [e.id, e.chapter_id as string]),
        );
        const regsByChapter = new Map<string, typeof registrations>();
        for (const r of registrations) {
          const chapterId = eventChapterById.get(r.event_id);
          if (!chapterId) continue;
          const list = regsByChapter.get(chapterId) ?? [];
          list.push(r);
          regsByChapter.set(chapterId, list);
        }

        // Inactive chapters are off the board entirely. A dormant chapter holds no
        // events, so it would otherwise render as "No events this season" — which
        // per CONTEXT.md asserts a chapter tried and nobody came. Its members keep
        // their chapter; only the ranking excludes it.
        const standings = chapters
          .filter((c) => c.is_active)
          .map((c) =>
            computeChapterStanding({
              chapterId: c.id,
              chapter: c.name,
              region: c.region,
              seasonEvents: eventsByChapter.get(c.id) ?? [],
              profiles: profilesByChapter.get(c.id) ?? [],
              registrations: regsByChapter.get(c.id) ?? [],
              transactions,
              seasonStartIso: startIso,
              computedAtIso,
            }),
          );

        return { standings: orderStandings(standings), computedAt: computedAtIso };
      },
    );
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
