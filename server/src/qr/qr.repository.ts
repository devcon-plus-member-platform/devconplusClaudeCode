import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';

export interface RegistrationRow {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  checked_in: boolean;
}

export interface EventRow {
  id: string;
  title: string;
  points_value: number;
  chapter_id: string;
  is_chapter_locked: boolean;
}

export interface ScanResult {
  success: boolean;
  member_name?: string;
  points_awarded?: number;
  event_title?: string;
  already_checked_in?: boolean;
  pending?: boolean;
  registration_id?: string;
  already_approved?: boolean;
  rejected?: boolean;
  error?: string;
}

@Injectable()
export class QrRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  // ── Token generation validation ───────────────────────────────────────────

  async findApprovedRegistration(
    registrationId: string,
    userId: string,
  ): Promise<{ id: string; event_status: string } | null> {
    const { data } = await this.db
      .from('event_registrations')
      .select('id, events!inner(status)')
      .eq('id', registrationId)
      .eq('user_id', userId)
      .eq('status', 'approved')
      .maybeSingle();
    if (!data) return null;
    const ev = Array.isArray(data.events) ? data.events[0] : data.events;
    return { id: data.id, event_status: (ev as { status?: string } | null)?.status ?? '' };
  }

  async findPendingRegistration(
    registrationId: string,
    userId: string,
  ): Promise<{ id: string; event_status: string } | null> {
    const { data } = await this.db
      .from('event_registrations')
      .select('id, events!inner(status)')
      .eq('id', registrationId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();
    if (!data) return null;
    const ev = Array.isArray(data.events) ? data.events[0] : data.events;
    return { id: data.id, event_status: (ev as { status?: string } | null)?.status ?? '' };
  }

  // ── Scan processing ───────────────────────────────────────────────────────

  /**
   * For k='u' tokens: finds the member's most imminent approved, unchecked-in
   * event registration in the organizer's chapter.
   */
  async resolveUserRegistration(
    userId: string,
    chapterId: string | null,
  ): Promise<string | null> {
    let query = this.db
      .from('event_registrations')
      .select('id, events!inner(chapter_id, status, event_date)')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .eq('checked_in', false)
      .in('events.status', ['upcoming', 'ongoing'])
      .order('events.event_date', { ascending: true })
      .limit(1);

    if (chapterId !== null) {
      query = query.eq('events.chapter_id', chapterId);
    }

    const { data } = await query.maybeSingle();
    return data ? (data.id as string) : null;
  }

  async findRegistrationForScan(registrationId: string): Promise<RegistrationRow | null> {
    const { data } = await this.db
      .from('event_registrations')
      .select('id, user_id, event_id, status, checked_in')
      .eq('id', registrationId)
      .eq('status', 'approved')
      .maybeSingle();
    return (data ?? null) as RegistrationRow | null;
  }

  async findPendingRegistrationForDoor(registrationId: string): Promise<RegistrationRow | null> {
    const { data } = await this.db
      .from('event_registrations')
      .select('id, user_id, event_id, status')
      .eq('id', registrationId)
      .eq('status', 'pending')
      .maybeSingle();
    return (data ?? null) as RegistrationRow | null;
  }

  async findEvent(eventId: string): Promise<EventRow | null> {
    const { data } = await this.db
      .from('events')
      .select('id, title, points_value, chapter_id, is_chapter_locked')
      .eq('id', eventId)
      .maybeSingle();
    return (data ?? null) as EventRow | null;
  }

  async findMemberProfile(userId: string): Promise<{ full_name: string; chapter_id: string } | null> {
    const { data } = await this.db
      .from('profiles')
      .select('full_name, chapter_id')
      .eq('id', userId)
      .maybeSingle();
    return data
      ? { full_name: data.full_name as string, chapter_id: data.chapter_id as string }
      : null;
  }

  /**
   * Atomic conditional UPDATE: checked_in false→true.
   * Returns the claimed row if the update matched, null if already checked in.
   * This is the double-award prevention gate.
   */
  async atomicCheckIn(registrationId: string): Promise<{ id: string } | null> {
    const { data } = await this.db
      .from('event_registrations')
      .update({ checked_in: true })
      .eq('id', registrationId)
      .eq('checked_in', false)
      .select('id')
      .maybeSingle();
    return (data ?? null) as { id: string } | null;
  }

  async insertPointTransaction(
    userId: string,
    amount: number,
    description: string,
  ): Promise<void> {
    const { error } = await this.db.from('point_transactions').insert({
      user_id:     userId,
      amount,
      description,
      source: 'event_attendance',
    });
    if (error) throw new BadRequestException(error.message);
  }

  async incrementMemberPoints(userId: string, amount: number): Promise<void> {
    const { error } = await this.db.rpc('increment_member_points' as never, {
      p_user_id: userId,
      p_amount:  amount,
    } as never);
    if (error) throw new BadRequestException(error.message);
  }

  // ── Door approval ─────────────────────────────────────────────────────────

  /** Atomic approve: status pending→approved + checked_in=true in one UPDATE. */
  async atomicApproveAtDoor(registrationId: string): Promise<{ id: string } | null> {
    const { data } = await this.db
      .from('event_registrations')
      .update({ status: 'approved', checked_in: true })
      .eq('id', registrationId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    return (data ?? null) as { id: string } | null;
  }

  async rejectAtDoor(registrationId: string): Promise<void> {
    const { error } = await this.db
      .from('event_registrations')
      .update({ status: 'rejected' })
      .eq('id', registrationId);
    if (error) throw new NotFoundException(error.message);
  }
}
