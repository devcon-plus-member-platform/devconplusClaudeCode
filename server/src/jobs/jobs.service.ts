import { Injectable } from '@nestjs/common';
import { AppCacheService } from '../cache/app-cache.service';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { JobsRepository } from './jobs.repository';
import type { Job } from '../supabase/types';
import type { CreateJobDto } from './dto/create-job.dto';
import type { UpdateJobDto } from './dto/update-job.dto';

@Injectable()
export class JobsService {
  constructor(
    private readonly repo: JobsRepository,
    private readonly cache: AppCacheService,
  ) {}

  getActive(): Promise<Job[]> {
    return this.cache.getOrSet(CacheKeys.JOBS_ACTIVE, CACHE_TTL.JOBS, () =>
      this.repo.findActive(),
    );
  }

  getAll(): Promise<Job[]> {
    return this.cache.getOrSet(CacheKeys.JOBS_ALL, CACHE_TTL.JOBS, () =>
      this.repo.findAll(),
    );
  }

  async create(dto: CreateJobDto): Promise<Job> {
    const job = await this.repo.create(dto);
    await this.invalidate();
    return job;
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    const job = await this.repo.update(id, dto);
    await this.invalidate();
    return job;
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
    await this.invalidate();
  }

  // A write may flip is_active either way, so both list views must be busted.
  private invalidate(): Promise<void> {
    return this.cache.del(CacheKeys.JOBS_ACTIVE, CacheKeys.JOBS_ALL);
  }
}
