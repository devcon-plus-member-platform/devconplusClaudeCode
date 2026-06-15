import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { NewsPost } from '../supabase/types';
import type { CreateNewsPostDto } from './dto/create-news-post.dto';
import type { UpdateNewsPostDto } from './dto/update-news-post.dto';

@Injectable()
export class NewsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findAll(): Promise<NewsPost[]> {
    const result = await this.db
      .from('news_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    return this.unwrap(
      result as { data: NewsPost[] | null; error: { message: string } | null },
    );
  }

  async findById(id: string): Promise<NewsPost | null> {
    const result = await this.db
      .from('news_posts')
      .select('*')
      .eq('id', id)
      .single();
    return this.unwrapMaybe(
      result as { data: NewsPost | null; error: { message: string } | null },
    );
  }

  async create(
    dto: CreateNewsPostDto & { author_id: string },
  ): Promise<NewsPost> {
    const result = await this.db
      .from('news_posts')
      .insert(dto)
      .select()
      .single();
    return this.unwrap(
      result as { data: NewsPost | null; error: { message: string } | null },
    );
  }

  async update(id: string, dto: UpdateNewsPostDto): Promise<NewsPost> {
    const result = await this.db
      .from('news_posts')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(
      result as { data: NewsPost | null; error: { message: string } | null },
    );
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('news_posts').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }
}
