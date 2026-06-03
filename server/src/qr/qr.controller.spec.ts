import { Test } from '@nestjs/testing';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import { RolesGuard } from '../common/authz/roles.guard';
import { RateLimitGuard } from '../common/throttler/rate-limit.guard';
import type { Profile } from '../supabase/types';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

const REG_ID = '11111111-1111-4111-a111-111111111111';
const TOKEN_RESPONSE = { token: 'tok', expires_at: 9999 };
const SCAN_RESPONSE  = { success: true, member_name: 'Juan', points_awarded: 200, event_title: 'Summit' };

const officerProfile: Partial<Profile> = { id: 'officer-1', role: 'chapter_officer', chapter_id: 'ch-1' };
const memberProfile:  Partial<Profile> = { id: 'member-1',  role: 'member',          chapter_id: 'ch-1' };

const mockOfficer: AuthenticatedUser = { firebaseUid: 'fb-o', profileId: 'officer-1', profile: officerProfile as Profile };
const mockMember:  AuthenticatedUser = { firebaseUid: 'fb-m', profileId: 'member-1',  profile: memberProfile  as Profile };

function makeService() {
  return {
    generateRegistrationToken: jest.fn().mockResolvedValue(TOKEN_RESPONSE),
    generateUserToken:         jest.fn().mockResolvedValue(TOKEN_RESPONSE),
    generatePendingToken:      jest.fn().mockResolvedValue(TOKEN_RESPONSE),
    processScan:               jest.fn().mockResolvedValue(SCAN_RESPONSE),
    processDoorAction:         jest.fn().mockResolvedValue({ success: true, rejected: true, member_name: 'Juan' }),
  };
}

describe('QrController', () => {
  let controller: QrController;
  let service: ReturnType<typeof makeService>;

  beforeEach(async () => {
    service = makeService();
    const module = await Test.createTestingModule({
      controllers: [QrController],
      providers: [{ provide: QrService, useValue: service }],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .overrideGuard(RateLimitGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(QrController);
  });

  it('generateRegistrationToken — userId from token, registrationId from body', async () => {
    await controller.generateRegistrationToken(mockMember, { registrationId: REG_ID });
    expect(service.generateRegistrationToken).toHaveBeenCalledWith(mockMember, REG_ID);
  });

  it('generateUserToken — userId purely from token', async () => {
    await controller.generateUserToken(mockMember);
    expect(service.generateUserToken).toHaveBeenCalledWith(mockMember);
  });

  it('generatePendingToken — userId from token, registrationId from body', async () => {
    await controller.generatePendingToken(mockMember, { registrationId: REG_ID });
    expect(service.generatePendingToken).toHaveBeenCalledWith(mockMember, REG_ID);
  });

  it('processScan — organizer from token, QR token from body (never trust client for organizer identity)', async () => {
    const result = await controller.processScan(mockOfficer, { token: 'some-jwt' });
    expect(service.processScan).toHaveBeenCalledWith(mockOfficer, 'some-jwt');
    expect(result).toEqual(SCAN_RESPONSE);
  });

  it('processDoorAction — organizer from token, registrationId + action from body', async () => {
    await controller.processDoorAction(mockOfficer, { registrationId: REG_ID, action: 'reject' });
    expect(service.processDoorAction).toHaveBeenCalledWith(mockOfficer, REG_ID, 'reject');
  });
});
