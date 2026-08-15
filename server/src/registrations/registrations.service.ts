import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

/** Outcome of a bulk approve/reject. Mirrored in web `types.ts` — keep the two in sync. */
export interface BulkRegistrationResult {
  /** How many ids the caller sent, before de-duping. */
  requested: number;
  /** Ids whose status actually changed. */
  succeeded: string[];
  /** Ids refused before or at the write: `not_in_event` | `invalid_status` | an RPC error. */
  failed: { id: string; reason: string }[];
  /** Ids never attempted because the batch stopped early. */
  skipped: string[];
  /** Why the batch stopped early, if it did. */
  stoppedReason: 'capacity_full' | null;
}

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

  /**
   * Approves many registrations for one event, in the order given, stopping the
   * moment the event hits its capacity + no-show-buffer ceiling.
   *
   * Partial success is the contract: rows approved before the stop STAY approved.
   * Rolling them back would be worse — the organizer would lose work and the
   * members would see their ticket appear and vanish.
   */
  async bulkApprove(
    user: AuthenticatedUser,
    eventId: string,
    registrationIds: string[],
  ): Promise<BulkRegistrationResult> {
    const { valid, invalid } = await this.resolveBulkTargets(user, eventId, registrationIds);

    const succeeded: string[] = [];
    const failed = [...invalid];
    const skipped: string[] = [];
    let stoppedReason: BulkRegistrationResult['stoppedReason'] = null;

    // Sequential on purpose. approve_registration_with_capacity takes a per-event
    // advisory lock, so parallel calls would only queue up while holding N pool
    // connections — and would destroy the deterministic "approve in list order
    // until full" contract the UI promises. The lock is transaction-scoped, so
    // looping releases it between rows and door check-ins can interleave.
    for (const regId of valid) {
      if (stoppedReason) {
        skipped.push(regId);
        continue;
      }

      const result = await this.repo.approveRegistration(regId, user.profileId);
      if (result?.success) {
        succeeded.push(regId);
        continue;
      }

      if (result?.error === 'capacity_full') {
        stoppedReason = 'capacity_full';
        skipped.push(regId);
        continue;
      }

      if (result?.error === 'unauthorized') {
        // RolesGuard should have caught this already; if the RPC disagrees, stop hard.
        throw new ForbiddenException('Not authorized to approve registrations');
      }

      // invalid_status / registration_not_found — a concurrent write beat us to
      // this row. Report it and keep going; the rest of the batch is still valid.
      failed.push({ id: regId, reason: result?.error ?? 'approve_failed' });
    }

    return { requested: registrationIds.length, succeeded, failed, skipped, stoppedReason };
  }

  /**
   * Rejects many registrations for one event.
   *
   * One scoped UPDATE rather than a loop: unlike approve there is no capacity
   * ceiling, no advisory lock and no token to mint, so per-row round trips would
   * buy nothing.
   */
  async bulkReject(
    user: AuthenticatedUser,
    eventId: string,
    registrationIds: string[],
  ): Promise<BulkRegistrationResult> {
    const { valid, invalid } = await this.resolveBulkTargets(user, eventId, registrationIds);

    const updated =
      valid.length > 0 ? await this.repo.rejectRegistrationsInEvent(eventId, valid) : [];
    const updatedSet = new Set(updated);

    return {
      requested: registrationIds.length,
      succeeded: updated,
      failed: [
        ...invalid,
        ...valid
          .filter((regId) => !updatedSet.has(regId))
          .map((regId) => ({ id: regId, reason: 'invalid_status' })),
      ],
      skipped: [],
      stoppedReason: null,
    };
  }

  /**
   * Authorizes a batch and splits it into actionable / refused ids.
   *
   * SECURITY: `approve_registration_with_capacity` only checks that the caller
   * holds an organizer ROLE — it never checks that the registration belongs to
   * the event the caller was authorized for. Without the membership filter below,
   * a chapter-A officer could approve chapter-B registrations by POSTing their
   * ids to their own event's bulk endpoint.
   *
   * Costs two round trips for the whole batch (scope check + status prefetch),
   * replacing the two-per-id that `assertRegChapterScope` would incur.
   */
  private async resolveBulkTargets(
    user: AuthenticatedUser,
    eventId: string,
    ids: string[],
  ): Promise<{ valid: string[]; invalid: { id: string; reason: string }[] }> {
    await this.assertEventChapterScope(user, eventId);

    const rows = await this.repo.findEventRegistrationStatuses(eventId);
    const statusById = new Map(rows.map((row) => [row.id, row.status]));

    const valid: string[] = [];
    const invalid: { id: string; reason: string }[] = [];
    const seen = new Set<string>();

    // Preserve caller order: it decides who gets the last seats when the batch
    // runs into the capacity ceiling. The web client sends oldest-registered
    // first so that allocation is first-come-first-served.
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);

      const status = statusById.get(id);
      if (status === undefined) {
        invalid.push({ id, reason: 'not_in_event' });
        continue;
      }
      if (status !== 'pending') {
        invalid.push({ id, reason: 'invalid_status' });
        continue;
      }
      valid.push(id);
    }

    return { valid, invalid };
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
