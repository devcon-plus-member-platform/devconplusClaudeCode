import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseRepository } from '../common/repository/base.repository';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  CoOrganizer,
  OrgCode,
  OrgCodeWithChapter,
  UpgradeRequest,
  UpgradeRequestWithDetails,
} from '../supabase/types';
import type { CreateOrgCodeDto } from './dto/create-org-code.dto';
import type { UpdateOrgCodeDto } from './dto/update-org-code.dto';

interface RpcEnvelope {
  success: boolean;
  error?: string;
}

@Injectable()
export class UpgradesRepository extends BaseRepository {
  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  // ── Upgrade requests ──────────────────────────────────────────────────────

  async checkExistingPending(userId: string): Promise<boolean> {
    const { data } = await this.db
      .from('organizer_upgrade_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();
    return data !== null;
  }

  async validateCode(code: string): Promise<OrgCode | null> {
    const { data } = await this.db
      .from('organizer_codes')
      .select('id, chapter_id, assigned_role, is_active, code, usage_limit, usage_count, expires_at, created_at')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    return (data ?? null) as OrgCode | null;
  }

  async submitRequest(
    userId: string,
    code: string,
    chapterId: string | null,
    requestedRole: string,
  ): Promise<void> {
    // Insert upgrade request
    const { error: reqErr } = await this.db
      .from('organizer_upgrade_requests')
      .insert({
        user_id:        userId,
        organizer_code: code,
        chapter_id:     chapterId,
        requested_role: requestedRole,
        status:         'pending',
      });
    if (reqErr) throw new BadRequestException(reqErr.message);

    // Mark pending state on profile so it is visible across the app
    const { error: profileErr } = await this.db
      .from('profiles')
      .update({ pending_role: requestedRole, pending_chapter_id: chapterId })
      .eq('id', userId);
    if (profileErr) throw new BadRequestException(profileErr.message);
  }

  async findAllRequests(): Promise<UpgradeRequestWithDetails[]> {
    const { data, error } = await this.db
      .from('organizer_upgrade_requests')
      .select(`
        *,
        profiles!user_id (full_name, email, chapter_id, chapters:chapter_id(name)),
        chapters:chapter_id (name)
      `)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => {
      const p  = Array.isArray(row.profiles)  ? row.profiles[0]  : row.profiles;
      const ch = Array.isArray(row.chapters)  ? row.chapters[0]  : row.chapters;
      const pObj  = p  as { full_name?: string; email?: string; chapter_id?: string; chapters?: { name?: string } | null } | null;
      const chObj = ch as { name?: string } | null;
      return {
        id:                   row.id,
        user_id:              (row.user_id ?? '') as string,
        organizer_code:       row.organizer_code as string,
        chapter_id:           (row.chapter_id ?? null) as string | null,
        requested_role:       (row.requested_role ?? 'chapter_officer') as UpgradeRequest['requested_role'],
        status:               (row.status ?? 'pending') as UpgradeRequest['status'],
        reviewed_by:          (row.reviewed_by ?? null) as string | null,
        reviewed_at:          (row.reviewed_at ?? null) as string | null,
        created_at:           row.created_at as string,
        member_name:          pObj?.full_name ?? 'Unknown',
        member_email:         pObj?.email ?? '',
        member_chapter_id:    pObj?.chapter_id ?? null,
        member_chapter_name:  (pObj?.chapters as { name?: string } | null)?.name ?? null,
        request_chapter_name: chObj?.name ?? null,
      } satisfies UpgradeRequestWithDetails;
    });
  }

  async findChapterPendingRequests(chapterId: string): Promise<UpgradeRequestWithDetails[]> {
    const { data, error } = await this.db
      .from('organizer_upgrade_requests')
      .select(`
        *,
        profiles!user_id (full_name, email, chapter_id, chapters:chapter_id(name)),
        chapters:chapter_id (name)
      `)
      .eq('chapter_id', chapterId)
      .eq('status', 'pending')
      .eq('requested_role', 'chapter_officer')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((row) => {
      const p  = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const ch = Array.isArray(row.chapters) ? row.chapters[0] : row.chapters;
      const pObj  = p  as { full_name?: string; email?: string; chapter_id?: string; chapters?: { name?: string } | null } | null;
      const chObj = ch as { name?: string } | null;
      return {
        id:                   row.id,
        user_id:              (row.user_id ?? '') as string,
        organizer_code:       row.organizer_code as string,
        chapter_id:           (row.chapter_id ?? null) as string | null,
        requested_role:       (row.requested_role ?? 'chapter_officer') as UpgradeRequest['requested_role'],
        status:               (row.status ?? 'pending') as UpgradeRequest['status'],
        reviewed_by:          (row.reviewed_by ?? null) as string | null,
        reviewed_at:          (row.reviewed_at ?? null) as string | null,
        created_at:           row.created_at as string,
        member_name:          pObj?.full_name ?? 'Unknown',
        member_email:         pObj?.email ?? '',
        member_chapter_id:    pObj?.chapter_id ?? null,
        member_chapter_name:  (pObj?.chapters as { name?: string } | null)?.name ?? null,
        request_chapter_name: chObj?.name ?? null,
      } satisfies UpgradeRequestWithDetails;
    });
  }

  async findRequestById(id: string): Promise<UpgradeRequest> {
    const { data, error } = await this.db
      .from('organizer_upgrade_requests')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException(`Upgrade request ${id} not found`);
    return data as unknown as UpgradeRequest;
  }

  async approveRequest(
    requestId: string,
    userId: string,
    chapterId: string,
    reviewerId: string,
    role: string,
  ): Promise<void> {
    const { data, error } = await this.db.rpc('approve_organizer_upgrade' as never, {
      p_request_id: requestId,
      p_user_id:    userId,
      p_chapter_id: chapterId,
      p_reviewer_id: reviewerId,
      p_role:       role,
    } as never);
    if (error) throw new BadRequestException(error.message);
    const result = data as RpcEnvelope | null;
    if (result && !result.success) throw new BadRequestException(result.error ?? 'Approval failed');
  }

  async rejectRequest(requestId: string, reviewerId: string): Promise<void> {
    const { data, error } = await this.db.rpc('reject_organizer_upgrade' as never, {
      p_request_id: requestId,
      p_user_id:    reviewerId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    const result = data as RpcEnvelope | null;
    if (result && !result.success) throw new BadRequestException(result.error ?? 'Rejection failed');
  }

  async officerApproveRequest(requestId: string, reviewerId: string): Promise<void> {
    const { data, error } = await this.db.rpc('officer_approve_upgrade' as never, {
      p_request_id:  requestId,
      p_reviewer_id: reviewerId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    const result = data as RpcEnvelope | null;
    if (result && !result.success) throw new BadRequestException(result.error ?? 'Officer approval failed');
  }

  // ── Organizer codes ───────────────────────────────────────────────────────

  async findAllCodes(): Promise<OrgCodeWithChapter[]> {
    const { data, error } = await this.db
      .from('organizer_codes')
      .select('*, chapters(name)')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => {
      const ch = Array.isArray(row.chapters) ? row.chapters[0] : row.chapters;
      const chObj = ch as { name?: string } | null;
      return {
        id:            row.id,
        code:          row.code,
        chapter_id:    row.chapter_id as string | null,
        assigned_role: (row.assigned_role ?? 'chapter_officer') as OrgCode['assigned_role'],
        is_active:     row.is_active as boolean,
        usage_limit:   (row.usage_limit ?? null) as number | null,
        usage_count:   (row.usage_count ?? 0) as number,
        expires_at:    (row.expires_at ?? null) as string | null,
        created_at:    row.created_at as string,
        chapter_name:  chObj?.name ?? null,
      } satisfies OrgCodeWithChapter;
    });
  }

  async findChapterActiveCode(chapterId: string): Promise<{ code: string } | null> {
    const { data } = await this.db
      .from('organizer_codes')
      .select('code')
      .eq('chapter_id', chapterId)
      .eq('assigned_role', 'chapter_officer')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    return data ? { code: data.code as string } : null;
  }

  async createCode(dto: CreateOrgCodeDto): Promise<OrgCodeWithChapter> {
    const { data, error } = await this.db
      .from('organizer_codes')
      .insert({
        code:          dto.code.toUpperCase(),
        chapter_id:    dto.chapter_id ?? null,
        assigned_role: dto.assigned_role,
        is_active:     true,
        usage_limit:   dto.usage_limit ?? null,
        usage_count:   0,
        expires_at:    dto.expires_at ?? null,
      })
      .select('*, chapters(name)')
      .single();
    if (error) throw new BadRequestException(error.message);
    const row = data as Record<string, unknown>;
    const ch  = Array.isArray(row.chapters) ? (row.chapters as unknown[])[0] : row.chapters;
    const chObj = ch as { name?: string } | null;
    return {
      id:            row.id as string,
      code:          row.code as string,
      chapter_id:    (row.chapter_id ?? null) as string | null,
      assigned_role: (row.assigned_role ?? 'chapter_officer') as OrgCode['assigned_role'],
      is_active:     row.is_active as boolean,
      usage_limit:   (row.usage_limit ?? null) as number | null,
      usage_count:   (row.usage_count ?? 0) as number,
      expires_at:    (row.expires_at ?? null) as string | null,
      created_at:    row.created_at as string,
      chapter_name:  chObj?.name ?? null,
    };
  }

  async updateCode(id: string, dto: UpdateOrgCodeDto): Promise<OrgCodeWithChapter> {
    const { data, error } = await this.db
      .from('organizer_codes')
      .update(dto as unknown as Record<string, unknown>)
      .eq('id', id)
      .select('*, chapters(name)')
      .single();
    if (error) throw new BadRequestException(error.message);
    const row = data as Record<string, unknown>;
    const ch  = Array.isArray(row.chapters) ? (row.chapters as unknown[])[0] : row.chapters;
    const chObj = ch as { name?: string } | null;
    return {
      id:            row.id as string,
      code:          row.code as string,
      chapter_id:    (row.chapter_id ?? null) as string | null,
      assigned_role: (row.assigned_role ?? 'chapter_officer') as OrgCode['assigned_role'],
      is_active:     row.is_active as boolean,
      usage_limit:   (row.usage_limit ?? null) as number | null,
      usage_count:   (row.usage_count ?? 0) as number,
      expires_at:    (row.expires_at ?? null) as string | null,
      created_at:    row.created_at as string,
      chapter_name:  chObj?.name ?? null,
    };
  }

  async deleteCode(id: string): Promise<void> {
    const { error } = await this.db.from('organizer_codes').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
  }

  // ── Co-organizers ─────────────────────────────────────────────────────────

  async findCoOrganizers(chapterId: string, excludeUserId: string): Promise<CoOrganizer[]> {
    const { data, error } = await this.db
      .from('profiles')
      .select('id, full_name, email, avatar_url, created_at')
      .eq('chapter_id', chapterId)
      .eq('role', 'chapter_officer')
      .neq('id', excludeUserId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as unknown as CoOrganizer[];
  }

  async demoteCoOrganizer(targetId: string, officerId: string): Promise<void> {
    const { data, error } = await this.db.rpc('officer_demote_coorganizer' as never, {
      p_target_id:  targetId,
      p_officer_id: officerId,
    } as never);
    if (error) throw new BadRequestException(error.message);
    const result = data as RpcEnvelope | null;
    if (result && !result.success) throw new BadRequestException(result.error ?? 'Demotion failed');
  }

  async findRequestForChapterScope(
    requestId: string,
  ): Promise<{ chapter_id: string | null; user_id: string | null }> {
    const { data, error } = await this.db
      .from('organizer_upgrade_requests')
      .select('chapter_id, user_id')
      .eq('id', requestId)
      .single();
    if (error || !data) throw new NotFoundException(`Upgrade request ${requestId} not found`);
    return {
      chapter_id: (data.chapter_id ?? null) as string | null,
      user_id: (data.user_id ?? null) as string | null,
    };
  }

  /** Look up a profile's Firebase auth_uid by profile id (for cache invalidation). */
  async getAuthUidById(profileId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from('profiles')
      .select('auth_uid')
      .eq('id', profileId)
      .maybeSingle();
    if (error) return null;
    return (data?.auth_uid as string | null) ?? null;
  }
}

// Named export for ConflictException — used in service for already_pending
export { ConflictException };
