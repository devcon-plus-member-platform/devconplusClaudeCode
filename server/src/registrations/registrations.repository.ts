import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Registration, RegistrantWithProfile } from '../supabase/types';

interface ManualCheckinRpcResult {
  success: boolean;
  member_name: string;
  points_awarded: number;
  error?: string;
}

interface ApproveRegistrationRpcResult {
  success: boolean;
  error?: string;
}

/** One custom registration question, as stored in `events.custom_form_schema`. */
export interface CustomFormField {
  id: string;
  label: string;
  required: boolean;
}

@Injectable()
export class RegistrationsRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  // ── Member ────────────────────────────────────────────────────────────────

  async findByUser(userId: string): Promise<Registration[]> {
    const result = await this.db
      .from('event_registrations')
      .select('*')
      .eq('user_id', userId);
    return this.unwrap(
      result as { data: Registration[] | null; error: { message: string } | null },
    );
  }

  /** Returns an existing cancelled row for this user+event, or null. */
  async findCancelled(eventId: string, userId: string): Promise<Registration | null> {
    const { data } = await this.db
      .from('event_registrations')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('status', 'cancelled')
      .maybeSingle();
    return (data ?? null) as Registration | null;
  }

  /** Re-registration: resets a cancelled row back to pending. */
  async reactivateCancelled(
    regId: string,
    formResponses?: Record<string, unknown> | null,
  ): Promise<Registration> {
    const result = await this.db
      .from('event_registrations')
      .update({
        status: 'pending',
        qr_code_token: null,
        // Overwrite prior answers on re-registration — the member just
        // re-submitted the form. `null` clears stale answers.
        form_responses: formResponses ?? null,
      })
      .eq('id', regId)
      .select()
      .single();
    return this.unwrap(
      result as { data: Registration | null; error: { message: string } | null },
    );
  }

  async insertRegistration(
    eventId: string,
    userId: string,
    formResponses?: Record<string, unknown> | null,
  ): Promise<Registration> {
    const result = await this.db
      .from('event_registrations')
      .insert({
        event_id: eventId,
        user_id: userId,
        form_responses: formResponses ?? null,
      })
      .select()
      .single();
    if (result.error?.message?.includes('registration_closed')) {
      throw new BadRequestException('Registration is closed for this event.');
    }
    return this.unwrap(
      result as { data: Registration | null; error: { message: string } | null },
    );
  }

  /** Cancel: owner-scoped — only updates if user_id matches. */
  async cancelRegistration(regId: string, userId: string): Promise<void> {
    const { error, count } = await this.db
      .from('event_registrations')
      .update({ status: 'cancelled', qr_code_token: null })
      .eq('id', regId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    if (count === 0) throw new NotFoundException('Registration not found or not owned by caller');
  }

  // ── Organizer ─────────────────────────────────────────────────────────────

  /** Fetches all non-cancelled registrations for an event, joined with member profile. */
  async findByEvent(eventId: string): Promise<RegistrantWithProfile[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('event_registrations')
      .select('id, status, registered_at, checked_in, approved_at, notified_at, qr_code_token, form_responses, user_id, event_id, profiles(full_name, email, school_or_company)')
      .eq('event_id', eventId)
      .neq('status', 'cancelled');

    if (error) throw new BadRequestException((error as { message: string }).message);

    return (data ?? []).map((row: Record<string, unknown>) => {
      const p = Array.isArray(row.profiles) ? (row.profiles as unknown[])[0] : row.profiles;
      const pObj = p as { full_name?: string; email?: string; school_or_company?: string } | null;
      return {
        id:                (row.id ?? '') as string,
        event_id:          (row.event_id ?? '') as string,
        user_id:           (row.user_id ?? '') as string,
        status:            (row.status ?? 'pending') as Registration['status'],
        qr_code_token:     (row.qr_code_token ?? null) as string | null,
        checked_in:        Boolean(row.checked_in),
        registered_at:     (row.registered_at ?? null) as string | null,
        approved_at:       (row.approved_at ?? null) as string | null,
        notified_at:       (row.notified_at ?? null) as string | null,
        member_name:       pObj?.full_name ?? 'Unknown',
        member_email:      pObj?.email ?? '',
        school_or_company: pObj?.school_or_company ?? '',
        form_responses:    (row.form_responses ?? null) as Record<string, unknown> | null,
      } satisfies RegistrantWithProfile;
    });
  }

  /**
   * Registrants eligible for a batch slot-notification send: not cancelled,
   * not already notified. Split into "confirmed" (approved) vs "full"
   * (pending/rejected) buckets by the caller.
   */
  async findUnnotifiedForEvent(eventId: string): Promise<RegistrantWithProfile[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('event_registrations')
      .select('id, status, registered_at, checked_in, approved_at, notified_at, qr_code_token, form_responses, user_id, event_id, profiles(full_name, email, school_or_company)')
      .eq('event_id', eventId)
      .in('status', ['approved', 'pending', 'rejected'])
      .is('notified_at', null);

    if (error) throw new BadRequestException((error as { message: string }).message);

    return (data ?? []).map((row: Record<string, unknown>) => {
      const p = Array.isArray(row.profiles) ? (row.profiles as unknown[])[0] : row.profiles;
      const pObj = p as { full_name?: string; email?: string; school_or_company?: string } | null;
      return {
        id:                (row.id ?? '') as string,
        event_id:          (row.event_id ?? '') as string,
        user_id:           (row.user_id ?? '') as string,
        status:            (row.status ?? 'pending') as Registration['status'],
        qr_code_token:     (row.qr_code_token ?? null) as string | null,
        checked_in:        Boolean(row.checked_in),
        registered_at:     (row.registered_at ?? null) as string | null,
        approved_at:       (row.approved_at ?? null) as string | null,
        notified_at:       (row.notified_at ?? null) as string | null,
        member_name:       pObj?.full_name ?? 'Unknown',
        member_email:      pObj?.email ?? '',
        school_or_company: pObj?.school_or_company ?? '',
        form_responses:    (row.form_responses ?? null) as Record<string, unknown> | null,
      } satisfies RegistrantWithProfile;
    });
  }

  /** Single registration's status + member contact, for the per-registrant notify button. */
  async findRegistrationForNotify(
    regId: string,
  ): Promise<{ status: Registration['status']; event_id: string; member_email: string; member_name: string } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('event_registrations')
      .select('status, event_id, profiles(full_name, email)')
      .eq('id', regId)
      .maybeSingle();

    if (error) throw new BadRequestException((error as { message: string }).message);
    if (!data) return null;

    const p = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
    const pObj = p as { full_name?: string; email?: string } | null;
    return {
      status: (data.status ?? 'pending') as Registration['status'],
      event_id: data.event_id as string,
      member_email: pObj?.email ?? '',
      member_name: pObj?.full_name ?? 'Unknown',
    };
  }

  /** Loads event fields needed to compose a slot-notification email, incl. chapter name. */
  async findEventForNotification(eventId: string): Promise<{
    title: string;
    description: string | null;
    location: string | null;
    event_date: string | null;
    end_time: string | null;
    requires_approval: boolean;
    chapter_name: string | null;
  } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (this.db as any)
      .from('events')
      .select('title, description, location, event_date, end_time, requires_approval, chapter_id, chapters(name)')
      .eq('id', eventId)
      .maybeSingle();

    if (error) throw new BadRequestException((error as { message: string }).message);
    if (!data) return null;

    const chapter = Array.isArray(data.chapters) ? data.chapters[0] : data.chapters;
    return {
      title: data.title as string,
      description: (data.description ?? null) as string | null,
      location: (data.location ?? null) as string | null,
      event_date: (data.event_date ?? null) as string | null,
      end_time: (data.end_time ?? null) as string | null,
      requires_approval: Boolean(data.requires_approval),
      chapter_name: (chapter?.name ?? null) as string | null,
    };
  }

  /** Marks the given registrations as having been sent a slot-notification email. */
  async markNotified(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from('event_registrations')
      .update({ notified_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw new BadRequestException(error.message);
  }

  /**
   * Loads chapter scope for an event. Distinguishes a missing event from an
   * existing HQ/program event that has no chapter:
   *   - returns `null`                 → event does not exist
   *   - returns `{ chapterId: null }`  → event exists but is HQ-scope (no chapter)
   *   - returns `{ chapterId: '…' }`   → event exists and belongs to a chapter
   */
  async findEventChapterScope(
    eventId: string,
  ): Promise<{ chapterId: string | null } | null> {
    const { data } = await this.db
      .from('events')
      .select('chapter_id')
      .eq('id', eventId)
      .maybeSingle();
    if (!data) return null;
    return { chapterId: (data.chapter_id ?? null) as string | null };
  }

  /**
   * Loads an event's custom registration questions. Returns `[]` when the event
   * has no custom form (or does not exist) — callers treat that as "nothing to
   * validate", never as an error.
   */
  async findEventFormSchema(eventId: string): Promise<CustomFormField[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (this.db as any)
      .from('events')
      .select('custom_form_schema')
      .eq('id', eventId)
      .maybeSingle();
    const schema = (data as { custom_form_schema?: unknown } | null)?.custom_form_schema;
    return Array.isArray(schema) ? (schema as CustomFormField[]) : [];
  }

  /** Loads registration to get event_id for chapter-scope check. */
  async findRegistrationEventId(regId: string): Promise<string | null> {
    const { data } = await this.db
      .from('event_registrations')
      .select('event_id')
      .eq('id', regId)
      .maybeSingle();
    return (data?.event_id ?? null) as string | null;
  }

  async approveRegistration(
    regId: string,
    organizerId: string,
  ): Promise<ApproveRegistrationRpcResult> {
    const { data, error } = await this.db.rpc('approve_registration_with_capacity' as never, {
      p_registration_id: regId,
      p_organizer_id:    organizerId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    return data as ApproveRegistrationRpcResult;
  }

  async rejectRegistration(regId: string): Promise<void> {
    const { error } = await this.db
      .from('event_registrations')
      .update({ status: 'rejected' })
      .eq('id', regId);
    if (error) throw new BadRequestException(error.message);
  }

  async revertRegistration(regId: string): Promise<void> {
    const { error } = await this.db
      .from('event_registrations')
      .update({ status: 'pending', approved_at: null, qr_code_token: null })
      .eq('id', regId);
    if (error) throw new BadRequestException(error.message);
  }

  async manualCheckin(
    regId: string,
    organizerId: string,
  ): Promise<ManualCheckinRpcResult> {
    const { data, error } = await this.db.rpc('manual_checkin' as never, {
      p_registration_id: regId,
      p_organizer_id:    organizerId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    return data as ManualCheckinRpcResult;
  }
}
