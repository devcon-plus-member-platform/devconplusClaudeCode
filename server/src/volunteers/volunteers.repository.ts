import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  OrgVolunteerApplication,
  VolunteerApplication,
} from '../supabase/types';
import type { ApplyVolunteerDto } from './dto/apply-volunteer.dto';

interface ApproveRpcEnvelope {
  success: boolean;
  error?: string;
}

@Injectable()
export class VolunteersRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  // ── Member: own applications ──────────────────────────────────────────────

  async findByMember(userId: string): Promise<VolunteerApplication[]> {
    const result = await this.db
      .from('volunteer_applications')
      .select('*')
      .eq('user_id', userId)
      .order('applied_at', { ascending: false });
    return this.unwrap(
      result as { data: VolunteerApplication[] | null; error: { message: string } | null },
    );
  }

  async apply(userId: string, dto: ApplyVolunteerDto): Promise<VolunteerApplication> {
    const result = await this.db
      .from('volunteer_applications')
      .insert({
        event_id:            dto.eventId,
        user_id:             userId,
        reason:              dto.reason,
        phone_number:        dto.phone_number ?? null,
        social_media_handle: dto.social_media_handle ?? null,
      })
      .select()
      .single();
    return this.unwrap(
      result as { data: VolunteerApplication | null; error: { message: string } | null },
    );
  }

  // ── Organizer: chapter-scoped applications ────────────────────────────────

  /**
   * Returns all applications for a chapter. For hq_admin/super_admin pass
   * chapterId=null to skip the chapter filter (all chapters returned).
   */
  async findByChapter(chapterId: string | null): Promise<OrgVolunteerApplication[]> {
    let query = this.db
      .from('volunteer_applications')
      .select(`
        *,
        events!volunteer_applications_event_id_fkey!inner(title, chapter_id),
        profiles!volunteer_applications_user_id_fkey(full_name, email, school_or_company)
      `)
      .order('applied_at', { ascending: false })
      .limit(200);

    if (chapterId !== null) {
      query = query.eq('events.chapter_id', chapterId);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => {
      const ev = Array.isArray(row.events) ? row.events[0] : row.events;
      const p  = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const evObj = ev as { title?: string; chapter_id?: string } | null;
      const pObj  = p  as { full_name?: string; email?: string; school_or_company?: string } | null;
      return {
        id:                  row.id,
        event_id:            (row.event_id ?? '') as string,
        event_title:         evObj?.title ?? '',
        event_chapter_id:    evObj?.chapter_id ?? '',
        user_id:             (row.user_id ?? '') as string,
        member_name:         pObj?.full_name ?? 'Unknown',
        member_email:        pObj?.email ?? '',
        school_or_company:   pObj?.school_or_company ?? '',
        reason:              row.reason as string,
        phone_number:        (row.phone_number ?? null) as string | null,
        social_media_handle: (row.social_media_handle ?? null) as string | null,
        status:              (row.status ?? 'pending') as OrgVolunteerApplication['status'],
        applied_at:          (row.applied_at ?? null) as string | null,
        reviewed_at:         (row.reviewed_at ?? null) as string | null,
        reviewed_by:         (row.reviewed_by ?? null) as string | null,
      } satisfies OrgVolunteerApplication;
    });
  }

  /**
   * Fetches a single application joined with its event's chapter_id.
   * Used for chapter-scope validation before approve/reject/revert.
   */
  async findByIdWithChapter(id: string): Promise<{ id: string; event_chapter_id: string }> {
    const { data, error } = await this.db
      .from('volunteer_applications')
      .select('id, events!volunteer_applications_event_id_fkey(chapter_id)')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Volunteer application ${id} not found`);
    }
    const ev = Array.isArray(data.events) ? data.events[0] : data.events;
    const evObj = ev as { chapter_id?: string } | null;
    return { id: data.id, event_chapter_id: evObj?.chapter_id ?? '' };
  }

  // ── Approve (atomic RPC — awards points + marks approved) ─────────────────

  async approveApplication(id: string, organizerId: string): Promise<void> {
    const { data, error } = await this.db.rpc('approve_volunteer_application' as never, {
      p_application_id: id,
      p_organizer_id:   organizerId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    const result = data as ApproveRpcEnvelope | null;
    if (!result?.success) {
      throw new BadRequestException(result?.error ?? 'Approval failed');
    }
  }

  // ── Reject (direct UPDATE — no points change) ─────────────────────────────

  async rejectApplication(id: string, reviewerId: string): Promise<void> {
    const { error } = await this.db
      .from('volunteer_applications')
      .update({
        status:      'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }

  // ── Revert to pending (direct UPDATE — clears reviewer fields) ────────────

  async revertApplication(id: string): Promise<void> {
    const { error } = await this.db
      .from('volunteer_applications')
      .update({ status: 'pending', reviewed_by: null, reviewed_at: null })
      .eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }
}
