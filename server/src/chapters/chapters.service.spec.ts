import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import type { AppCacheService } from '../cache/app-cache.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../supabase/types';
import { ChaptersRepository } from './chapters.repository';
import { ChaptersService } from './chapters.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const admin: AuthenticatedUser = {
  firebaseUid: 'fb-admin-1',
  profileId: 'admin-1',
  profile: { id: 'admin-1', role: 'hq_admin' } as Profile,
};

const manilaRow = { id: 'chapter-manila', name: 'Manila', region: 'Luzon', created_at: '2026-01-01' };
const cebuRow = { id: 'chapter-cebu', name: 'Cebu', region: 'Visayas', created_at: '2026-01-01' };

// ── Mock repository ────────────────────────────────────────────────────────────

function makeRepo() {
  return {
    findAll: jest.fn().mockResolvedValue([manilaRow, cebuRow]),
    findById: jest.fn().mockResolvedValue(cebuRow),
    findByNameCaseInsensitive: jest.fn().mockResolvedValue(null),
    getStatsByChapter: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'new-id', name: 'Davao', region: 'Mindanao' }),
    update: jest.fn().mockResolvedValue({ ...cebuRow, name: 'Cebu' }),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ChaptersRepository>;
}

function makeCache() {
  return {
    getOrSet: jest.fn((_k: string, _ttl: number, loader: () => unknown) => loader()),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AppCacheService>;
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('ChaptersService', () => {
  let service: ChaptersService;
  let repo: jest.Mocked<ChaptersRepository>;
  let cache: jest.Mocked<AppCacheService>;

  beforeEach(() => {
    repo = makeRepo();
    cache = makeCache();
    service = new ChaptersService(repo, cache);
  });

  describe('create', () => {
    it('throws ConflictException when a chapter with the same name already exists', async () => {
      repo.findByNameCaseInsensitive.mockResolvedValue(manilaRow);
      await expect(
        service.create({ name: 'Manila', region: 'Luzon' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the name differs only by case', async () => {
      repo.findByNameCaseInsensitive.mockResolvedValue(manilaRow);
      await expect(
        service.create({ name: 'manila', region: 'Luzon' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when the name differs only by surrounding whitespace', async () => {
      repo.findByNameCaseInsensitive.mockResolvedValue(cebuRow);
      await expect(
        service.create({ name: '  Cebu  ', region: 'Visayas' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.findByNameCaseInsensitive).toHaveBeenCalledWith('Cebu');
    });

    it('succeeds and invalidates the cache when the name is unique', async () => {
      const result = await service.create({ name: 'Davao', region: 'Mindanao' }, admin);
      expect(result).toEqual({ id: 'new-id', name: 'Davao', region: 'Mindanao' });
      expect(repo.create).toHaveBeenCalledWith({ name: 'Davao', region: 'Mindanao' });
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws ConflictException when renaming onto an existing chapter\'s name', async () => {
      repo.findByNameCaseInsensitive.mockResolvedValue(manilaRow);
      await expect(
        service.update('chapter-cebu', { name: 'Manila' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('succeeds when the name is unchanged (self-exclusion)', async () => {
      repo.findByNameCaseInsensitive.mockResolvedValue(null);
      const result = await service.update('chapter-cebu', { name: 'Cebu' }, admin);
      expect(result.name).toBe('Cebu');
      expect(repo.findByNameCaseInsensitive).toHaveBeenCalledWith('Cebu', 'chapter-cebu');
      expect(repo.update).toHaveBeenCalledWith('chapter-cebu', { name: 'Cebu' });
    });

    it('succeeds when renaming to a genuinely unused name', async () => {
      repo.findByNameCaseInsensitive.mockResolvedValue(null);
      await service.update('chapter-cebu', { name: 'Cebu City' }, admin);
      expect(repo.update).toHaveBeenCalledWith('chapter-cebu', { name: 'Cebu City' });
    });
  });

  describe('unique-violation mapping', () => {
    it('surfaces a repository unique-violation (23505) as ConflictException, not a 500', async () => {
      repo.create.mockRejectedValue(new ConflictException('A chapter named "Davao" already exists.'));
      await expect(
        service.create({ name: 'Davao', region: 'Mindanao' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

// ── Repository-level: raw Postgres 23505 -> ConflictException ─────────────────

describe('ChaptersRepository unique-violation mapping', () => {
  it('maps a Postgres 23505 error on create() to ConflictException, not a 500', async () => {
    const fakeSupabase = {
      raw: {
        from: () => ({
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: {
                    code: '23505',
                    message:
                      'duplicate key value violates unique constraint "chapters_name_lower_key"',
                  },
                }),
            }),
          }),
        }),
      },
    } as unknown as SupabaseService;

    const repo = new ChaptersRepository(fakeSupabase);
    await expect(
      repo.create({ name: 'Manila', region: 'Luzon' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a Postgres 23505 error on update() to ConflictException, not a 500', async () => {
    const fakeSupabase = {
      raw: {
        from: () => ({
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: {
                      code: '23505',
                      message:
                        'duplicate key value violates unique constraint "chapters_name_lower_key"',
                    },
                  }),
              }),
            }),
          }),
        }),
      },
    } as unknown as SupabaseService;

    const repo = new ChaptersRepository(fakeSupabase);
    await expect(
      repo.update('chapter-cebu', { name: 'Manila' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
