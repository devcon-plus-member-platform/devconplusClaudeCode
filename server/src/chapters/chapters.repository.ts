import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Chapter } from '../supabase/types';
import type { CreateChapterDto } from './dto/create-chapter.dto';
import type { UpdateChapterDto } from './dto/update-chapter.dto';

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
    const [chaptersRes, profilesRes, eventsRes] = await Promise.all([
      this.db.from('chapters').select('id, name'),
      this.db.from('profiles').select('chapter_id, lifetime_points'),
      this.db.from('events').select('chapter_id'),
    ]);

    const chapters = this.unwrap(
      chaptersRes as {
        data: { id: string; name: string }[] | null;
        error: { message: string } | null;
      },
    );
    const profiles =
      (profilesRes.data as
        | { chapter_id: string | null; lifetime_points: number | null }[]
        | null) ?? [];
    const events =
      (eventsRes.data as { chapter_id: string | null }[] | null) ?? [];

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

  async create(dto: CreateChapterDto): Promise<Chapter> {
    const result = await this.db
      .from('chapters')
      .insert(dto)
      .select()
      .single();
    return this.unwrap(
      result as { data: Chapter | null; error: { message: string } | null },
    );
  }

  async update(id: string, dto: UpdateChapterDto): Promise<Chapter> {
    const result = await this.db
      .from('chapters')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(
      result as { data: Chapter | null; error: { message: string } | null },
    );
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('chapters').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }
}
