import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertEventScope } from '../common/authz/chapter-scope';
import type { Registration, RegistrantWithProfile } from '../supabase/types';
import { RegistrationsRepository, type CustomFormField } from './registrations.repository';

/**
 * An "Other" free-text answer is encoded as `__other__:<text>` in the same
 * string / string[] shape as a preset option (see web EventRegister). A blank
 * one counts as unanswered — mirror the client so the two never disagree.
 */
const OTHER_PREFIX = '__other__:';

function isBlankAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') {
    const text = value.startsWith(OTHER_PREFIX) ? value.slice(OTHER_PREFIX.length) : value;
    return text.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.filter((v) => !isBlankAnswer(v)).length === 0;
  }
  return false;
}

@Injectable()
export class RegistrationsService {
  constructor(private readonly repo: RegistrationsRepository) {}

  // ── Member ────────────────────────────────────────────────────────────────

  getMyRegistrations(user: AuthenticatedUser): Promise<Registration[]> {
    return this.repo.findByUser(user.profileId);
  }

  async register(
    user: AuthenticatedUser,
    eventId: string,
    formResponses?: Record<string, unknown>,
  ): Promise<Registration> {
    const responses = await this.validateFormResponses(eventId, formResponses);

    const cancelled = await this.repo.findCancelled(eventId, user.profileId);
    if (cancelled) {
      return this.repo.reactivateCancelled(cancelled.id, responses);
    }
    return this.repo.insertRegistration(eventId, user.profileId, responses);
  }

  /**
   * Enforces the event's required custom questions server-side and strips any
   * key the schema doesn't define. The browser validates too, but that check is
   * advisory — this is the one that counts.
   *
   * Returns the answers to persist, or `null` when the event has no questions.
   */
  private async validateFormResponses(
    eventId: string,
    formResponses?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const schema: CustomFormField[] = await this.repo.findEventFormSchema(eventId);
    if (schema.length === 0) return null;

    const submitted = formResponses ?? {};

    const missing = schema
      .filter((field) => field.required && isBlankAnswer(submitted[field.id]))
      .map((field) => field.label || field.id);

    if (missing.length > 0) {
      throw new BadRequestException(
        `Please answer all required questions: ${missing.join(', ')}`,
      );
    }

    const cleaned: Record<string, unknown> = {};
    for (const field of schema) {
      if (!isBlankAnswer(submitted[field.id])) cleaned[field.id] = submitted[field.id];
    }
    return Object.keys(cleaned).length > 0 ? cleaned : null;
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
    const result = await this.repo.approveRegistration(regId, user.profileId);
    if (!result?.success) {
      const message =
        result?.error === 'capacity_full'
          ? 'Cannot approve — this event has reached its no-show buffer capacity.'
          : (result?.error ?? 'Approval failed');
      throw new BadRequestException(message);
    }
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
