import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Job } from '../supabase/types';
import type { CreateJobDto } from './dto/create-job.dto';
import type { UpdateJobDto } from './dto/update-job.dto';

@Injectable()
export class JobsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async findActive(): Promise<Job[]> {
    const result = await this.db
      .from('jobs')
      .select('*')
      .eq('is_active', true)
      .order('posted_at', { ascending: true })
      .limit(50);
    return this.unwrap(
      result as { data: Job[] | null; error: { message: string } | null },
    );
  }

  async findAll(): Promise<Job[]> {
    const result = await this.db
      .from('jobs')
      .select('*')
      .order('posted_at', { ascending: false })
      .limit(200);
    return this.unwrap(
      result as { data: Job[] | null; error: { message: string } | null },
    );
  }

  async create(dto: CreateJobDto): Promise<Job> {
    const result = await this.db
      .from('jobs')
      .insert([dto])
      .select()
      .single();
    return this.unwrap(
      result as { data: Job | null; error: { message: string } | null },
    );
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    const result = await this.db
      .from('jobs')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    return this.unwrap(
      result as { data: Job | null; error: { message: string } | null },
    );
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.from('jobs').delete().eq('id', id);
    this.unwrap(
      result as { data: null; error: { message: string } | null },
    );
  }
}
