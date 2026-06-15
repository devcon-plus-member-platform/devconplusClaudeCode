import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Chapter } from '../supabase/types';
import type { CreateChapterDto } from './dto/create-chapter.dto';
import type { UpdateChapterDto } from './dto/update-chapter.dto';

interface ChapterXpRow {
  chapter: string;
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

  async getXpByChapter(): Promise<ChapterXpRow[]> {
    const { data, error } = await this.db.rpc('get_xp_by_chapter' as never);
    if (error) throw new BadRequestException(error.message);
    return ((data ?? []) as ChapterXpRow[]).map((row) => ({
      chapter: row.chapter,
      xp: row.xp,
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
