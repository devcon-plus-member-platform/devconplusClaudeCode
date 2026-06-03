import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { IdParamDto } from '../common/dto/id-param.dto';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobsService } from './jobs.service';
import type { Job } from '../supabase/types';

@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService) {}

  /** GET /api/jobs — public active job listings. */
  @Get()
  getActive(): Promise<Job[]> {
    return this.service.getActive();
  }

  /**
   * GET /api/jobs/all — all jobs including inactive (hq_admin+).
   * Declared before :id to prevent NestJS routing 'all' as a param.
   */
  @Get('all')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  getAll(): Promise<Job[]> {
    return this.service.getAll();
  }

  /** POST /api/jobs — create a job listing (hq_admin+). */
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  create(@Body() dto: CreateJobDto): Promise<Job> {
    return this.service.create(dto);
  }

  /** PATCH /api/jobs/:id — update a job listing (hq_admin+). */
  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  update(@Param() { id }: IdParamDto, @Body() dto: UpdateJobDto): Promise<Job> {
    return this.service.update(id, dto);
  }

  /** DELETE /api/jobs/:id — delete a job listing (hq_admin+). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  delete(@Param() { id }: IdParamDto): Promise<void> {
    return this.service.delete(id);
  }
}
