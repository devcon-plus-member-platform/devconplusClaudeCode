import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { ChaptersRepository } from './chapters.repository';
import type { Chapter } from '../supabase/types';
import type { CreateChapterDto } from './dto/create-chapter.dto';
import type { UpdateChapterDto } from './dto/update-chapter.dto';

interface ChapterXpRow {
  chapter: string;
  xp: number;
}

@Injectable()
export class ChaptersService {
  constructor(private readonly repo: ChaptersRepository) {}

  getAll(): Promise<Chapter[]> {
    return this.repo.findAll();
  }

  getXpByChapter(): Promise<ChapterXpRow[]> {
    return this.repo.getXpByChapter();
  }

  create(dto: CreateChapterDto, _user: AuthenticatedUser): Promise<Chapter> {
    return this.repo.create(dto);
  }

  async update(
    id: string,
    dto: UpdateChapterDto,
    _user: AuthenticatedUser,
  ): Promise<Chapter> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    return this.repo.update(id, dto);
  }

  async delete(id: string, _user: AuthenticatedUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Chapter ${id} not found`);
    return this.repo.delete(id);
  }
}
