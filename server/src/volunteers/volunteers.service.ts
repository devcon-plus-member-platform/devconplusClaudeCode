import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertSameChapter } from '../common/authz/chapter-scope';
import { isAtLeast } from '../common/authz/authz';
import type { OrgVolunteerApplication, VolunteerApplication } from '../supabase/types';
import type { ApplyVolunteerDto } from './dto/apply-volunteer.dto';
import { VolunteersRepository } from './volunteers.repository';

@Injectable()
export class VolunteersService {
  constructor(private readonly repo: VolunteersRepository) {}

  getMyApplications(user: AuthenticatedUser): Promise<VolunteerApplication[]> {
    return this.repo.findByMember(user.profileId);
  }

  apply(user: AuthenticatedUser, dto: ApplyVolunteerDto): Promise<VolunteerApplication> {
    return this.repo.apply(user.profileId, dto);
  }

  getChapterApplications(user: AuthenticatedUser): Promise<OrgVolunteerApplication[]> {
    // hq_admin and super_admin see all chapters; officers are scoped to their own.
    const chapterId = isAtLeast(user.profile.role, 'hq_admin')
      ? null
      : user.profile.chapter_id;
    return this.repo.findByChapter(chapterId);
  }

  async approve(user: AuthenticatedUser, id: string): Promise<void> {
    const app = await this.repo.findByIdWithChapter(id);
    assertSameChapter(user, app.event_chapter_id);
    await this.repo.approveApplication(id, user.profileId);
  }

  async reject(user: AuthenticatedUser, id: string): Promise<void> {
    const app = await this.repo.findByIdWithChapter(id);
    assertSameChapter(user, app.event_chapter_id);
    await this.repo.rejectApplication(id, user.profileId);
  }

  async revert(user: AuthenticatedUser, id: string): Promise<void> {
    const app = await this.repo.findByIdWithChapter(id);
    assertSameChapter(user, app.event_chapter_id);
    await this.repo.revertApplication(id);
  }
}
