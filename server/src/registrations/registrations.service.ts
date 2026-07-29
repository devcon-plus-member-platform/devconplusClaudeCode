import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { assertEventScope } from '../common/authz/chapter-scope';
import { EmailService, type EventNotifyInfo } from '../email/email.service';
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
  constructor(
    private readonly repo: RegistrationsRepository,
    private readonly email: EmailService,
  ) {}

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

  // ── Slot notification emails (requires_approval events only) ────────────────

  /**
   * Batch send: emails every un-notified approved registrant a "Slot
   * Confirmed" notice (BCC) and every un-notified pending/rejected registrant
   * a "Slots Are Full" notice (BCC). Skips anyone already marked `notified_at`
   * so re-clicking the button never double-emails a registrant — unless
   * `force` is set, which resends to everyone regardless of prior state
   * (the organizer explicitly confirmed a resend).
   */
  async sendBatchNotifications(
    user: AuthenticatedUser,
    eventId: string,
    force = false,
  ): Promise<{ confirmedSent: number; fullSent: number; alreadyNotified: number }> {
    await this.assertEventChapterScope(user, eventId);
    const event = await this.repo.findEventForNotification(eventId);
    if (!event) throw new NotFoundException('Event not found');
    if (!event.requires_approval) {
      throw new BadRequestException(
        'This action is only available for events that require approval.',
      );
    }

    const allRows = await this.repo.findNotifiableForEvent(eventId);
    const alreadyNotified = allRows.filter((r) => r.notified_at !== null).length;
    const rows = force ? allRows : allRows.filter((r) => r.notified_at === null);

    const confirmed = rows.filter((r) => r.status === 'approved');
    const full = rows.filter((r) => r.status !== 'approved');
    if (confirmed.length === 0 && full.length === 0) {
      throw new BadRequestException(
        allRows.length === 0
          ? 'No registrants to notify for this event yet.'
          : 'No new registrants to notify — everyone has already been emailed.',
      );
    }

    const info = this.buildEventNotifyInfo(event);

    if (confirmed.length > 0) {
      await this.email.sendSlotConfirmedEmail(
        { bcc: confirmed.map((r) => r.member_email) },
        info,
      );
      await this.repo.markNotified(confirmed.map((r) => r.id));
    }
    if (full.length > 0) {
      await this.email.sendSlotsFullEmail({ bcc: full.map((r) => r.member_email) }, info);
      await this.repo.markNotified(full.map((r) => r.id));
    }

    return { confirmedSent: confirmed.length, fullSent: full.length, alreadyNotified };
  }

  /**
   * Per-registrant send: always (re)sends to this one registrant regardless
   * of prior `notified_at` state — an explicit single click is a deliberate
   * manual resend, unlike the batch path which skips already-notified rows.
   */
  async sendSingleNotification(
    user: AuthenticatedUser,
    regId: string,
  ): Promise<{ sent: boolean; status: Registration['status'] }> {
    await this.assertRegChapterScope(user, regId);
    const reg = await this.repo.findRegistrationForNotify(regId);
    if (!reg) throw new NotFoundException('Registration not found');

    const event = await this.repo.findEventForNotification(reg.event_id);
    if (!event) throw new NotFoundException('Event not found');
    if (!event.requires_approval) {
      throw new BadRequestException(
        'This action is only available for events that require approval.',
      );
    }

    const info = this.buildEventNotifyInfo(event);
    if (reg.status === 'approved') {
      await this.email.sendSlotConfirmedEmail({ to: reg.member_email }, info);
    } else {
      await this.email.sendSlotsFullEmail({ to: reg.member_email }, info);
    }
    await this.repo.markNotified([regId]);

    return { sent: true, status: reg.status };
  }

  private buildEventNotifyInfo(event: {
    title: string;
    description: string | null;
    location: string | null;
    event_date: string | null;
    end_time: string | null;
    chapter_name: string | null;
  }): EventNotifyInfo {
    const date = event.event_date ? new Date(event.event_date) : null;
    const dayLabel = date
      ? date.toLocaleDateString('en-PH', { weekday: 'long', timeZone: 'Asia/Manila' })
      : 'TBA';
    const dateLabel = date
      ? date.toLocaleDateString('en-PH', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'Asia/Manila',
        })
      : 'Date TBA';
    const startTime = date
      ? date.toLocaleTimeString('en-PH', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'Asia/Manila',
        })
      : null;
    const endTime = event.end_time ? this.formatTimeOfDay(event.end_time) : null;
    const timeLabel = startTime ? (endTime ? `${startTime} – ${endTime}` : startTime) : 'Time TBA';

    return {
      title: event.title,
      description: event.description,
      location: event.location,
      dayLabel,
      dateLabel,
      timeLabel,
      organizerName: event.chapter_name ?? 'DEVCON+ HQ',
    };
  }

  /** Formats a Postgres `time` column value (e.g. "17:00:00") as "5:00 PM". */
  private formatTimeOfDay(time: string): string {
    const [hh, mm] = time.split(':');
    const d = new Date();
    d.setHours(Number(hh), Number(mm), 0, 0);
    return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
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
