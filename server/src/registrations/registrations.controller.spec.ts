import { Test } from '@nestjs/testing';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { RolesGuard } from '../common/authz/roles.guard';
import type { Profile, Registration } from '../supabase/types';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

const REG_ID   = 'reg-uuid-001';
const EVENT_ID = 'event-uuid-001';

const memberProfile:  Partial<Profile> = { id: 'member-1',  role: 'member',          chapter_id: 'ch-1' };
const officerProfile: Partial<Profile> = { id: 'officer-1', role: 'chapter_officer', chapter_id: 'ch-1' };

const mockMember:  AuthenticatedUser = { firebaseUid: 'fb-m', profileId: 'member-1',  profile: memberProfile  as Profile };
const mockOfficer: AuthenticatedUser = { firebaseUid: 'fb-o', profileId: 'officer-1', profile: officerProfile as Profile };

const mockReg: Partial<Registration> = { id: REG_ID, event_id: EVENT_ID, status: 'pending' };

function makeService() {
  return {
    getMyRegistrations: jest.fn().mockResolvedValue([mockReg]),
    register:           jest.fn().mockResolvedValue(mockReg),
    cancelRegistration: jest.fn().mockResolvedValue(undefined),
    getEventRegistrants:jest.fn().mockResolvedValue([]),
    approveRegistration:jest.fn().mockResolvedValue(undefined),
    rejectRegistration: jest.fn().mockResolvedValue(undefined),
    revertRegistration: jest.fn().mockResolvedValue(undefined),
    manualCheckin:      jest.fn().mockResolvedValue({ success: true, member_name: 'Juan', points_awarded: 200 }),
  };
}

describe('RegistrationsController', () => {
  let controller: RegistrationsController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [RegistrationsController],
      providers: [{ provide: RegistrationsService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(RegistrationsController);
  });

  // ── Member ────────────────────────────────────────────────────────────────

  it('getMyRegistrations — scoped to caller from token', async () => {
    const result = await controller.getMyRegistrations(mockMember);
    expect(service.getMyRegistrations).toHaveBeenCalledWith(mockMember);
    expect(result).toEqual([mockReg]);
  });

  it('register — userId from token, eventId from body (IDOR: never from body)', async () => {
    await controller.register(mockMember, { eventId: EVENT_ID });
    expect(service.register).toHaveBeenCalledWith(mockMember, EVENT_ID);
  });

  it('cancelRegistration — ownership enforced via caller token, not body', async () => {
    await controller.cancelRegistration(mockMember, { id: REG_ID });
    expect(service.cancelRegistration).toHaveBeenCalledWith(mockMember, REG_ID);
  });

  // ── Organizer ─────────────────────────────────────────────────────────────

  it('getEventRegistrants — eventId from param, organizer from token', async () => {
    await controller.getEventRegistrants(mockOfficer, { id: EVENT_ID });
    expect(service.getEventRegistrants).toHaveBeenCalledWith(mockOfficer, EVENT_ID);
  });

  it('approveRegistration — organizerId from token prevents IDOR', async () => {
    await controller.approveRegistration(mockOfficer, { id: REG_ID });
    expect(service.approveRegistration).toHaveBeenCalledWith(mockOfficer, REG_ID);
  });

  it('rejectRegistration — organizerId from token', async () => {
    await controller.rejectRegistration(mockOfficer, { id: REG_ID });
    expect(service.rejectRegistration).toHaveBeenCalledWith(mockOfficer, REG_ID);
  });

  it('revertRegistration — organizerId from token', async () => {
    await controller.revertRegistration(mockOfficer, { id: REG_ID });
    expect(service.revertRegistration).toHaveBeenCalledWith(mockOfficer, REG_ID);
  });

  it('manualCheckin — organizerId from token (never from body)', async () => {
    const result = await controller.manualCheckin(mockOfficer, { id: REG_ID });
    expect(service.manualCheckin).toHaveBeenCalledWith(mockOfficer, REG_ID);
    expect(result).toEqual({ success: true, member_name: 'Juan', points_awarded: 200 });
  });
});
