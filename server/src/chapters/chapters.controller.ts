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
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { IdParamDto } from '../common/dto/id-param.dto';
import { ChaptersService } from './chapters.service';
import type { ChapterStanding, StandingsResponse } from './chapter-standing';
import type { ChapterStatsRow } from './chapters.repository';
import type { Chapter } from '../supabase/types';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';

@Controller('chapters')
export class ChaptersController {
  constructor(private readonly service: ChaptersService) {}

  /** GET /api/chapters — public, no auth required */
  @Get()
  getAll(): Promise<Chapter[]> {
    return this.service.getAll();
  }

  /** GET /api/chapters/stats — hq_admin+: member/event/XP counts per chapter for admin views */
  @Get('stats')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  getStatsByChapter(): Promise<ChapterStatsRow[]> {
    return this.service.getStatsByChapter();
  }

  /**
   * GET /api/chapters/standings — chapter_officer+: every chapter ranked by
   * participation rate for the current season, aggregates only. All officers
   * see the same ordered list.
   */
  @Get('standings')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('chapter_officer')
  getStandings(): Promise<StandingsResponse> {
    return this.service.getStandings();
  }

  /**
   * GET /api/chapters/:id/standing — chapter_officer+: one chapter's
   * participation figures for the current season, aggregates only.
   * Officers are scoped to their own chapter; HQ admin+ may query any.
   */
  @Get(':id/standing')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('chapter_officer')
  getChapterStanding(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChapterStanding> {
    return this.service.getChapterStanding(user, id);
  }

  /** POST /api/chapters — hq_admin+: create a chapter */
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  create(
    @Body() dto: CreateChapterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Chapter> {
    return this.service.create(dto, user);
  }

  /** PATCH /api/chapters/:id — hq_admin+: update a chapter */
  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateChapterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Chapter> {
    return this.service.update(id, dto, user);
  }

  /** DELETE /api/chapters/:id — hq_admin+: delete a chapter */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  delete(
    @Param() { id }: IdParamDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.service.delete(id, user);
  }
}
