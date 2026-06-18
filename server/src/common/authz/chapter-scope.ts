import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
 * Authorizes a caller against an event's scope for organizer/management actions.
 *
 * `scope` distinguishes three cases (see repository `findEventChapterScope`):
 *   - `null`                 → event does not exist        → NotFoundException
 *   - `{ chapterId: null }`  → HQ/program event, no chapter → hq_admin/super_admin only
 *   - `{ chapterId: '…' }`   → chapter event               → same-chapter rule
 *
 * A null chapter means "no owning chapter" — NOT "event not found". Chapter
 * officers may see such events in their list but cannot manage them.
 */
export function assertEventScope(
  user: AuthenticatedUser,
  scope: { chapterId: string | null } | null,
): void {
  if (!scope) throw new NotFoundException('Event not found');

  if (scope.chapterId === null) {
    const { role } = user.profile;
    if (role !== 'hq_admin' && role !== 'super_admin') {
      throw new ForbiddenException('Only HQ admins can manage HQ events');
    }
    return;
  }

  assertSameChapter(user, scope.chapterId);
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
