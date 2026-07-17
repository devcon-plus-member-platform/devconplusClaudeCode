import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { FeaturedStory } from '../supabase/types';
import type { CreateFeaturedStoryDto } from './dto/create-featured-story.dto';
import type { UpdateFeaturedStoryDto } from './dto/update-featured-story.dto';

@Injectable()
export class FeaturedStoriesRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  /** Active-only, for the public Home dashboard carousel. */
  async findActive(): Promise<FeaturedStory[]> {
    const result = await this.db
      .from('featured_stories')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    return this.unwrap(
      result as { data: FeaturedStory[] | null; error: { message: string } | null },
    );
  }

  /** All rows (active + inactive), for the CMS manager. */
  async findAll(): Promise<FeaturedStory[]> {
    const result = await this.db
      .from('featured_stories')
      .select('*')
      .order('created_at', { ascending: false });
    return this.unwrap(
      result as { data: FeaturedStory[] | null; error: { message: string } | null },
    );
  }

  async findById(id: string): Promise<FeaturedStory | null> {
    const result = await this.db
      .from('featured_stories')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return this.unwrapMaybe(
      result as { data: FeaturedStory | null; error: { message: string } | null },
    );
  }

  async create(dto: CreateFeaturedStoryDto): Promise<FeaturedStory> {
    const result = await this.db
      .from('featured_stories')
      .insert(dto)
      .select()
      .single();
    return this.unwrap(
      result as { data: FeaturedStory | null; error: { message: string } | null },
    );
  }

  async update(id: string, dto: UpdateFeaturedStoryDto): Promise<FeaturedStory> {
    const result = await this.db
      .from('featured_stories')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(
      result as { data: FeaturedStory | null; error: { message: string } | null },
    );
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('featured_stories').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }
}
