import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertChapterLock, assertSameChapter } from '../common/authz/chapter-scope';
import { QrRepository } from './qr.repository';
import { QrTokenService } from './qr-token.service';

@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  constructor(
    private readonly repo: QrRepository,
    private readonly tokens: QrTokenService,
  ) {}

  // ── Token generation ──────────────────────────────────────────────────────

  async generateRegistrationToken(
    user: AuthenticatedUser,
    registrationId: string,
  ): Promise<{ token: string; expires_at: number }> {
    const reg = await this.repo.findApprovedRegistration(registrationId, user.profileId);
    if (!reg) throw new NotFoundException('Registration not found or not approved.');
    if (reg.event_status === 'past') throw new BadRequestException('Event has already passed.');
    return this.tokens.signRegistrationToken(reg.id);
  }

  async generateUserToken(
    user: AuthenticatedUser,
  ): Promise<{ token: string; expires_at: number }> {
    return this.tokens.signUserToken(user.profileId);
  }

  async generatePendingToken(
    user: AuthenticatedUser,
    registrationId: string,
  ): Promise<{ token: string; expires_at: number }> {
    const reg = await this.repo.findPendingRegistration(registrationId, user.profileId);
    if (!reg) throw new NotFoundException('Registration not found or not in pending state.');
    if (reg.event_status === 'past') throw new BadRequestException('Event has already passed.');
    return this.tokens.signPendingToken(reg.id);
  }

  // ── Scan processing ───────────────────────────────────────────────────────

  async processScan(
    organizer: AuthenticatedUser,
    token: string,
  ): Promise<{
    success: boolean;
    pending?: boolean;
    registration_id?: string;
    member_name?: string;
    points_awarded?: number;
    event_title?: string;
    already_checked_in?: boolean;
    error?: string;
  }> {
    // 1. Verify JWT
    const verified = this.tokens.verifyToken(token);
    if (verified.expired) {
      return { success: false, error: 'token_expired' };
    }
    const { kind, registrationId: tokenRegId, userId: tokenUserId } = verified.payload;

    // 2. Handle k='p' (pending door-approval): return pending state for scanner UI
    if (kind === 'p' && tokenRegId) {
      const pendingReg = await this.repo.findPendingRegistrationForDoor(tokenRegId);
      if (!pendingReg) {
        return { success: false, error: 'Pending registration not found or already processed.' };
      }

      const [event, member] = await Promise.all([
        this.repo.findEvent(pendingReg.event_id),
        this.repo.findMemberProfile(pendingReg.user_id),
      ]);

      if (!event) return { success: false, error: 'Event not found.' };

      try {
        assertSameChapter(organizer, event.chapter_id);
      } catch {
        return { success: false, error: "This QR is for a different chapter's event." };
      }

      return {
        success: false,
        pending: true,
        registration_id: pendingReg.id,
        member_name: member?.full_name ?? 'Member',
        event_title: event.title,
      };
    }

    // 3. Handle k='u' (user identity): resolve registration from userId + organizer chapter
    let registrationId = tokenRegId ?? '';
    if (kind === 'u' && tokenUserId) {
      const chapterId = organizer.profile.role === 'chapter_officer'
        ? organizer.profile.chapter_id
        : null;
      const resolvedId = await this.repo.resolveUserRegistration(tokenUserId, chapterId);
      if (!resolvedId) {
        return {
          success: false,
          error: 'No upcoming registration found for this member at your chapter.',
        };
      }
      registrationId = resolvedId;
    }

    // 4. Load the registration (must be approved)
    const reg = await this.repo.findRegistrationForScan(registrationId);
    if (!reg) return { success: false, error: 'Invalid or unrecognized QR code.' };

    // 5. Load event (points, chapter, chapter-lock)
    const event = await this.repo.findEvent(reg.event_id);
    if (!event) return { success: false, error: 'Event not found.' };

    // 5b. Chapter scope: officers scoped to their chapter
    try {
      assertSameChapter(organizer, event.chapter_id);
    } catch {
      return { success: false, error: "This QR is for a different chapter's event." };
    }

    // 6. Load member
    const member = await this.repo.findMemberProfile(reg.user_id);

    // 6b. Chapter-lock enforcement
    if (event.is_chapter_locked && member?.chapter_id) {
      try {
        assertChapterLock(
          { is_chapter_locked: true, chapter_id: event.chapter_id },
          { chapter_id: member.chapter_id },
        );
      } catch {
        return { success: false, error: 'This event is locked to its home chapter.' };
      }
    }

    // 7. Atomic check-in (double-award gate)
    const claimed = await this.repo.atomicCheckIn(reg.id);
    if (!claimed) {
      return {
        success: false,
        already_checked_in: true,
        member_name: member?.full_name ?? 'Member',
      };
    }

    // 8. Award points (non-atomic but protected by step 7)
    await this.repo.insertPointTransaction(
      reg.user_id,
      event.points_value,
      `Attended: ${event.title}`,
    );
    await this.repo.incrementMemberPoints(reg.user_id, event.points_value);

    this.logger.log(
      `Scan success — member=${reg.user_id} event=${reg.event_id} pts=${event.points_value}`,
    );

    return {
      success: true,
      member_name: member?.full_name ?? 'Member',
      points_awarded: event.points_value,
      event_title: event.title,
    };
  }

  // ── Door action (approve/reject pending) ──────────────────────────────────

  async processDoorAction(
    organizer: AuthenticatedUser,
    registrationId: string,
    action: 'approve' | 'reject',
  ): Promise<{
    success: boolean;
    rejected?: boolean;
    already_approved?: boolean;
    member_name?: string;
    points_awarded?: number;
    event_title?: string;
    error?: string;
  }> {
    const reg = await this.repo.findPendingRegistrationForDoor(registrationId);
    if (!reg) throw new NotFoundException('Registration not found or not pending.');

    const [event, member] = await Promise.all([
      this.repo.findEvent(reg.event_id),
      this.repo.findMemberProfile(reg.user_id),
    ]);
    if (!event) throw new NotFoundException('Event not found.');

    const memberName = member?.full_name ?? 'Member';

    // Chapter scope
    assertSameChapter(organizer, event.chapter_id);

    // Chapter-lock
    if (event.is_chapter_locked && member?.chapter_id) {
      assertChapterLock(
        { is_chapter_locked: true, chapter_id: event.chapter_id },
        { chapter_id: member.chapter_id },
      );
    }

    if (action === 'reject') {
      await this.repo.rejectAtDoor(registrationId);
      return { success: true, rejected: true, member_name: memberName };
    }

    // Approve: atomic pending→approved + checked_in
    const claimed = await this.repo.atomicApproveAtDoor(registrationId);
    if (!claimed) {
      return { success: false, already_approved: true, member_name: memberName };
    }

    await this.repo.insertPointTransaction(
      reg.user_id,
      event.points_value,
      `Attended: ${event.title}`,
    );
    await this.repo.incrementMemberPoints(reg.user_id, event.points_value);

    this.logger.log(
      `Door approval — member=${reg.user_id} event=${reg.event_id} pts=${event.points_value}`,
    );

    return {
      success: true,
      member_name: memberName,
      points_awarded: event.points_value,
      event_title: event.title,
    };
  }

  // ── Not yet reached ───────────────────────────────────────────────────────

  assertChapterForDoor(organizer: AuthenticatedUser, eventChapterId: string): void {
    try {
      assertSameChapter(organizer, eventChapterId);
    } catch {
      throw new ForbiddenException("This registration is for a different chapter's event.");
    }
  }
}
