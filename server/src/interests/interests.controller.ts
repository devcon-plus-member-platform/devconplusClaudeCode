import { Controller, Get } from '@nestjs/common';
import { InterestsService } from './interests.service';
import type { InterestOption } from '../supabase/types';

@Controller('interests')
export class InterestsController {
  constructor(private readonly service: InterestsService) {}

  /** GET /api/interests/options — public, no auth required */
  @Get('options')
  getOptions(): Promise<InterestOption[]> {
    return this.service.getOptions();
  }
}
