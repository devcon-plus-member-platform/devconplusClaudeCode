import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppCacheService } from '../cache/app-cache.service';
import type { Profile } from '../supabase/types';
import { UsersRepository } from './users.repository';
import { MAX_AVATAR_BYTES, UsersService } from './users.service';

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
  interests: null,
  tech_stack: null,
  community_roles: null,
  created_at: '2026-01-01T00:00:00Z',
};

// Minimal real magic bytes for each accepted image type
const JPEG_HEADER  = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_HEADER   = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const GIF_HEADER   = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]);
const WEBP_HEADER  = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const PDF_HEADER   = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const SCRIPT_BYTES = Buffer.from([0x3c, 0x3f, 0x70, 0x68, 0x70, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const makeFile = (
  buffer: Buffer,
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File => ({
  fieldname: 'avatar',
  originalname: 'photo.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',   // always client-declared — service ignores this
  buffer,
  size: buffer.length,
  stream: null!,
  destination: '',
  filename: '',
  path: '',
  ...overrides,
});

// ── Mock factories ────────────────────────────────────────────────────────

function makeUsersRepo() {
  return {
    findById:     jest.fn().mockResolvedValue(mockProfile),
    update:       jest.fn().mockResolvedValue(mockProfile),
    uploadAvatar: jest.fn().mockResolvedValue('https://cdn.supabase.co/avatars/user.jpg'),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
  };
}

function makeCache() {
  return {
    getOrSet: jest.fn((_k: string, _ttl: number, loader: () => unknown) => loader()),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let repo: ReturnType<typeof makeUsersRepo>;
  let cache: ReturnType<typeof makeCache>;

  beforeEach(async () => {
    repo = makeUsersRepo();
    cache = makeCache();
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repo },
        { provide: AppCacheService, useValue: cache },
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
      expect(await service.getProfile(MOCK_USER_ID)).toEqual(mockProfile);
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
      expect(await service.updateProfile(MOCK_USER_ID, { full_name: 'New Name' })).toEqual(updated);
    });

    it('busts the caller\'s auth-profile cache when authUid is provided', async () => {
      await service.updateProfile(MOCK_USER_ID, { full_name: 'New Name' }, 'firebase-uid');
      expect(cache.del).toHaveBeenCalledWith('authprofile:firebase-uid');
    });

    it('does not bust the cache when authUid is absent', async () => {
      await service.updateProfile(MOCK_USER_ID, { full_name: 'New Name' });
      expect(cache.del).not.toHaveBeenCalled();
    });
  });

  // ── uploadAvatar — magic-byte validation (positive) ──────────────────

  describe('uploadAvatar — magic bytes (positive)', () => {
    it.each([
      ['image/jpeg', JPEG_HEADER],
      ['image/png',  PNG_HEADER],
      ['image/gif',  GIF_HEADER],
      ['image/webp', WEBP_HEADER],
    ])('accepts %s based on buffer content', async (mime, header) => {
      const file = makeFile(header, { mimetype: mime });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).resolves.toBe(
        'https://cdn.supabase.co/avatars/user.jpg',
      );
      // Must call uploadAvatar with the DETECTED type, not the client-declared one
      expect(repo.uploadAvatar).toHaveBeenCalledWith(MOCK_USER_ID, header, mime);
    });

    it('uses detected MIME even when client declares wrong type', async () => {
      // Client lies and declares image/gif but sends a PNG
      const file = makeFile(PNG_HEADER, { mimetype: 'image/gif' });
      await service.uploadAvatar(MOCK_USER_ID, file);
      // Storage should receive 'image/png' (detected), not 'image/gif' (declared)
      expect(repo.uploadAvatar).toHaveBeenCalledWith(MOCK_USER_ID, PNG_HEADER, 'image/png');
    });
  });

  // ── uploadAvatar — magic-byte validation (negative) ──────────────────

  describe('uploadAvatar — magic bytes (negative)', () => {
    it('rejects a PDF buffer even when declared as image/jpeg', async () => {
      const file = makeFile(PDF_HEADER, { mimetype: 'image/jpeg' });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).rejects.toThrow(BadRequestException);
    });

    it('rejects a PHP script buffer even when declared as image/png', async () => {
      const file = makeFile(SCRIPT_BYTES, { mimetype: 'image/png' });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).rejects.toThrow(BadRequestException);
    });

    it('rejects a buffer too short to contain magic bytes', async () => {
      const file = makeFile(Buffer.from([0xff, 0xd8]));
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).rejects.toThrow(BadRequestException);
    });

    it('never calls repo.uploadAvatar when magic-byte check fails', async () => {
      const file = makeFile(PDF_HEADER, { mimetype: 'image/jpeg' });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).rejects.toThrow();
      expect(repo.uploadAvatar).not.toHaveBeenCalled();
    });
  });

  // ── uploadAvatar — size gate (defense-in-depth) ───────────────────────

  describe('uploadAvatar — size gate', () => {
    it('accepts a file exactly at the 10 MB limit', async () => {
      const buf = Buffer.concat([JPEG_HEADER, Buffer.alloc(MAX_AVATAR_BYTES - JPEG_HEADER.length)]);
      const file = makeFile(buf, { size: MAX_AVATAR_BYTES });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).resolves.toBeDefined();
    });

    it('rejects a file 1 byte over the limit', async () => {
      const buf = Buffer.concat([JPEG_HEADER, Buffer.alloc(MAX_AVATAR_BYTES - JPEG_HEADER.length + 1)]);
      const file = makeFile(buf, { size: MAX_AVATAR_BYTES + 1 });
      await expect(service.uploadAvatar(MOCK_USER_ID, file)).rejects.toThrow(BadRequestException);
    });
  });

  // ── uploadAvatar — profile persistence ───────────────────────────────

  describe('uploadAvatar — profile persistence', () => {
    it('persists avatar_url to the profile after upload (server owns the URL)', async () => {
      const file = makeFile(JPEG_HEADER);
      await service.uploadAvatar(MOCK_USER_ID, file);
      expect(repo.update).toHaveBeenCalledWith(
        MOCK_USER_ID,
        { avatar_url: 'https://cdn.supabase.co/avatars/user.jpg' },
      );
    });

    it('returns the public Storage URL', async () => {
      const file = makeFile(JPEG_HEADER);
      expect(await service.uploadAvatar(MOCK_USER_ID, file)).toBe(
        'https://cdn.supabase.co/avatars/user.jpg',
      );
    });
  });
});
