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
    findEventFormSchema:       jest.fn().mockResolvedValue([]),
    findRegistrationEventId:   jest.fn().mockResolvedValue(EVENT_ID),
    approveRegistration:       jest.fn().mockResolvedValue({ success: true }),
    rejectRegistration:        jest.fn().mockResolvedValue(undefined),
    // Bulk helpers. Default: every id asked about is a pending row of this event,
    // and every reject lands — individual tests override to model the edge cases.
    findEventRegistrationStatuses: jest.fn().mockResolvedValue([{ id: REG_ID, status: 'pending' }]),
    rejectRegistrationsInEvent:    jest.fn().mockImplementation((_e: string, ids: string[]) => Promise.resolve([...ids])),
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
      expect(repo.insertRegistration).toHaveBeenCalledWith(EVENT_ID, 'member-1', null);
    });

    it('reactivates cancelled row instead of inserting duplicate', async () => {
      repo.findCancelled.mockResolvedValue({ ...mockReg, status: 'cancelled' });
      await service.register(member, EVENT_ID);
      expect(repo.reactivateCancelled).toHaveBeenCalledWith(REG_ID, null);
      expect(repo.insertRegistration).not.toHaveBeenCalled();
    });

    // ── Custom registration questions ───────────────────────────────────────
    // Answers must be persisted in the SAME write as the registration. The old
    // client-side follow-up UPDATE was rejected by RLS and lost 125 responses.

    it('persists answers in the same write as the registration', async () => {
      repo.findEventFormSchema.mockResolvedValue([
        { id: 'f1', label: 'Role', required: true },
      ]);
      await service.register(member, EVENT_ID, { f1: 'Student' });
      expect(repo.insertRegistration).toHaveBeenCalledWith(EVENT_ID, 'member-1', {
        f1: 'Student',
      });
    });

    it('rejects registration when a required question is unanswered', async () => {
      repo.findEventFormSchema.mockResolvedValue([
        { id: 'f1', label: 'Role', required: true },
      ]);
      await expect(service.register(member, EVENT_ID, {})).rejects.toThrow(/Role/);
      expect(repo.insertRegistration).not.toHaveBeenCalled();
    });

    it('rejects a blank "Other" free-text answer as unanswered', async () => {
      repo.findEventFormSchema.mockResolvedValue([
        { id: 'f1', label: 'Role', required: true },
      ]);
      await expect(
        service.register(member, EVENT_ID, { f1: '__other__:   ' }),
      ).rejects.toThrow(/Role/);
    });

    it('drops keys the event schema does not define', async () => {
      repo.findEventFormSchema.mockResolvedValue([
        { id: 'f1', label: 'Role', required: false },
      ]);
      await service.register(member, EVENT_ID, { f1: 'Student', junk: 'x' });
      expect(repo.insertRegistration).toHaveBeenCalledWith(EVENT_ID, 'member-1', {
        f1: 'Student',
      });
    });

    it('carries answers through re-registration of a cancelled row', async () => {
      repo.findCancelled.mockResolvedValue({ ...mockReg, status: 'cancelled' });
      repo.findEventFormSchema.mockResolvedValue([
        { id: 'f1', label: 'Role', required: true },
      ]);
      await service.register(member, EVENT_ID, { f1: 'Mentor' });
      expect(repo.reactivateCancelled).toHaveBeenCalledWith(REG_ID, { f1: 'Mentor' });
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
      expect(repo.approveRegistration).toHaveBeenCalledWith(REG_ID, 'officer-1');
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

  // ── Organizer: bulk actions ───────────────────────────────────────────────

  describe('bulkApprove', () => {
    const IDS = ['r1', 'r2', 'r3'];
    const allPending = IDS.map((id) => ({ id, status: 'pending' }));

    beforeEach(() => {
      repo.findEventRegistrationStatuses.mockResolvedValue(allPending);
    });

    it('runs ONE chapter-scope check for the whole batch', async () => {
      await service.bulkApprove(officer1, EVENT_ID, IDS);
      expect(repo.findEventChapterScope).toHaveBeenCalledTimes(1);
      expect(repo.findRegistrationEventId).not.toHaveBeenCalled();
    });

    it('SECURITY: drops ids that do not belong to the scoped event', async () => {
      repo.findEventRegistrationStatuses.mockResolvedValue([{ id: 'r1', status: 'pending' }]);
      const result = await service.bulkApprove(officer1, EVENT_ID, ['r1', 'foreign-reg']);

      expect(repo.approveRegistration).toHaveBeenCalledTimes(1);
      expect(repo.approveRegistration).toHaveBeenCalledWith('r1', 'officer-1');
      expect(result.failed).toContainEqual({ id: 'foreign-reg', reason: 'not_in_event' });
    });

    it('throws ForbiddenException for an officer in another chapter, before any write', async () => {
      repo = makeRepo(CH_1);
      service = new RegistrationsService(repo);
      await expect(service.bulkApprove(officer2, EVENT_ID, IDS)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.approveRegistration).not.toHaveBeenCalled();
    });

    it('approves in the order given', async () => {
      await service.bulkApprove(officer1, EVENT_ID, ['r3', 'r1', 'r2']);
      expect(repo.approveRegistration.mock.calls.map((c) => c[0])).toEqual(['r3', 'r1', 'r2']);
    });

    it('stops at capacity_full and reports the remainder as skipped', async () => {
      repo.approveRegistration
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'capacity_full' });

      const result = await service.bulkApprove(officer1, EVENT_ID, IDS);

      expect(result.succeeded).toEqual(['r1']);
      expect(result.stoppedReason).toBe('capacity_full');
      expect(result.skipped).toEqual(['r2', 'r3']);
      // r3 is never attempted — no point burning a round trip on a full event.
      expect(repo.approveRegistration).toHaveBeenCalledTimes(2);
    });

    it('does NOT roll back rows already approved when capacity fills', async () => {
      repo.approveRegistration
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'capacity_full' });

      await service.bulkApprove(officer1, EVENT_ID, IDS);

      expect(repo.revertRegistration).not.toHaveBeenCalled();
      expect(repo.rejectRegistration).not.toHaveBeenCalled();
      expect(repo.rejectRegistrationsInEvent).not.toHaveBeenCalled();
    });

    it('keeps going when a single row returns invalid_status', async () => {
      repo.approveRegistration
        .mockResolvedValueOnce({ success: false, error: 'invalid_status' })
        .mockResolvedValue({ success: true });

      const result = await service.bulkApprove(officer1, EVENT_ID, IDS);

      expect(result.succeeded).toEqual(['r2', 'r3']);
      expect(result.failed).toEqual([{ id: 'r1', reason: 'invalid_status' }]);
      expect(result.stoppedReason).toBeNull();
    });

    it('never calls the RPC for a non-pending row', async () => {
      repo.findEventRegistrationStatuses.mockResolvedValue([{ id: 'r1', status: 'approved' }]);
      const result = await service.bulkApprove(officer1, EVENT_ID, ['r1']);

      expect(repo.approveRegistration).not.toHaveBeenCalled();
      expect(result.failed).toEqual([{ id: 'r1', reason: 'invalid_status' }]);
    });

    it('de-dupes repeated ids', async () => {
      await service.bulkApprove(officer1, EVENT_ID, ['r1', 'r1', 'r2']);
      expect(repo.approveRegistration).toHaveBeenCalledTimes(2);
    });

    it('passes the organizer id from the token, never from the caller payload', async () => {
      await service.bulkApprove(officer1, EVENT_ID, ['r1']);
      expect(repo.approveRegistration).toHaveBeenCalledWith('r1', 'officer-1');
    });

    it('hq_admin bypasses chapter scope', async () => {
      repo = makeRepo(CH_2);
      repo.findEventRegistrationStatuses.mockResolvedValue(allPending);
      service = new RegistrationsService(repo);
      await service.bulkApprove(admin, EVENT_ID, IDS);
      expect(repo.approveRegistration).toHaveBeenCalledTimes(3);
    });
  });

  describe('bulkReject', () => {
    const IDS = ['r1', 'r2'];

    beforeEach(() => {
      repo.findEventRegistrationStatuses.mockResolvedValue(
        IDS.map((id) => ({ id, status: 'pending' })),
      );
    });

    it('issues a single scoped UPDATE for the whole batch', async () => {
      const result = await service.bulkReject(officer1, EVENT_ID, IDS);
      expect(repo.rejectRegistrationsInEvent).toHaveBeenCalledTimes(1);
      expect(repo.rejectRegistrationsInEvent).toHaveBeenCalledWith(EVENT_ID, IDS);
      expect(result.succeeded).toEqual(IDS);
    });

    it('reports ids the UPDATE did not touch as invalid_status', async () => {
      repo.rejectRegistrationsInEvent.mockResolvedValue(['r1']);
      const result = await service.bulkReject(officer1, EVENT_ID, IDS);
      expect(result.succeeded).toEqual(['r1']);
      expect(result.failed).toEqual([{ id: 'r2', reason: 'invalid_status' }]);
    });

    it('SECURITY: foreign ids never reach the repo', async () => {
      repo.findEventRegistrationStatuses.mockResolvedValue([{ id: 'r1', status: 'pending' }]);
      const result = await service.bulkReject(officer1, EVENT_ID, ['r1', 'foreign-reg']);
      expect(repo.rejectRegistrationsInEvent).toHaveBeenCalledWith(EVENT_ID, ['r1']);
      expect(result.failed).toContainEqual({ id: 'foreign-reg', reason: 'not_in_event' });
    });

    it('throws ForbiddenException for an officer in another chapter, before any write', async () => {
      repo = makeRepo(CH_1);
      service = new RegistrationsService(repo);
      await expect(service.bulkReject(officer2, EVENT_ID, IDS)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.rejectRegistrationsInEvent).not.toHaveBeenCalled();
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
