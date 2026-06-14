import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import type { AppCacheService } from '../cache/app-cache.service';
import type { Profile } from '../supabase/types';
import { UpgradesRepository } from './upgrades.repository';
import { UpgradesService } from './upgrades.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CH_1 = 'chapter-1';
const CH_2 = 'chapter-2';
const REQ_ID = 'req-uuid-001';

function makeUser(role: Profile['role'], chapterId: string, profileId = 'uid-1'): AuthenticatedUser {
  return {
    firebaseUid: 'fb-' + profileId,
    profileId,
    profile: { id: profileId, role, chapter_id: chapterId } as Profile,
  };
}

const member  = makeUser('member',          CH_1, 'member-1');
const officer1 = makeUser('chapter_officer', CH_1, 'officer-1');
const officer2 = makeUser('chapter_officer', CH_2, 'officer-2');
const admin   = makeUser('hq_admin',        CH_1, 'admin-1');

const mockCodeRow = {
  id: 'code-uuid', code: 'DCN-ABC-1234', chapter_id: CH_1,
  assigned_role: 'chapter_officer' as const, is_active: true,
  usage_limit: null, usage_count: 0, expires_at: null, created_at: '2026-01-01',
};

// ── Mock repository ────────────────────────────────────────────────────────────

function makeRepo() {
  return {
    checkExistingPending:      jest.fn().mockResolvedValue(false),
    validateCode:              jest.fn().mockResolvedValue(mockCodeRow),
    submitRequest:             jest.fn().mockResolvedValue(undefined),
    findAllRequests:           jest.fn().mockResolvedValue([]),
    findChapterPendingRequests:jest.fn().mockResolvedValue([]),
    findRequestById:           jest.fn().mockResolvedValue({
      id: REQ_ID, user_id: 'member-1', chapter_id: CH_1,
      requested_role: 'chapter_officer', organizer_code: 'DCN-ABC-1234',
      status: 'pending', reviewed_by: null, reviewed_at: null, created_at: '2026-01-01',
    }),
    findRequestForChapterScope:jest.fn().mockResolvedValue({ chapter_id: CH_1, user_id: 'member-1' }),
    approveRequest:            jest.fn().mockResolvedValue(undefined),
    rejectRequest:             jest.fn().mockResolvedValue(undefined),
    officerApproveRequest:     jest.fn().mockResolvedValue(undefined),
    getAuthUidById:            jest.fn().mockResolvedValue('fb-member-1'),
    findAllCodes:              jest.fn().mockResolvedValue([]),
    findChapterActiveCode:     jest.fn().mockResolvedValue(null),
    createCode:                jest.fn().mockResolvedValue({ id: 'code-id', code: 'DCN-ABC-1234' }),
    updateCode:                jest.fn().mockResolvedValue({ id: 'code-id', is_active: false }),
    deleteCode:                jest.fn().mockResolvedValue(undefined),
    findCoOrganizers:          jest.fn().mockResolvedValue([]),
    demoteCoOrganizer:         jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<UpgradesRepository>;
}

function makeCache() {
  return {
    getOrSet: jest.fn((_k: string, _ttl: number, loader: () => unknown) => loader()),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AppCacheService>;
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('UpgradesService', () => {
  let service: UpgradesService;
  let repo: jest.Mocked<UpgradesRepository>;
  let cache: jest.Mocked<AppCacheService>;

  beforeEach(() => {
    repo = makeRepo();
    cache = makeCache();
    service = new UpgradesService(repo, cache);
  });

  // ── requestUpgrade ────────────────────────────────────────────────────────

  describe('requestUpgrade', () => {
    it('returns submitted on success', async () => {
      const result = await service.requestUpgrade(member, { code: 'DCN-ABC-1234' });
      expect(result).toEqual({ status: 'submitted' });
      expect(repo.submitRequest).toHaveBeenCalledWith('member-1', 'DCN-ABC-1234', CH_1, 'chapter_officer');
    });

    it('throws ConflictException (already_pending) when pending request exists', async () => {
      repo.checkExistingPending.mockResolvedValue(true);
      await expect(service.requestUpgrade(member, { code: 'DCN-ABC-1234' }))
        .rejects.toBeInstanceOf(ConflictException);
    });

    it('throws BadRequestException (invalid_code) when code not found', async () => {
      repo.validateCode.mockResolvedValue(null);
      await expect(service.requestUpgrade(member, { code: 'DCN-XYZ-9999' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException (wrong_chapter) when chapter does not match', async () => {
      repo.validateCode.mockResolvedValue({ ...mockCodeRow, chapter_id: CH_2 });
      await expect(service.requestUpgrade(member, { code: 'DCN-ABC-1234' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts HQ-scope code (null chapter_id) regardless of member chapter', async () => {
      repo.validateCode.mockResolvedValue({ ...mockCodeRow, chapter_id: null });
      const result = await service.requestUpgrade(member, { code: 'DCN-ABC-1234' });
      expect(result.status).toBe('submitted');
    });
  });

  // ── rejectRequest: chapter-scope ─────────────────────────────────────────

  describe('rejectRequest', () => {
    it('allows officer in same chapter to reject', async () => {
      await service.rejectRequest(officer1, REQ_ID);
      expect(repo.rejectRequest).toHaveBeenCalledWith(REQ_ID, 'officer-1');
    });

    it('throws ForbiddenException for officer in different chapter', async () => {
      // officer2 is CH_2, request is CH_1
      await expect(service.rejectRequest(officer2, REQ_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.rejectRequest).not.toHaveBeenCalled();
    });

    it('hq_admin can reject without chapter scope check', async () => {
      repo.findRequestForChapterScope.mockResolvedValue({ chapter_id: CH_2, user_id: 'member-1' }); // different chapter
      await service.rejectRequest(admin, REQ_ID);
      expect(repo.rejectRequest).toHaveBeenCalledWith(REQ_ID, 'admin-1');
    });

    it('throws ForbiddenException if officer tries to reject HQ-scope request', async () => {
      repo.findRequestForChapterScope.mockResolvedValue({ chapter_id: null, user_id: 'member-1' });
      await expect(service.rejectRequest(officer1, REQ_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── officerApproveRequest: chapter-scope ─────────────────────────────────

  describe('officerApproveRequest', () => {
    it('succeeds when officer is in same chapter as request', async () => {
      await service.officerApproveRequest(officer1, REQ_ID);
      expect(repo.officerApproveRequest).toHaveBeenCalledWith(REQ_ID, 'officer-1');
    });

    it('throws ForbiddenException for officer in different chapter', async () => {
      await expect(service.officerApproveRequest(officer2, REQ_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── approveRequest ────────────────────────────────────────────────────────

  describe('approveRequest', () => {
    it('passes reviewer id from token — not from request body', async () => {
      await service.approveRequest(admin, REQ_ID);
      expect(repo.approveRequest).toHaveBeenCalledWith(
        REQ_ID, 'member-1', CH_1, 'admin-1', 'chapter_officer',
      );
    });

    it('busts the promoted user\'s auth-profile cache (cross-user)', async () => {
      await service.approveRequest(admin, REQ_ID);
      expect(repo.getAuthUidById).toHaveBeenCalledWith('member-1');
      expect(cache.del).toHaveBeenCalledWith('authprofile:fb-member-1');
    });
  });

  // ── cross-user cache invalidation on role changes ─────────────────────────

  describe('auth-profile invalidation', () => {
    it('officerApproveRequest busts the promoted user', async () => {
      await service.officerApproveRequest(officer1, REQ_ID);
      expect(cache.del).toHaveBeenCalledWith('authprofile:fb-member-1');
    });

    it('removeCoOrganizer busts the demoted user', async () => {
      repo.findCoOrganizers.mockResolvedValue([{ id: 'target-1' } as never]);
      repo.getAuthUidById.mockResolvedValue('fb-target-1');
      await service.removeCoOrganizer(officer1, 'target-1');
      expect(repo.getAuthUidById).toHaveBeenCalledWith('target-1');
      expect(cache.del).toHaveBeenCalledWith('authprofile:fb-target-1');
    });
  });

  // ── getChapterRequests ────────────────────────────────────────────────────

  describe('getChapterRequests', () => {
    it('passes chapter_id from token', async () => {
      await service.getChapterRequests(officer1);
      expect(repo.findChapterPendingRequests).toHaveBeenCalledWith(CH_1);
    });
  });
});
