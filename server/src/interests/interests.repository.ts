import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { InterestOption } from '../supabase/types';

@Injectable()
export class InterestsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findOptions(): Promise<InterestOption[]> {
    const result = await this.db
      .from('interest_options')
      .select('id, category, label, emoji')
      .order('id', { ascending: true });
    return this.unwrap(
      result as { data: InterestOption[] | null; error: { message: string } | null },
    );
  }
}
