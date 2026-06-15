import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.guard';

/**
 * Throws ForbiddenException if the caller is a chapter_officer whose chapter_id
 * does not match the resource's chapter. hq_admin and super_admin bypass this check.
 *
 * Port of the chapter-scope logic from award-points-on-scan edge function.
 */
export function assertSameChapter(
  user: AuthenticatedUser,
  resourceChapterId: string,
): void {
  const { role, chapter_id } = user.profile;
  if (role === 'hq_admin' || role === 'super_admin') return;
  if (chapter_id !== resourceChapterId) {
    throw new ForbiddenException('Resource belongs to a different chapter');
  }
}

/**
 * Throws ForbiddenException if the event is chapter-locked and the member's
 * chapter does not match the event's chapter.
 */
export function assertChapterLock(
  event: { is_chapter_locked: boolean; chapter_id: string },
  member: { chapter_id: string },
): void {
  if (event.is_chapter_locked && event.chapter_id !== member.chapter_id) {
    throw new ForbiddenException('This event is locked to its home chapter');
  }
}
