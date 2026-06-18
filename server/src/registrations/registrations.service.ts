import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertEventScope } from '../common/authz/chapter-scope';
import type { Registration, RegistrantWithProfile } from '../supabase/types';
import { RegistrationsRepository } from './registrations.repository';

@Injectable()
export class RegistrationsService {
  constructor(private readonly repo: RegistrationsRepository) {}

  // ── Member ────────────────────────────────────────────────────────────────

  getMyRegistrations(user: AuthenticatedUser): Promise<Registration[]> {
    return this.repo.findByUser(user.profileId);
  }

  async register(user: AuthenticatedUser, eventId: string): Promise<Registration> {
    const cancelled = await this.repo.findCancelled(eventId, user.profileId);
    if (cancelled) {
      return this.repo.reactivateCancelled(cancelled.id);
    }
    return this.repo.insertRegistration(eventId, user.profileId);
  }

  async cancelRegistration(user: AuthenticatedUser, regId: string): Promise<void> {
    await this.repo.cancelRegistration(regId, user.profileId);
  }

  // ── Organizer ─────────────────────────────────────────────────────────────

  async getEventRegistrants(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<RegistrantWithProfile[]> {
    await this.assertEventChapterScope(user, eventId);
    return this.repo.findByEvent(eventId);
  }

  async approveRegistration(user: AuthenticatedUser, regId: string): Promise<void> {
    await this.assertRegChapterScope(user, regId);
    await this.repo.approveRegistration(regId);
  }

  async rejectRegistration(user: AuthenticatedUser, regId: string): Promise<void> {
    await this.assertRegChapterScope(user, regId);
    await this.repo.rejectRegistration(regId);
  }

  async revertRegistration(user: AuthenticatedUser, regId: string): Promise<void> {
    await this.assertRegChapterScope(user, regId);
    await this.repo.revertRegistration(regId);
  }

  async manualCheckin(
    user: AuthenticatedUser,
    regId: string,
  ): Promise<{ success: boolean; member_name: string; points_awarded: number }> {
    await this.assertRegChapterScope(user, regId);
    const result = await this.repo.manualCheckin(regId, user.profileId);
    if (!result?.success) {
      throw new BadRequestException(result?.error ?? 'Check-in failed');
    }
    return result;
  }

  // ── Chapter scope helpers ─────────────────────────────────────────────────

  private async assertEventChapterScope(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<void> {
    const scope = await this.repo.findEventChapterScope(eventId);
    assertEventScope(user, scope);
  }

  private async assertRegChapterScope(
    user: AuthenticatedUser,
    regId: string,
  ): Promise<void> {
    const eventId = await this.repo.findRegistrationEventId(regId);
    if (!eventId) throw new NotFoundException('Registration not found');
    await this.assertEventChapterScope(user, eventId);
  }
}
