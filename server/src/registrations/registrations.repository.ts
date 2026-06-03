import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type { Registration, RegistrantWithProfile } from '../supabase/types';

interface ManualCheckinRpcResult {
  success: boolean;
  member_name: string;
  points_awarded: number;
  error?: string;
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
  async reactivateCancelled(regId: string): Promise<Registration> {
    const result = await this.db
      .from('event_registrations')
      .update({ status: 'pending', qr_code_token: null })
      .eq('id', regId)
      .select()
      .single();
    return this.unwrap(
      result as { data: Registration | null; error: { message: string } | null },
    );
  }

  async insertRegistration(eventId: string, userId: string): Promise<Registration> {
    const result = await this.db
      .from('event_registrations')
      .insert({ event_id: eventId, user_id: userId })
      .select()
      .single();
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
      .select('id, status, registered_at, checked_in, approved_at, qr_code_token, form_responses, user_id, event_id, profiles(full_name, email, school_or_company)')
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
        member_name:       pObj?.full_name ?? 'Unknown',
        member_email:      pObj?.email ?? '',
        school_or_company: pObj?.school_or_company ?? '',
        form_responses:    (row.form_responses ?? null) as Record<string, unknown> | null,
      } satisfies RegistrantWithProfile;
    });
  }

  /** Loads just enough to perform chapter-scope validation. */
  async findEventChapterId(eventId: string): Promise<string | null> {
    const { data } = await this.db
      .from('events')
      .select('chapter_id')
      .eq('id', eventId)
      .maybeSingle();
    return (data?.chapter_id ?? null) as string | null;
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

  async approveRegistration(regId: string): Promise<void> {
    const qrToken = 'DCN-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    const { error } = await this.db
      .from('event_registrations')
      .update({
        status:        'approved',
        approved_at:   new Date().toISOString(),
        qr_code_token: qrToken,
      })
      .eq('id', regId);
    if (error) throw new BadRequestException(error.message);
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
