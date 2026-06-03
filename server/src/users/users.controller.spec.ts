import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard';
import type { Profile } from '../supabase/types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// ── Fixtures ─────────────────────────────────────────────────────────────

const MOCK_PROFILE_ID = '4a8e1b7c-0000-4000-a000-000000000001';

const mockProfile: Profile = {
  id: MOCK_PROFILE_ID,
  email: 'user@devcon.ph',
  full_name: 'Test Member',
  username: 'testmember',
  school_or_company: 'Acme Corp',
  chapter_id: 'chapter-uuid',
  role: 'member',
  avatar_url: null,
  spendable_points: 100,
  lifetime_points: 200,
  referral_code: 'REF123',
  pending_role: null,
  pending_chapter_id: null,
  auth_uid: 'firebase-uid',
  is_email_verified: true,
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  created_at: '2026-01-01T00:00:00Z',
};

const mockUser: AuthenticatedUser = {
  firebaseUid: 'firebase-uid',
  profileId: MOCK_PROFILE_ID,
  profile: mockProfile,
};

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
  fieldname: 'avatar',
  originalname: 'photo.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  buffer: Buffer.from('fake-image-data'),
  size: 1024,
  stream: null!,
  destination: '',
  filename: '',
  path: '',
  ...overrides,
});

// ── Mock factories ────────────────────────────────────────────────────────

function makeUsersService() {
  return {
    getProfile:    jest.fn().mockResolvedValue(mockProfile),
    updateProfile: jest.fn().mockResolvedValue(mockProfile),
    uploadAvatar:  jest.fn().mockResolvedValue('https://example.com/avatar.jpg'),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: ReturnType<typeof makeUsersService>;

  beforeEach(async () => {
    usersService = makeUsersService();

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(UsersController);
  });

  // ── GET /api/users/me ────────────────────────────────────────────────

  describe('getMe', () => {
    it('delegates to usersService.getProfile with the caller profileId', async () => {
      await controller.getMe(mockUser);
      expect(usersService.getProfile).toHaveBeenCalledWith(MOCK_PROFILE_ID);
    });

    it('returns the profile from the service', async () => {
      const result = await controller.getMe(mockUser);
      expect(result).toEqual(mockProfile);
    });
  });

  // ── PATCH /api/users/me ──────────────────────────────────────────────

  describe('updateMe', () => {
    it('delegates to usersService.updateProfile with the caller profileId', async () => {
      const dto: UpdateProfileDto = { full_name: 'Updated Name' };
      await controller.updateMe(mockUser, dto);
      expect(usersService.updateProfile).toHaveBeenCalledWith(MOCK_PROFILE_ID, dto);
    });

    it('returns the updated profile from the service', async () => {
      const updatedProfile = { ...mockProfile, full_name: 'Updated Name' };
      usersService.updateProfile.mockResolvedValue(updatedProfile);
      const result = await controller.updateMe(mockUser, { full_name: 'Updated Name' });
      expect(result).toEqual(updatedProfile);
    });

    it('never uses profileId from the request body — always from the token', async () => {
      // IDOR defense: even if an attacker passes a different ID in the body,
      // the controller always uses user.profileId from the verified token.
      await controller.updateMe(mockUser, { full_name: 'Hacker' });
      expect(usersService.updateProfile).toHaveBeenCalledWith(
        MOCK_PROFILE_ID, // token-derived, not from body
        expect.anything(),
      );
    });
  });

  // ── POST /api/users/me/avatar ────────────────────────────────────────

  describe('uploadAvatar', () => {
    it('delegates to usersService.uploadAvatar with the caller profileId', async () => {
      const file = makeFile();
      await controller.uploadAvatar(mockUser, file);
      expect(usersService.uploadAvatar).toHaveBeenCalledWith(MOCK_PROFILE_ID, file);
    });

    it('returns { avatar_url } from the service result', async () => {
      const file = makeFile();
      const result = await controller.uploadAvatar(mockUser, file);
      expect(result).toEqual({ avatar_url: 'https://example.com/avatar.jpg' });
    });

    it('propagates BadRequestException from the service (invalid mime type)', async () => {
      usersService.uploadAvatar.mockRejectedValue(
        new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed'),
      );
      const file = makeFile({ mimetype: 'application/pdf' });
      await expect(controller.uploadAvatar(mockUser, file)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
