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
import { FeaturedStoriesService } from './featured-stories.service';
import type { FeaturedStory } from '../supabase/types';
import { CreateFeaturedStoryDto } from './dto/create-featured-story.dto';
import { UpdateFeaturedStoryDto } from './dto/update-featured-story.dto';

@Controller('featured-stories')
export class FeaturedStoriesController {
  constructor(private readonly service: FeaturedStoriesService) {}

  /** GET /api/featured-stories — public, no auth required: active stories for the Home carousel */
  @Get()
  getActive(): Promise<FeaturedStory[]> {
    return this.service.getActive();
  }

  /** GET /api/featured-stories/admin — hq_admin+: all stories (incl. inactive) for the CMS manager */
  @Get('admin')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  getAllForAdmin(): Promise<FeaturedStory[]> {
    return this.service.getAllForAdmin();
  }

  /** POST /api/featured-stories — hq_admin+: create a featured story */
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  create(
    @Body() dto: CreateFeaturedStoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FeaturedStory> {
    return this.service.create(dto, user);
  }

  /** PATCH /api/featured-stories/:id — hq_admin+: update a featured story */
  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('hq_admin')
  update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateFeaturedStoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FeaturedStory> {
    return this.service.update(id, dto, user);
  }

  /** DELETE /api/featured-stories/:id — hq_admin+: delete a featured story */
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
