import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../common/authz/roles.decorator';
import { RolesGuard } from '../common/authz/roles.guard';
import { NewsService } from './news.service';
import { IdParamDto } from '../common/dto/id-param.dto';
import type { NewsPost } from '../supabase/types';
import { CreateNewsPostDto } from './dto/create-news-post.dto';
import { UpdateNewsPostDto } from './dto/update-news-post.dto';

@Controller('news')
export class NewsController {
  constructor(private readonly service: NewsService) {}

  /** GET /api/news — public, no auth required */
  @Get()
  getAll(): Promise<NewsPost[]> {
    return this.service.getAll();
  }

  /** GET /api/news/:id — public, no auth required */
  @Get(':id')
  getById(@Param() { id }: IdParamDto): Promise<NewsPost> {
    return this.service.getById(id);
  }

  /** POST /api/news — hq_admin+: create a news post */
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  create(
    @Body() dto: CreateNewsPostDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NewsPost> {
    return this.service.create(dto, user);
  }

  /** PATCH /api/news/:id — hq_admin+: update a news post */
  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateNewsPostDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NewsPost> {
    return this.service.update(id, dto, user);
  }

  /** DELETE /api/news/:id — hq_admin+: delete a news post */
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
