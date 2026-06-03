import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Profile } from '../supabase/types';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

// ── Fixtures ─────────────────────────────────────────────────────────────

const MOCK_USER_ID = '4a8e1b7c-0000-4000-a000-000000000001';

const mockProfile: Profile = {
  id: MOCK_USER_ID,
  email: 'user@devcon.ph',
  full_name: 'Test Member',
  username: 'testmember',
  school_or_company: null,
  chapter_id: 'chapter-uuid',
  role: 'member',
  avatar_url: null,
  spendable_points: 0,
  lifetime_points: 0,
  referral_code: null,
  pending_role: null,
  pending_chapter_id: null,
  auth_uid: 'firebase-uid',
  is_email_verified: true,
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  created_at: '2026-01-01T00:00:00Z',
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

const TEN_MB = 10 * 1024 * 1024;

// ── Mock factories ────────────────────────────────────────────────────────

function makeUsersRepo() {
  return {
    findById:     jest.fn().mockResolvedValue(mockProfile),
    update:       jest.fn().mockResolvedValue(mockProfile),
    uploadAvatar: jest.fn().mockResolvedValue('https://cdn.supabase.co/avatars/user.jpg'),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeUsersRepo>;

  beforeEach(async () => {
    repo = makeUsersRepo();

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  // ── getProfile ───────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('delegates to repo.findById', async () => {
      await service.getProfile(MOCK_USER_ID);
      expect(repo.findById).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('returns the profile from the repository', async () => {
      const result = await service.getProfile(MOCK_USER_ID);
      expect(result).toEqual(mockProfile);
    });
  });

  // ── updateProfile ────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('delegates to repo.update with the correct id and patch', async () => {
      const patch = { full_name: 'New Name', username: 'newhandle' };
      await service.updateProfile(MOCK_USER_ID, patch);
      expect(repo.update).toHaveBeenCalledWith(MOCK_USER_ID, patch);
    });

    it('returns the updated profile', async () => {
      const updated = { ...mockProfile, full_name: 'New Name' };
      repo.update.mockResolvedValue(updated);
      const result = await service.updateProfile(MOCK_USER_ID, { full_name: 'New Name' });
      expect(result).toEqual(updated);
    });
  });

  // ── uploadAvatar — positive ──────────────────────────────────────────

  describe('uploadAvatar (positive)', () => {
    it.each([
      ['image/jpeg', 'photo.jpg'],
      ['image/png',  'photo.png'],
      ['image/webp', 'photo.webp'],
      ['image/gif',  'photo.gif'],
    ])('accepts %s files', async (mimetype, originalname) => {
      const file = makeFile({ mimetype, originalname });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).resolves.toBe(
        'https://cdn.supabase.co/avatars/user.jpg',
      );
      expect(repo.uploadAvatar).toHaveBeenCalledWith(
        MOCK_USER_ID,
        file.buffer,
        mimetype,
      );
    });

    it('accepts a file exactly at the 10 MB limit', async () => {
      const file = makeFile({ size: TEN_MB });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).resolves.toBeDefined();
    });
  });

  // ── uploadAvatar — negative ──────────────────────────────────────────

  describe('uploadAvatar (negative)', () => {
    it('rejects unsupported MIME types with BadRequestException', async () => {
      const badTypes = ['application/pdf', 'video/mp4', 'image/tiff', 'text/plain'];
      for (const mimetype of badTypes) {
        const file = makeFile({ mimetype });
        await expect(service.uploadAvatar(MOCK_USER_ID, file)).rejects.toThrow(
          BadRequestException,
        );
      }
    });

    it('rejects files over 10 MB with BadRequestException', async () => {
      const file = makeFile({ size: TEN_MB + 1 });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('uses the 10 MB threshold exactly — 10 MB + 1 byte is over the limit', async () => {
      const borderPass = makeFile({ size: TEN_MB });
      const borderFail = makeFile({ size: TEN_MB + 1 });
      await expect(service.uploadAvatar(MOCK_USER_ID, borderPass)).resolves.toBeDefined();
      await expect(service.uploadAvatar(MOCK_USER_ID, borderFail)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('never calls repo.uploadAvatar when validation fails', async () => {
      const file = makeFile({ mimetype: 'application/pdf' });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).rejects.toThrow();
      expect(repo.uploadAvatar).not.toHaveBeenCalled();
    });
  });
});
