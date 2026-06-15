import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import type { Profile } from '../supabase/types';
import type { EventRow, RegistrationRow } from './qr.repository';
import { QrRepository } from './qr.repository';
import { QrService } from './qr.service';
import { QrTokenService } from './qr-token.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REG_ID     = '11111111-1111-4111-a111-111111111111';
const EVENT_ID   = '22222222-2222-4222-a222-222222222222';
const USER_ID    = '33333333-3333-4333-a333-333333333333';
const CH_1       = 'ch-uuid-1';
const CH_2       = 'ch-uuid-2';

function makeOrganizer(role: Profile['role'], chapterId: string): AuthenticatedUser {
  return {
    firebaseUid: 'fb-org',
    profileId:   'org-id',
    profile: { id: 'org-id', role, chapter_id: chapterId } as Profile,
  };
}

const officer1 = makeOrganizer('chapter_officer', CH_1);
const officer2 = makeOrganizer('chapter_officer', CH_2);
const admin    = makeOrganizer('hq_admin',        CH_1);

const mockReg: RegistrationRow = {
  id: REG_ID, user_id: USER_ID, event_id: EVENT_ID,
  status: 'approved', checked_in: false,
};

const mockEvent: EventRow = {
  id: EVENT_ID, title: 'DevCon Summit', points_value: 200,
  chapter_id: CH_1, is_chapter_locked: false,
};

// ── Mock factories ────────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<jest.Mocked<QrRepository>> = {}) {
  return {
    findApprovedRegistration:      jest.fn().mockResolvedValue({ id: REG_ID, event_status: 'upcoming' }),
    findPendingRegistration:       jest.fn().mockResolvedValue({ id: REG_ID, event_status: 'upcoming' }),
    findRegistrationForScan:       jest.fn().mockResolvedValue(mockReg),
    findPendingRegistrationForDoor:jest.fn().mockResolvedValue(mockReg),
    resolveUserRegistration:       jest.fn().mockResolvedValue(REG_ID),
    findEvent:                     jest.fn().mockResolvedValue(mockEvent),
    findMemberProfile:             jest.fn().mockResolvedValue({ full_name: 'Juan Cruz', chapter_id: CH_1 }),
    atomicCheckIn:                 jest.fn().mockResolvedValue({ id: REG_ID }),
    atomicApproveAtDoor:           jest.fn().mockResolvedValue({ id: REG_ID }),
    rejectAtDoor:                  jest.fn().mockResolvedValue(undefined),
    insertPointTransaction:        jest.fn().mockResolvedValue(undefined),
    incrementMemberPoints:         jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<QrRepository>;
}

function makeTokenService(kind: 'r' | 'u' | 'p' = 'r', expired = false) {
  const verifyResult = expired
    ? { expired: true }
    : {
        expired: false,
        payload: kind === 'u'
          ? { kind: 'u' as const, userId: USER_ID }
          : { kind, registrationId: REG_ID },
      };
  return {
    signRegistrationToken: jest.fn().mockReturnValue({ token: 'tok', expires_at: 9999 }),
    signUserToken:         jest.fn().mockReturnValue({ token: 'tok', expires_at: 9999 }),
    signPendingToken:      jest.fn().mockReturnValue({ token: 'tok', expires_at: 9999 }),
    verifyToken:           jest.fn().mockReturnValue(verifyResult),
  } as unknown as jest.Mocked<QrTokenService>;
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('QrService', () => {

  // ── generateRegistrationToken ─────────────────────────────────────────────

  describe('generateRegistrationToken', () => {
    it('returns token for approved registration belonging to caller', async () => {
      const repo = makeRepo();
      const tokens = makeTokenService();
      const svc = new QrService(repo, tokens);
      const result = await svc.generateRegistrationToken(officer1, REG_ID);
      expect(repo.findApprovedRegistration).toHaveBeenCalledWith(REG_ID, 'org-id');
      expect(result).toEqual({ token: 'tok', expires_at: 9999 });
    });

    it('throws NotFoundException when registration not found', async () => {
      const repo = makeRepo({ findApprovedRegistration: jest.fn().mockResolvedValue(null) });
      const svc = new QrService(repo, makeTokenService());
      await expect(svc.generateRegistrationToken(officer1, REG_ID))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when event has already passed', async () => {
      const repo = makeRepo({
        findApprovedRegistration: jest.fn().mockResolvedValue({ id: REG_ID, event_status: 'past' }),
      });
      const svc = new QrService(repo, makeTokenService());
      await expect(svc.generateRegistrationToken(officer1, REG_ID))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── processScan: expired / invalid token ──────────────────────────────────

  describe('processScan', () => {
    it('returns expired error for expired token', async () => {
      const svc = new QrService(makeRepo(), makeTokenService('r', true));
      const result = await svc.processScan(officer1, 'expired-token');
      expect(result).toEqual({ success: false, error: 'token_expired' });
    });

    it('throws UnauthorizedException for invalid token', async () => {
      const tokens = makeTokenService();
      (tokens.verifyToken as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedException('invalid_token');
      });
      const svc = new QrService(makeRepo(), tokens);
      await expect(svc.processScan(officer1, 'bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('awards points on successful scan', async () => {
      const repo = makeRepo();
      const svc = new QrService(repo, makeTokenService('r'));
      const result = await svc.processScan(officer1, 'valid-token');
      expect(result.success).toBe(true);
      expect(result.points_awarded).toBe(200);
      expect(repo.atomicCheckIn).toHaveBeenCalledWith(REG_ID);
      expect(repo.insertPointTransaction).toHaveBeenCalledWith(USER_ID, 200, 'Attended: DevCon Summit');
      expect(repo.incrementMemberPoints).toHaveBeenCalledWith(USER_ID, 200);
    });

    it('returns already_checked_in when atomic check-in gate returns null', async () => {
      const repo = makeRepo({ atomicCheckIn: jest.fn().mockResolvedValue(null) });
      const svc = new QrService(repo, makeTokenService('r'));
      const result = await svc.processScan(officer1, 'valid-token');
      expect(result.already_checked_in).toBe(true);
      expect(repo.insertPointTransaction).not.toHaveBeenCalled();
    });

    it('chapter scope: officer in wrong chapter returns chapter error', async () => {
      // event is CH_1, officer2 is CH_2
      const svc = new QrService(makeRepo(), makeTokenService('r'));
      const result = await svc.processScan(officer2, 'valid-token');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/different chapter/);
      expect((makeRepo()).atomicCheckIn).not.toHaveBeenCalled();
    });

    it('hq_admin bypasses chapter scope and succeeds', async () => {
      // admin is CH_1 but with hq_admin role; event is CH_1 — no issue
      const repo = makeRepo();
      const svc = new QrService(repo, makeTokenService('r'));
      const result = await svc.processScan(admin, 'valid-token');
      expect(result.success).toBe(true);
    });
  });

  // ── processDoorAction ─────────────────────────────────────────────────────

  describe('processDoorAction', () => {
    it('reject returns rejected: true without awarding points', async () => {
      const repo = makeRepo();
      const svc = new QrService(repo, makeTokenService());
      const result = await svc.processDoorAction(officer1, REG_ID, 'reject');
      expect(result).toEqual({ success: true, rejected: true, member_name: 'Juan Cruz' });
      expect(repo.insertPointTransaction).not.toHaveBeenCalled();
    });

    it('approve: atomic gate + awards points', async () => {
      const repo = makeRepo();
      const svc = new QrService(repo, makeTokenService());
      const result = await svc.processDoorAction(officer1, REG_ID, 'approve');
      expect(result.success).toBe(true);
      expect(result.points_awarded).toBe(200);
      expect(repo.atomicApproveAtDoor).toHaveBeenCalledWith(REG_ID);
      expect(repo.insertPointTransaction).toHaveBeenCalled();
    });

    it('approve: returns already_approved when atomic gate returns null', async () => {
      const repo = makeRepo({ atomicApproveAtDoor: jest.fn().mockResolvedValue(null) });
      const svc = new QrService(repo, makeTokenService());
      const result = await svc.processDoorAction(officer1, REG_ID, 'approve');
      expect(result.already_approved).toBe(true);
      expect(repo.insertPointTransaction).not.toHaveBeenCalled();
    });
  });
});
