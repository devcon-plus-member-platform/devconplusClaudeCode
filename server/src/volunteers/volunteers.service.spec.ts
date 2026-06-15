import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import type { Profile } from '../supabase/types';
import type { ApplyVolunteerDto } from './dto/apply-volunteer.dto';
import { VolunteersRepository } from './volunteers.repository';
import { VolunteersService } from './volunteers.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CH_1 = 'chapter-1';
const CH_2 = 'chapter-2';
const APP_ID = 'app-uuid-001';

function makeUser(role: Profile['role'], chapterId: string, profileId = 'uid-1'): AuthenticatedUser {
  return {
    firebaseUid: 'fb-' + profileId,
    profileId,
    profile: { id: profileId, role, chapter_id: chapterId } as Profile,
  };
}

const officer1 = makeUser('chapter_officer', CH_1, 'officer-1');
const officer2 = makeUser('chapter_officer', CH_2, 'officer-2');
const admin    = makeUser('hq_admin',        CH_1, 'admin-1');
const member   = makeUser('member',          CH_1, 'member-1');

// ── Mock repository ────────────────────────────────────────────────────────────

function makeRepo(appChapterId = CH_1) {
  return {
    findByMember:      jest.fn().mockResolvedValue([]),
    apply:             jest.fn().mockResolvedValue({ id: APP_ID }),
    findByChapter:     jest.fn().mockResolvedValue([]),
    findByIdWithChapter: jest.fn().mockResolvedValue({ id: APP_ID, event_chapter_id: appChapterId }),
    approveApplication: jest.fn().mockResolvedValue(undefined),
    rejectApplication:  jest.fn().mockResolvedValue(undefined),
    revertApplication:  jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<VolunteersRepository>;
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('VolunteersService', () => {
  let service: VolunteersService;
  let repo: jest.Mocked<VolunteersRepository>;

  beforeEach(() => {
    repo = makeRepo();
    service = new VolunteersService(repo);
  });

  // ── getMyApplications ─────────────────────────────────────────────────────

  describe('getMyApplications', () => {
    it('calls findByMember with profileId', async () => {
      await service.getMyApplications(member);
      expect(repo.findByMember).toHaveBeenCalledWith('member-1');
    });
  });

  // ── apply ─────────────────────────────────────────────────────────────────

  describe('apply', () => {
    it('passes profileId to repository — never accepts user_id from dto', async () => {
      const dto: ApplyVolunteerDto = {
        eventId: 'event-uuid', reason: 'I want to help with setup',
      };
      await service.apply(member, dto);
      expect(repo.apply).toHaveBeenCalledWith('member-1', dto);
    });
  });

  // ── getChapterApplications ────────────────────────────────────────────────

  describe('getChapterApplications', () => {
    it('passes chapter_id from token for chapter_officer', async () => {
      await service.getChapterApplications(officer1);
      expect(repo.findByChapter).toHaveBeenCalledWith(CH_1);
    });

    it('passes null for hq_admin (all chapters)', async () => {
      await service.getChapterApplications(admin);
      expect(repo.findByChapter).toHaveBeenCalledWith(null);
    });
  });

  // ── approve: chapter-scope enforcement ───────────────────────────────────

  describe('approve', () => {
    it('succeeds when officer chapter matches event chapter', async () => {
      await service.approve(officer1, APP_ID);
      expect(repo.approveApplication).toHaveBeenCalledWith(APP_ID, 'officer-1');
    });

    it('throws ForbiddenException when officer chapter does not match event chapter', async () => {
      // officer2 is in CH_2 but the app's event is in CH_1
      await expect(service.approve(officer2, APP_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.approveApplication).not.toHaveBeenCalled();
    });

    it('hq_admin bypasses chapter scope check', async () => {
      repo = makeRepo(CH_2); // admin is CH_1, event is CH_2 — should still pass
      service = new VolunteersService(repo);
      await service.approve(admin, APP_ID);
      expect(repo.approveApplication).toHaveBeenCalledWith(APP_ID, 'admin-1');
    });
  });

  // ── reject: chapter-scope enforcement ────────────────────────────────────

  describe('reject', () => {
    it('succeeds when officer chapter matches', async () => {
      await service.reject(officer1, APP_ID);
      expect(repo.rejectApplication).toHaveBeenCalledWith(APP_ID, 'officer-1');
    });

    it('throws ForbiddenException for wrong chapter officer', async () => {
      await expect(service.reject(officer2, APP_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.rejectApplication).not.toHaveBeenCalled();
    });
  });

  // ── revert: chapter-scope enforcement ────────────────────────────────────

  describe('revert', () => {
    it('succeeds when officer chapter matches', async () => {
      await service.revert(officer1, APP_ID);
      expect(repo.revertApplication).toHaveBeenCalledWith(APP_ID);
    });

    it('throws ForbiddenException for wrong chapter officer', async () => {
      await expect(service.revert(officer2, APP_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.revertApplication).not.toHaveBeenCalled();
    });

    it('revert does NOT pass organizerId — reviewer fields are cleared by the repo', async () => {
      await service.revert(officer1, APP_ID);
      // revertApplication takes only the id, not the organizerId
      expect(repo.revertApplication).toHaveBeenCalledWith(APP_ID);
      expect(repo.revertApplication).not.toHaveBeenCalledWith(APP_ID, expect.anything());
    });
  });
});
