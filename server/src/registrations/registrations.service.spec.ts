import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import type { Profile, Registration } from '../supabase/types';
import { RegistrationsRepository } from './registrations.repository';
import { RegistrationsService } from './registrations.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EVENT_ID = 'event-uuid-001';
const REG_ID   = 'reg-uuid-001';
const CH_1     = 'ch-uuid-1';
const CH_2     = 'ch-uuid-2';

function makeUser(role: Profile['role'], chapterId: string, id = 'uid-1'): AuthenticatedUser {
  return { firebaseUid: 'fb', profileId: id, profile: { id, role, chapter_id: chapterId } as Profile };
}

const member   = makeUser('member',          CH_1, 'member-1');
const officer1 = makeUser('chapter_officer', CH_1, 'officer-1');
const officer2 = makeUser('chapter_officer', CH_2, 'officer-2');
const admin    = makeUser('hq_admin',        CH_1, 'admin-1');

const mockReg: Registration = {
  id: REG_ID, event_id: EVENT_ID, user_id: 'member-1',
  status: 'pending', qr_code_token: null, checked_in: false,
  registered_at: null, approved_at: null,
};

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeRepo(eventChapterId: string | null = CH_1) {
  return {
    findByUser:                jest.fn().mockResolvedValue([mockReg]),
    findCancelled:             jest.fn().mockResolvedValue(null),
    reactivateCancelled:       jest.fn().mockResolvedValue(mockReg),
    insertRegistration:        jest.fn().mockResolvedValue(mockReg),
    cancelRegistration:        jest.fn().mockResolvedValue(undefined),
    findByEvent:               jest.fn().mockResolvedValue([]),
    findEventChapterScope:     jest.fn().mockResolvedValue({ chapterId: eventChapterId }),
    findRegistrationEventId:   jest.fn().mockResolvedValue(EVENT_ID),
    approveRegistration:       jest.fn().mockResolvedValue(undefined),
    rejectRegistration:        jest.fn().mockResolvedValue(undefined),
    revertRegistration:        jest.fn().mockResolvedValue(undefined),
    manualCheckin:             jest.fn().mockResolvedValue({ success: true, member_name: 'Juan', points_awarded: 200 }),
  } as unknown as jest.Mocked<RegistrationsRepository>;
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('RegistrationsService', () => {
  let service: RegistrationsService;
  let repo: jest.Mocked<RegistrationsRepository>;

  beforeEach(() => {
    repo = makeRepo();
    service = new RegistrationsService(repo);
  });

  // ── Member ────────────────────────────────────────────────────────────────

  describe('getMyRegistrations', () => {
    it('scopes to caller profileId — never accepts userId from body', async () => {
      await service.getMyRegistrations(member);
      expect(repo.findByUser).toHaveBeenCalledWith('member-1');
    });
  });

  describe('register', () => {
    it('inserts new registration when no cancelled row exists', async () => {
      await service.register(member, EVENT_ID);
      expect(repo.findCancelled).toHaveBeenCalledWith(EVENT_ID, 'member-1');
      expect(repo.insertRegistration).toHaveBeenCalledWith(EVENT_ID, 'member-1');
    });

    it('reactivates cancelled row instead of inserting duplicate', async () => {
      repo.findCancelled.mockResolvedValue({ ...mockReg, status: 'cancelled' });
      await service.register(member, EVENT_ID);
      expect(repo.reactivateCancelled).toHaveBeenCalledWith(REG_ID);
      expect(repo.insertRegistration).not.toHaveBeenCalled();
    });
  });

  describe('cancelRegistration', () => {
    it('passes regId and profileId — owner check enforced in repo', async () => {
      await service.cancelRegistration(member, REG_ID);
      expect(repo.cancelRegistration).toHaveBeenCalledWith(REG_ID, 'member-1');
    });
  });

  // ── Organizer: chapter scope ──────────────────────────────────────────────

  describe('approveRegistration', () => {
    it('succeeds when officer is in same chapter as event', async () => {
      await service.approveRegistration(officer1, REG_ID);
      expect(repo.approveRegistration).toHaveBeenCalledWith(REG_ID);
    });

    it('throws ForbiddenException for officer in different chapter', async () => {
      repo = makeRepo(CH_1); // event is CH_1
      service = new RegistrationsService(repo);
      await expect(service.approveRegistration(officer2, REG_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.approveRegistration).not.toHaveBeenCalled();
    });

    it('hq_admin bypasses chapter scope', async () => {
      repo = makeRepo(CH_2); // event is CH_2, admin is CH_1
      service = new RegistrationsService(repo);
      await service.approveRegistration(admin, REG_ID);
      expect(repo.approveRegistration).toHaveBeenCalled();
    });
  });

  describe('manualCheckin', () => {
    it('passes regId and organizerId to repo', async () => {
      const result = await service.manualCheckin(officer1, REG_ID);
      expect(repo.manualCheckin).toHaveBeenCalledWith(REG_ID, 'officer-1');
      expect(result.points_awarded).toBe(200);
    });

    it('throws NotFoundException when registration event_id not found', async () => {
      repo.findRegistrationEventId.mockResolvedValue(null);
      await expect(service.manualCheckin(officer1, REG_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getEventRegistrants', () => {
    it('chapter scope prevents officer from reading another chapter event', async () => {
      repo = makeRepo(CH_1);
      service = new RegistrationsService(repo);
      await expect(service.getEventRegistrants(officer2, EVENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.findByEvent).not.toHaveBeenCalled();
    });

    it('hq_admin can read any chapter event', async () => {
      repo = makeRepo(CH_2);
      service = new RegistrationsService(repo);
      await service.getEventRegistrants(admin, EVENT_ID);
      expect(repo.findByEvent).toHaveBeenCalledWith(EVENT_ID);
    });

    it('throws NotFoundException when the event does not exist', async () => {
      repo = makeRepo();
      repo.findEventChapterScope.mockResolvedValue(null);
      service = new RegistrationsService(repo);
      await expect(service.getEventRegistrants(officer1, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findByEvent).not.toHaveBeenCalled();
    });

    // HQ / program event (chapter_id === null) — restricted to HQ admins.
    it('forbids a chapter officer from reading registrants of an HQ (null-chapter) event', async () => {
      repo = makeRepo(null);
      service = new RegistrationsService(repo);
      await expect(service.getEventRegistrants(officer1, EVENT_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.findByEvent).not.toHaveBeenCalled();
    });

    it('lets an hq_admin read registrants of an HQ (null-chapter) event', async () => {
      repo = makeRepo(null);
      service = new RegistrationsService(repo);
      await service.getEventRegistrants(admin, EVENT_ID);
      expect(repo.findByEvent).toHaveBeenCalledWith(EVENT_ID);
    });
  });
});
