import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { NewsRepository } from './news.repository';
import type { NewsPost } from '../supabase/types';
import type { CreateNewsPostDto } from './dto/create-news-post.dto';
import type { UpdateNewsPostDto } from './dto/update-news-post.dto';

@Injectable()
export class NewsService {
  constructor(private readonly repo: NewsRepository) {}

  getAll(): Promise<NewsPost[]> {
    return this.repo.findAll();
  }

  async getById(id: string): Promise<NewsPost> {
    const post = await this.repo.findById(id);
    if (!post) throw new NotFoundException(`News post ${id} not found`);
    return post;
  }

  create(
    dto: CreateNewsPostDto,
    user: AuthenticatedUser,
  ): Promise<NewsPost> {
    return this.repo.create({
      ...dto,
      author_id: user.profileId,
    });
  }

  async update(
    id: string,
    dto: UpdateNewsPostDto,
    _user: AuthenticatedUser,
  ): Promise<NewsPost> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`News post ${id} not found`);
    return this.repo.update(id, dto);
  }

  async delete(id: string, _user: AuthenticatedUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`News post ${id} not found`);
    return this.repo.delete(id);
  }
}
