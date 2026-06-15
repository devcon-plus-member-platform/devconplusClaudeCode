import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { CacheKeys } from '../cache/cache-keys';
import { assertSameChapter } from '../common/authz/chapter-scope';
import { isAtLeast } from '../common/authz/authz';
import type {
  CoOrganizer,
  OrgCodeWithChapter,
  UpgradeRequestWithDetails,
} from '../supabase/types';
import type { CreateOrgCodeDto } from './dto/create-org-code.dto';
import type { RequestUpgradeDto } from './dto/request-upgrade.dto';
import type { UpdateOrgCodeDto } from './dto/update-org-code.dto';
import { UpgradesRepository } from './upgrades.repository';

export type UpgradeResult = 'submitted' | 'already_pending' | 'invalid_code' | 'wrong_chapter';

@Injectable()
export class UpgradesService {
  constructor(
    private readonly repo: UpgradesRepository,
    private readonly cache: AppCacheService,
  ) {}

  // ── Member: submit upgrade request ───────────────────────────────────────

  async requestUpgrade(user: AuthenticatedUser, dto: RequestUpgradeDto): Promise<{ status: UpgradeResult }> {
    const code = dto.code.toUpperCase();

    const alreadyPending = await this.repo.checkExistingPending(user.profileId);
    if (alreadyPending) throw new ConflictException('already_pending');

    const codeRow = await this.repo.validateCode(code);
    if (!codeRow) throw new BadRequestException('invalid_code');

    if (codeRow.chapter_id !== null && codeRow.chapter_id !== user.profile.chapter_id) {
      throw new ForbiddenException('wrong_chapter');
    }

    await this.repo.submitRequest(
      user.profileId,
      code,
      codeRow.chapter_id,
      codeRow.assigned_role,
    );
    return { status: 'submitted' };
  }

  // ── Admin: list all requests ──────────────────────────────────────────────

  getAllRequests(): Promise<UpgradeRequestWithDetails[]> {
    return this.repo.findAllRequests();
  }

  // ── Officer: chapter-scoped pending requests ──────────────────────────────

  getChapterRequests(user: AuthenticatedUser): Promise<UpgradeRequestWithDetails[]> {
    return this.repo.findChapterPendingRequests(user.profile.chapter_id);
  }

  // ── Admin: approve ────────────────────────────────────────────────────────

  async approveRequest(user: AuthenticatedUser, requestId: string): Promise<void> {
    const req = await this.repo.findRequestById(requestId);
    await this.repo.approveRequest(
      requestId,
      req.user_id,
      req.chapter_id ?? '',
      user.profileId,
      req.requested_role,
    );
    // Approval promotes the requester's role/chapter — bust their authz cache.
    await this.invalidateAuthProfile(req.user_id);
  }

  // ── Admin/Officer: reject ─────────────────────────────────────────────────

  async rejectRequest(user: AuthenticatedUser, requestId: string): Promise<void> {
    // Officers must be in the same chapter as the request's target chapter
    if (!isAtLeast(user.profile.role, 'hq_admin')) {
      const req = await this.repo.findRequestForChapterScope(requestId);
      if (req.chapter_id !== null) {
        assertSameChapter(user, req.chapter_id);
      } else {
        // HQ-scope code request — officers cannot reject those
        throw new ForbiddenException('Only HQ admins can reject HQ-scope upgrade requests');
      }
    }
    await this.repo.rejectRequest(requestId, user.profileId);
  }

  // ── Officer: officer-approve via officer_approve_upgrade RPC ─────────────

  async officerApproveRequest(user: AuthenticatedUser, requestId: string): Promise<void> {
    const req = await this.repo.findRequestForChapterScope(requestId);
    if (req.chapter_id !== null) {
      assertSameChapter(user, req.chapter_id);
    }
    await this.repo.officerApproveRequest(requestId, user.profileId);
    // Officer approval promotes the requester to chapter_officer — bust their cache.
    await this.invalidateAuthProfile(req.user_id);
  }

  // ── Organizer codes ───────────────────────────────────────────────────────

  getAllCodes(): Promise<OrgCodeWithChapter[]> {
    return this.repo.findAllCodes();
  }

  getChapterActiveCode(user: AuthenticatedUser): Promise<{ code: string } | null> {
    return this.repo.findChapterActiveCode(user.profile.chapter_id);
  }

  createCode(dto: CreateOrgCodeDto): Promise<OrgCodeWithChapter> {
    return this.repo.createCode(dto);
  }

  updateCode(id: string, dto: UpdateOrgCodeDto): Promise<OrgCodeWithChapter> {
    return this.repo.updateCode(id, dto);
  }

  deleteCode(id: string): Promise<void> {
    return this.repo.deleteCode(id);
  }

  // ── Co-organizers ─────────────────────────────────────────────────────────

  getCoOrganizers(user: AuthenticatedUser): Promise<CoOrganizer[]> {
    return this.repo.findCoOrganizers(user.profile.chapter_id, user.profileId);
  }

  async removeCoOrganizer(user: AuthenticatedUser, targetId: string): Promise<void> {
    // Verify target is in the same chapter before allowing demotion
    const coOrgs = await this.repo.findCoOrganizers(user.profile.chapter_id, user.profileId);
    const isInChapter = coOrgs.some((c) => c.id === targetId);
    if (!isInChapter && !isAtLeast(user.profile.role, 'hq_admin')) {
      throw new ForbiddenException('Target is not a co-organizer in your chapter');
    }
    await this.repo.demoteCoOrganizer(targetId, user.profileId);
    // Demotion changes the target's role back to member — bust their cache so the
    // elevated access does not linger for the TTL window.
    await this.invalidateAuthProfile(targetId);
  }

  // NOTE: requestUpgrade (sets pending_* on self) and rejectRequest (clears
  // pending_*) do NOT change role/chapter, and pending fields are not served from
  // the cached guard profile, so they need no auth-profile invalidation.

  /**
   * Bust the AuthGuard cache for a profile after a role/chapter change.
   * Resolves auth_uid in the repository (DAL-compliant) — these are rare
   * admin/officer actions, so the extra lookup is negligible.
   */
  private async invalidateAuthProfile(profileId: string | null): Promise<void> {
    if (!profileId) return;
    const authUid = await this.repo.getAuthUidById(profileId);
    if (authUid) await this.cache.del(CacheKeys.authProfile(authUid));
  }
}
