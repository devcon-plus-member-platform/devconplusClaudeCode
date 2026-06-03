import { Injectable } from '@nestjs/common';
import { InterestsRepository } from './interests.repository';
import type { InterestOption } from '../supabase/types';

@Injectable()
export class InterestsService {
  constructor(private readonly repo: InterestsRepository) {}

  getOptions(): Promise<InterestOption[]> {
    return this.repo.findOptions();
  }
}
