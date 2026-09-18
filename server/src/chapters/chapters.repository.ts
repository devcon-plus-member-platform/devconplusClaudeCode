import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Chapter } from '../supabase/types';
import type { CreateChapterDto } from './dto/create-chapter.dto';
import type { UpdateChapterDto } from './dto/update-chapter.dto';

/** Escapes `%` and `_` so a chapter name can't be misread as an ilike wildcard pattern. */
function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, (char) => `\\${char}`);
}

export interface ChapterStatsRow {
  chapter_id: string;
  chapter: string;
  members: number;
  events: number;
  xp: number;
}

@Injectable()
export class ChaptersRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findAll(): Promise<Chapter[]> {
    const result = await this.db
      .from('chapters')
      .select('*')
      .order('name', { ascending: true });
    return this.unwrap(
      result as { data: Chapter[] | null; error: { message: string } | null },
    );
  }

  async findById(id: string): Promise<Chapter | null> {
    const result = await this.db
      .from('chapters')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return this.unwrapMaybe(
      result as { data: Chapter | null; error: { message: string } | null },
    );
  }

  // NOTE: computed from raw tables (profiles.chapter_id/lifetime_points,
  // events.chapter_id) rather than the legacy `get_xp_by_chapter` RPC — that
  // RPC's live-DB body drifts from the migrations and never counted events at
  // all. Mirrors the rollup admin.repository.ts already uses for chapterStats.
  async getStatsByChapter(): Promise<ChapterStatsRow[]> {
    // profiles/events are PAGED: a plain .select() stops at PostgREST's max-rows
    // (1000) and reports no error, so once the member table outgrew that cap this
    // rollup silently under-counted both members and XP for every chapter.
    const [chaptersRes, profiles, events] = await Promise.all([
      this.db.from('chapters').select('id, name'),
      this.fetchAllPages<{ chapter_id: string | null; lifetime_points: number | null }>(
        (from, to) =>
          this.db
            .from('profiles')
            .select('chapter_id, lifetime_points', { count: 'exact' })
            .order('id', { ascending: true })
            .range(from, to),
      ),
      this.fetchAllPages<{ chapter_id: string | null }>((from, to) =>
        this.db
          .from('events')
          .select('chapter_id', { count: 'exact' })
          .order('id', { ascending: true })
          .range(from, to),
      ),
    ]);

    const chapters = this.unwrap(
      chaptersRes as {
        data: { id: string; name: string }[] | null;
        error: { message: string } | null;
      },
    );

    const rollup = new Map<
      string,
      { members: number; events: number; xp: number }
    >();
    for (const c of chapters) rollup.set(c.id, { members: 0, events: 0, xp: 0 });
    for (const p of profiles) {
      if (!p.chapter_id) continue;
      const entry = rollup.get(p.chapter_id);
      if (!entry) continue; // orphaned chapter_id — skip
      entry.members += 1;
      entry.xp += p.lifetime_points ?? 0;
    }
    for (const e of events) {
      if (!e.chapter_id) continue;
      const entry = rollup.get(e.chapter_id);
      if (!entry) continue;
      entry.events += 1;
    }

    return chapters.map((c) => ({
      chapter_id: c.id,
      chapter: c.name,
      members: rollup.get(c.id)?.members ?? 0,
      events: rollup.get(c.id)?.events ?? 0,
      xp: rollup.get(c.id)?.xp ?? 0,
    }));
  }

  // ── Chapter leaderboard (ticket 01: single-chapter standing) ─────────────
  // Every list below is PAGED via fetchAllPages: a plain .select() stops at
  // PostgREST's max-rows (1000) with no error, and several chapters exceed it.

  async findSeasonEvents(
    chapterId: string,
    startIso: string,
    endIso: string,
  ): Promise<{ id: string; event_date: string | null }[]> {
    return this.fetchAllPages<{ id: string; event_date: string | null }>(
      (from, to) =>
        this.db
          .from('events')
          .select('id, event_date', { count: 'exact' })
          .eq('chapter_id', chapterId)
          .gte('event_date', startIso)
          .lt('event_date', endIso)
          .or('is_external.is.null,is_external.eq.false')
          .order('id', { ascending: true })
          .range(from, to),
    );
  }

  async findChapterProfiles(
    chapterId: string,
  ): Promise<{ id: string; created_at: string }[]> {
    return this.fetchAllPages<{ id: string; created_at: string }>((from, to) =>
      this.db
        .from('profiles')
        .select('id, created_at', { count: 'exact' })
        .eq('chapter_id', chapterId)
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  async findEventRegistrations(
    eventIds: string[],
  ): Promise<
    {
      event_id: string;
      user_id: string;
      status: string | null;
      checked_in: boolean | null;
    }[]
  > {
    if (eventIds.length === 0) return [];
    return this.fetchAllPages<{
      event_id: string;
      user_id: string;
      status: string | null;
      checked_in: boolean | null;
    }>((from, to) =>
      this.db
        .from('event_registrations')
        .select('event_id, user_id, status, checked_in', { count: 'exact' })
        .in('event_id', eventIds)
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  /**
   * Season-filtered point transactions across ALL chapters, narrowed to one
   * chapter in memory by the service. Filtering by thousands of member ids
   * with `.in('user_id', …)` would blow past URL limits on large chapters;
   * paging the season window is bounded by the same helper as everything else.
   * Reset ledger rows are accounting entries, not earnings — excluded here
   * (and defensively in the computation too).
   */
  async findSeasonTransactions(
    startIso: string,
    endIso: string,
  ): Promise<
    { user_id: string | null; amount: number | null; source: string | null }[]
  > {
    return this.fetchAllPages<{
      user_id: string | null;
      amount: number | null;
      source: string | null;
    }>((from, to) =>
      this.db
        .from('point_transactions')
        .select('user_id, amount, source', { count: 'exact' })
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .neq('source', 'reset')
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  // ── Chapter leaderboard, all-chapters scan (ticket 02) ────────────────────
  // One season-wide pass per table, grouped in memory by the service — eleven
  // per-chapter round trips would multiply PostgREST overhead for no benefit.

  async findAllSeasonEvents(
    startIso: string,
    endIso: string,
  ): Promise<{ id: string; chapter_id: string | null; event_date: string | null }[]> {
    return this.fetchAllPages<{
      id: string;
      chapter_id: string | null;
      event_date: string | null;
    }>((from, to) =>
      this.db
        .from('events')
        .select('id, chapter_id, event_date', { count: 'exact' })
        .gte('event_date', startIso)
        .lt('event_date', endIso)
        .or('is_external.is.null,is_external.eq.false')
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  async findAllProfiles(): Promise<
    { id: string; chapter_id: string | null; created_at: string }[]
  > {
    return this.fetchAllPages<{
      id: string;
      chapter_id: string | null;
      created_at: string;
    }>((from, to) =>
      this.db
        .from('profiles')
        .select('id, chapter_id, created_at', { count: 'exact' })
        .order('id', { ascending: true })
        .range(from, to),
    );
  }

  async findByNameCaseInsensitive(
    name: string,
    excludeId?: string,
  ): Promise<Chapter | null> {
    let query = this.db
      .from('chapters')
      .select('*')
      .ilike('name', escapeIlike(name));
    if (excludeId) query = query.neq('id', excludeId);
    const result = await query.maybeSingle();
    return this.unwrapMaybe(
      result as { data: Chapter | null; error: { message: string } | null },
    );
  }

  async create(dto: CreateChapterDto): Promise<Chapter> {
    const result = await this.db
      .from('chapters')
      .insert(dto)
      .select()
      .single();
    return this.unwrap(this.mapUniqueViolation(result));
  }

  async update(id: string, dto: UpdateChapterDto): Promise<Chapter> {
    const result = await this.db
      .from('chapters')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(this.mapUniqueViolation(result));
  }

  /**
   * BaseRepository.unwrap() maps any error to a 500, which is wrong for a
   * user-correctable unique-name clash — surface it as a 409 instead.
   */
  private mapUniqueViolation(result: {
    data: Chapter | null;
    error: { message: string; code?: string } | null;
  }): { data: Chapter | null; error: { message: string } | null } {
    if (result.error?.code === '23505') {
      throw new ConflictException(
        'A chapter with this name already exists.',
      );
    }
    return result as { data: Chapter | null; error: { message: string } | null };
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('chapters').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }
}
