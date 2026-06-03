import { Injectable } from '@nestjs/common';
import { JobsRepository } from './jobs.repository';
import type { Job } from '../supabase/types';
import type { CreateJobDto } from './dto/create-job.dto';
import type { UpdateJobDto } from './dto/update-job.dto';

@Injectable()
export class JobsService {
  constructor(private readonly repo: JobsRepository) {}

  getActive(): Promise<Job[]> {
    return this.repo.findActive();
  }

  getAll(): Promise<Job[]> {
    return this.repo.findAll();
  }

  create(dto: CreateJobDto): Promise<Job> {
    return this.repo.create(dto);
  }

  update(id: string, dto: UpdateJobDto): Promise<Job> {
    return this.repo.update(id, dto);
  }

  delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
