import { Test } from '@nestjs/testing';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { RolesGuard } from '../common/authz/roles.guard';
import type { Profile } from '../supabase/types';
import { VolunteersController } from './volunteers.controller';
import { VolunteersService } from './volunteers.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MEMBER_ID     = 'member-uuid-001';
const OFFICER_ID    = 'officer-uuid-001';
const APP_ID        = 'app-uuid-001';
const EVENT_ID      = 'event-uuid-001';

const memberProfile: Partial<Profile>  = { id: MEMBER_ID,  role: 'member',          chapter_id: 'ch-1' };
const officerProfile: Partial<Profile> = { id: OFFICER_ID, role: 'chapter_officer', chapter_id: 'ch-1' };
const adminProfile: Partial<Profile>   = { id: 'admin-id', role: 'hq_admin',        chapter_id: 'ch-1' };

const mockMember:  AuthenticatedUser = { firebaseUid: 'fb-m', profileId: MEMBER_ID,  profile: memberProfile  as Profile };
const mockOfficer: AuthenticatedUser = { firebaseUid: 'fb-o', profileId: OFFICER_ID, profile: officerProfile as Profile };
const mockAdmin:   AuthenticatedUser = { firebaseUid: 'fb-a', profileId: 'admin-id', profile: adminProfile   as Profile };

const mockApp = {
  id: APP_ID, event_id: EVENT_ID, user_id: MEMBER_ID, reason: 'I want to help',
  phone_number: null, social_media_handle: null,
  status: 'pending' as const, applied_at: null, reviewed_by: null, reviewed_at: null,
};

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeService() {
  return {
    getMyApplications:      jest.fn().mockResolvedValue([mockApp]),
    apply:                  jest.fn().mockResolvedValue(mockApp),
    getChapterApplications: jest.fn().mockResolvedValue([]),
    approve:                jest.fn().mockResolvedValue(undefined),
    reject:                 jest.fn().mockResolvedValue(undefined),
    revert:                 jest.fn().mockResolvedValue(undefined),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('VolunteersController', () => {
  let controller: VolunteersController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [VolunteersController],
      providers: [{ provide: VolunteersService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(VolunteersController);
  });

  // ── Member endpoints ──────────────────────────────────────────────────────

  describe('getMyApplications', () => {
    it('scopes to the caller profileId from the token', async () => {
      const result = await controller.getMyApplications(mockMember);
      expect(service.getMyApplications).toHaveBeenCalledWith(mockMember);
      expect(result).toEqual([mockApp]);
    });
  });

  describe('apply', () => {
    it('passes user and dto to service — userId never accepted from body', async () => {
      const dto = { eventId: EVENT_ID, reason: 'I want to help out' };
      await controller.apply(mockMember, dto as never);
      expect(service.apply).toHaveBeenCalledWith(mockMember, dto);
    });
  });

  // ── Organizer endpoints ───────────────────────────────────────────────────

  describe('getChapterApplications', () => {
    it('passes full user (including role/chapter_id from token) to service', async () => {
      await controller.getChapterApplications(mockOfficer);
      expect(service.getChapterApplications).toHaveBeenCalledWith(mockOfficer);
    });

    it('also works for hq_admin (service decides chapter scope)', async () => {
      await controller.getChapterApplications(mockAdmin);
      expect(service.getChapterApplications).toHaveBeenCalledWith(mockAdmin);
    });
  });

  describe('approve', () => {
    it('passes organizerId from token — prevents IDOR on reviewer identity', async () => {
      await controller.approve(mockOfficer, { id: APP_ID });
      expect(service.approve).toHaveBeenCalledWith(mockOfficer, APP_ID);
    });
  });

  describe('reject', () => {
    it('passes organizerId from token', async () => {
      await controller.reject(mockOfficer, { id: APP_ID });
      expect(service.reject).toHaveBeenCalledWith(mockOfficer, APP_ID);
    });
  });

  describe('revert', () => {
    it('passes organizerId from token', async () => {
      await controller.revert(mockAdmin, { id: APP_ID });
      expect(service.revert).toHaveBeenCalledWith(mockAdmin, APP_ID);
    });
  });
});
