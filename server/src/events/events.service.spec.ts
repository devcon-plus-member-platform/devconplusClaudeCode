import { NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AppCacheService } from '../cache/app-cache.service';
import { CacheKeys } from '../cache/cache-keys';
import type { Event, Profile } from '../supabase/types';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CH_1 = 'ch-uuid-1';

function makeUser(role: Profile['role'], chapterId: string | null): AuthenticatedUser {
  return {
    firebaseUid: 'fb',
    profileId: 'p-1',
    profile: { id: 'p-1', role, chapter_id: chapterId } as Profile,
  };
}

const officer = makeUser('chapter_officer', CH_1);
const admin = makeUser('hq_admin', CH_1);

const event = { id: 'ev-1', slug: 'devcon-summit-ev1', chapter_id: CH_1 } as Event;

function makeRepo() {
  return {
    findPage: jest.fn().mockResolvedValue({ rows: [event], total: 1 }),
    findManagePage: jest.fn().mockResolvedValue({ rows: [event], total: 1 }),
    findBySlug: jest.fn().mockResolvedValue(event),
    findById: jest.fn().mockResolvedValue(event),
    create: jest.fn().mockResolvedValue(event),
    update: jest.fn().mockResolvedValue(event),
    deleteWithCascade: jest.fn().mockResolvedValue(undefined),
  };
}

/** Pass-through cache that records keys; `version` is what EVENTS_VERSION holds. */
function makeCache(version: number | null = 7) {
  return {
    get: jest.fn().mockResolvedValue(version),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn((_key: string, _ttl: number, loader: () => Promise<unknown>) => loader()),
  };
}

function setup(version: number | null = 7) {
  const repo = makeRepo();
  const cache = makeCache(version);
  const service = new EventsService(
    repo as unknown as EventsRepository,
    cache as unknown as AppCacheService,
  );
  return { repo, cache, service };
}

function listQuery(overrides: Partial<ListEventsQueryDto> = {}): ListEventsQueryDto {
  return Object.assign(new ListEventsQueryDto(), overrides);
}

// ── listPage ──────────────────────────────────────────────────────────────────

describe('EventsService.listPage', () => {
  it('passes scope/limit/offset to the repository and returns { rows, total }', async () => {
    const { repo, service } = setup();
    const page = await service.listPage(listQuery({ scope: 'upcoming', limit: 50, offset: 100 }));

    expect(repo.findPage).toHaveBeenCalledWith({ scope: 'upcoming', limit: 50, offset: 100 });
    expect(page).toEqual({ rows: [event], total: 1 });
  });

  it('caches each page under its own versioned key', async () => {
    const { cache, service } = setup(7);
    await service.listPage(listQuery({ scope: 'past', limit: 20, offset: 40 }));

    expect(cache.getOrSet).toHaveBeenCalledWith(
      CacheKeys.eventsPage('7', 'past', 20, 40),
      expect.any(Number),
      expect.any(Function),
    );
  });

  it("uses version '0' before any write has bumped it", async () => {
    const { cache, service } = setup(null);
    await service.listPage(listQuery());

    expect(cache.getOrSet.mock.calls[0][0]).toBe(CacheKeys.eventsPage('0', 'all', 20, 0));
  });
});

// ── managePage ────────────────────────────────────────────────────────────────

describe('EventsService.managePage', () => {
  it("scopes chapter officers to their own chapter", async () => {
    const { repo, cache, service } = setup();
    await service.managePage({ limit: 100, offset: 0 }, officer);

    expect(repo.findManagePage).toHaveBeenCalledWith({ limit: 100, offset: 0 }, CH_1);
    expect(cache.getOrSet.mock.calls[0][0]).toBe(CacheKeys.eventsManagePage('7', CH_1, 100, 0));
  });

  it('gives HQ admins every event', async () => {
    const { repo, cache, service } = setup();
    await service.managePage({ limit: 100, offset: 0 }, admin);

    expect(repo.findManagePage).toHaveBeenCalledWith({ limit: 100, offset: 0 }, null);
    expect(cache.getOrSet.mock.calls[0][0]).toBe(CacheKeys.eventsManagePage('7', 'all', 100, 0));
  });

  it('returns an empty page for an officer with no chapter, without querying', async () => {
    const { repo, service } = setup();
    const page = await service.managePage({ limit: 20, offset: 0 }, makeUser('chapter_officer', null));

    expect(page).toEqual({ rows: [], total: 0 });
    expect(repo.findManagePage).not.toHaveBeenCalled();
  });
});

// ── single-event lookups ──────────────────────────────────────────────────────

describe('EventsService single-event lookups', () => {
  it('getBySlug returns the full event', async () => {
    const { repo, service } = setup();
    await expect(service.getBySlug('devcon-summit-ev1')).resolves.toBe(event);
    expect(repo.findBySlug).toHaveBeenCalledWith('devcon-summit-ev1');
  });

  it('getBySlug throws NotFound for an unknown slug', async () => {
    const { repo, service } = setup();
    repo.findBySlug.mockResolvedValue(null);
    await expect(service.getBySlug('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getById throws NotFound for an unknown id', async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(service.getById('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ── create: slug ──────────────────────────────────────────────────────────────

describe('EventsService.create sets the slug', () => {
  it('generates an id and a slug built from the title + that id', async () => {
    const { repo, service } = setup();
    await service.create({ title: 'DEVCON Summit 2027' } as never, officer);

    const row = repo.create.mock.calls[0][0] as { id: string; slug: string };
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.slug).toBe(`devcon-summit-2027-${row.id.slice(0, 8)}`);
  });

  it('keeps a slug the client explicitly sent', async () => {
    const { repo, service } = setup();
    await service.create({ title: 'x', slug: 'custom-slug' } as never, officer);

    expect((repo.create.mock.calls[0][0] as { slug: string }).slug).toBe('custom-slug');
  });

  it('ignores a blank client slug', async () => {
    const { repo, service } = setup();
    await service.create({ title: 'Code Camp', slug: '   ' } as never, officer);

    const row = repo.create.mock.calls[0][0] as { id: string; slug: string };
    expect(row.slug).toBe(`code-camp-${row.id.slice(0, 8)}`);
  });
});

// ── cache invalidation ────────────────────────────────────────────────────────

describe('EventsService writes bump the cache version', () => {
  const expectBump = (cache: ReturnType<typeof makeCache>) =>
    expect(cache.set).toHaveBeenCalledWith(
      CacheKeys.EVENTS_VERSION,
      expect.any(Number),
      expect.any(Number),
    );

  it('on create', async () => {
    const { cache, service } = setup();
    await service.create({ title: 'x' } as never, officer);
    expectBump(cache);
  });

  it('on update', async () => {
    const { cache, service } = setup();
    await service.update('ev-1', { title: 'y' }, officer);
    expectBump(cache);
  });

  it('on delete', async () => {
    const { cache, service } = setup();
    await service.delete('ev-1', officer);
    expectBump(cache);
  });
});
