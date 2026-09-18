import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import type { AppCacheService } from '../cache/app-cache.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../supabase/types';
import { CACHE_TTL, CacheKeys } from '../cache/cache-keys';
import { ChaptersRepository } from './chapters.repository';
import { ChaptersService } from './chapters.service';
import { getCurrentSeason } from './season';

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
    findSeasonEvents: jest.fn().mockResolvedValue([]),
    findChapterProfiles: jest.fn().mockResolvedValue([]),
    findAllSeasonEvents: jest.fn().mockResolvedValue([]),
    findAllProfiles: jest.fn().mockResolvedValue([]),
    findEventRegistrations: jest.fn().mockResolvedValue([]),
    findSeasonTransactions: jest.fn().mockResolvedValue([]),
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

// ── getChapterStanding (ticket 01: single-chapter participation rate) ─────────

describe('ChaptersService.getChapterStanding', () => {
  const CH_MANILA = 'chapter-manila';
  const season = getCurrentSeason(new Date());
  const START_ISO = season.start.toISOString();
  const END_ISO = season.end.toISOString();
  const day = (n: number): string =>
    new Date(season.start.getTime() + n * 86_400_000).toISOString();

  const E1 = day(10);
  const E2 = day(20);
  const JOINED_BEFORE_SEASON = day(-30);
  const JOINED_MID_SEASON = day(15);
  const JOINED_AFTER_LAST_EVENT = day(25);

  const officerOf = (chapterId: string, id = 'officer-1'): AuthenticatedUser => ({
    firebaseUid: `fb-${id}`,
    profileId: id,
    profile: { id, role: 'chapter_officer', chapter_id: chapterId } as Profile,
  });

  const members = (
    n: number,
    joinedIso: string,
    prefix: string,
  ): { id: string; created_at: string }[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      created_at: joinedIso,
    }));

  const checkedIn = (
    userId: string,
    eventId: string,
  ): {
    event_id: string;
    user_id: string;
    status: string | null;
    checked_in: boolean | null;
  } => ({ event_id: eventId, user_id: userId, status: 'approved', checked_in: true });

  let service: ChaptersService;
  let repo: jest.Mocked<ChaptersRepository>;

  beforeEach(() => {
    repo = makeRepo();
    const cache = makeCache();
    service = new ChaptersService(repo, cache);
    repo.findById.mockResolvedValue(manilaRow);
  });

  function arrangeSeason(opts: {
    events?: { id: string; event_date: string | null }[];
    profiles?: { id: string; created_at: string }[];
    registrations?: {
      event_id: string;
      user_id: string;
      status: string | null;
      checked_in: boolean | null;
    }[];
    transactions?: {
      user_id: string | null;
      amount: number | null;
      source: string | null;
    }[];
  }): void {
    repo.findSeasonEvents.mockResolvedValue(
      opts.events ?? [
        { id: 'e1', event_date: E1 },
        { id: 'e2', event_date: E2 },
      ],
    );
    repo.findChapterProfiles.mockResolvedValue(opts.profiles ?? []);
    repo.findEventRegistrations.mockResolvedValue(opts.registrations ?? []);
    repo.findSeasonTransactions.mockResolvedValue(opts.transactions ?? []);
  }

  it('computes the participation rate from members, events and check-ins', async () => {
    const profiles = members(30, JOINED_BEFORE_SEASON, 'm');
    arrangeSeason({
      profiles,
      registrations: profiles
        .slice(0, 15)
        .map((p) => checkedIn(p.id, 'e1')),
      transactions: [
        { user_id: 'm-0', amount: 100, source: 'event_attendance' },
        { user_id: 'm-1', amount: 200, source: 'volunteering' },
      ],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.chapterId).toBe(CH_MANILA);
    expect(result.participationRate).toBe(50);
    expect(result.status).toBe('ranked');
    expect(result.rank).toBeNull();
    expect(result.eligibleMembers).toBe(30);
    expect(result.participants).toBe(15);
    expect(result.events).toBe(2);
    expect(result.checkIns).toBe(15);
    expect(result.approvedRegistrations).toBe(15);
    expect(result.showUpRate).toBe(100);
    expect(result.newMembers).toBe(0);
    expect(result.xp).toBe(300);
    expect(typeof result.computedAt).toBe('string');
  });

  it('counts a multi-event member once in the numerator and many times in check-ins', async () => {
    arrangeSeason({
      profiles: members(30, JOINED_BEFORE_SEASON, 'm'),
      registrations: [checkedIn('m-0', 'e1'), checkedIn('m-0', 'e2')],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.participants).toBe(1);
    expect(result.checkIns).toBe(2);
    expect(result.participationRate).toBe(3.3);
    expect(result.avgPerEvent).toBe(1);
  });

  it('does not count an approved registration that was never checked in', async () => {
    arrangeSeason({
      profiles: members(30, JOINED_BEFORE_SEASON, 'm'),
      registrations: Array.from({ length: 5 }, (_, i) => ({
        event_id: 'e1',
        user_id: `m-${i}`,
        status: 'approved',
        checked_in: false,
      })),
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.participants).toBe(0);
    expect(result.checkIns).toBe(0);
    expect(result.participationRate).toBe(0);
    expect(result.approvedRegistrations).toBe(5);
    expect(result.showUpRate).toBe(0);
  });

  it('excludes a member who joined after the most recent event from numerator and denominator', async () => {
    const profiles = [
      ...members(30, JOINED_BEFORE_SEASON, 'm'),
      ...members(5, JOINED_AFTER_LAST_EVENT, 'late'),
    ];
    arrangeSeason({
      profiles,
      // late-0 appears in the raw check-in rows (data anomaly) but joined
      // after the chapter's most recent event, so they count nowhere.
      registrations: [checkedIn('m-0', 'e1'), checkedIn('late-0', 'e2')],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.eligibleMembers).toBe(30);
    expect(result.participants).toBe(1);
    expect(result.newMembers).toBe(5);
  });

  it('counts a mid-season joiner who attended in both numerator and denominator', async () => {
    arrangeSeason({
      profiles: [
        ...members(30, JOINED_BEFORE_SEASON, 'm'),
        { id: 'mid-0', created_at: JOINED_MID_SEASON },
      ],
      registrations: [checkedIn('mid-0', 'e2')],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.eligibleMembers).toBe(31);
    expect(result.participants).toBe(1);
  });

  it('keeps the rate unchanged when members with no opportunity to attend join', async () => {
    const oldProfiles = members(30, JOINED_BEFORE_SEASON, 'm');
    const regs = oldProfiles.slice(0, 15).map((p) => checkedIn(p.id, 'e1'));

    arrangeSeason({ profiles: oldProfiles, registrations: regs });
    const before = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    arrangeSeason({
      profiles: [...oldProfiles, ...members(10, JOINED_AFTER_LAST_EVENT, 'late')],
      registrations: regs,
    });
    const after = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(after.participationRate).toBe(before.participationRate);
    expect(after.eligibleMembers).toBe(30);
  });

  it('bounds the event query at the present moment, not at next June', async () => {
    arrangeSeason({ profiles: members(2, JOINED_BEFORE_SEASON, 'm') });
    await service.getChapterStanding(officerOf(CH_MANILA), CH_MANILA);

    expect(repo.findSeasonEvents).toHaveBeenCalledWith(
      CH_MANILA,
      START_ISO,
      expect.any(String),
    );
    const endArg: string = repo.findSeasonEvents.mock.calls[0][2];
    // The season end is next June — the bound actually sent is now, so an
    // event scheduled for next month never reaches the computation.
    expect(endArg < END_ISO).toBe(true);
    expect(Date.parse(endArg)).toBeLessThanOrEqual(Date.now());
    expect(repo.findSeasonTransactions).toHaveBeenCalledWith(
      START_ISO,
      END_ISO,
    );
    expect(repo.findEventRegistrations).toHaveBeenCalledWith(['e1', 'e2']);
  });

  it('reports no-events when a chapter holds nothing yet this season', async () => {
    // What the repository returns once the upper bound is now: a chapter
    // whose only season event is dated in the future has no held events.
    arrangeSeason({
      events: [],
      profiles: members(30, JOINED_BEFORE_SEASON, 'm'),
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.status).toBe('no-events');
    expect(result.participationRate).toBeNull();
    expect(result.events).toBe(0);
  });

  it('does not let a scheduled event extend the eligible-member cutoff', async () => {
    // Pampanga shape: one event held on 1 August, another scheduled ahead.
    // The repository (bounded at now) returns only the held one, so a member
    // who joined after it stays out of both numerator and denominator.
    const heldDay = day(39); // 1 August, relative to the 23 June start
    const joinedAfterHeld = new Date(
      Date.parse(heldDay) + 7 * 86_400_000,
    ).toISOString();
    repo.findSeasonEvents.mockResolvedValue([{ id: 'e1', event_date: heldDay }]);
    repo.findChapterProfiles.mockResolvedValue([
      ...members(30, JOINED_BEFORE_SEASON, 'm'),
      ...members(5, joinedAfterHeld, 'late'),
    ]);
    repo.findEventRegistrations.mockResolvedValue([]);
    repo.findSeasonTransactions.mockResolvedValue([]);

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.eligibleMembers).toBe(30);
    expect(result.newMembers).toBe(5);
  });

  it('divides average check-ins by events held, not events scheduled', async () => {
    const profiles = members(30, JOINED_BEFORE_SEASON, 'm');
    arrangeSeason({
      events: [{ id: 'e1', event_date: E1 }],
      profiles,
      registrations: profiles
        .slice(0, 15)
        .map((p) => checkedIn(p.id, 'e1')),
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.events).toBe(1);
    expect(result.checkIns).toBe(15);
    expect(result.avgPerEvent).toBe(15);
  });

  it('marks a chapter with no events as no-events with a null rate, not zero', async () => {
    arrangeSeason({
      events: [],
      profiles: members(3, JOINED_AFTER_LAST_EVENT, 'm'),
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.status).toBe('no-events');
    expect(result.participationRate).toBeNull();
    expect(result.eligibleMembers).toBe(0);
    expect(result.events).toBe(0);
    expect(result.showUpRate).toBeNull();
    expect(result.newMembers).toBe(3);
  });

  it('marks a chapter below the member floor as unranked but still carries its rate', async () => {
    const profiles = members(10, JOINED_BEFORE_SEASON, 'm');
    arrangeSeason({
      profiles,
      registrations: profiles.slice(0, 5).map((p) => checkedIn(p.id, 'e1')),
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.status).toBe('unranked');
    expect(result.rank).toBeNull();
    expect(result.participationRate).toBe(50);
  });

  it('reports exactly 100% when every eligible member attended', async () => {
    const profiles = members(30, JOINED_BEFORE_SEASON, 'm');
    arrangeSeason({
      profiles,
      registrations: profiles.map((p) => checkedIn(p.id, 'e1')),
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.participationRate).toBe(100);
  });

  it('excludes reset ledger rows from season XP', async () => {
    arrangeSeason({
      profiles: members(30, JOINED_BEFORE_SEASON, 'm'),
      transactions: [
        { user_id: 'm-0', amount: 100, source: 'event_attendance' },
        { user_id: 'm-0', amount: -500, source: 'reset' },
      ],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.xp).toBe(100);
  });

  it('counts a visitor check-in in total check-ins and show-up rate, not in the rate', async () => {
    const profiles = members(30, JOINED_BEFORE_SEASON, 'm');
    arrangeSeason({
      profiles,
      registrations: [
        checkedIn('m-0', 'e1'),
        // A member of another chapter, approved and physically present.
        { event_id: 'e1', user_id: 'visitor-0', status: 'approved', checked_in: true },
      ],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.checkIns).toBe(2);
    expect(result.approvedRegistrations).toBe(2);
    expect(result.showUpRate).toBe(100);
    expect(result.avgPerEvent).toBe(1);
    // The visitor moves the room count but not the cohort rate.
    expect(result.participants).toBe(1);
    expect(result.participationRate).toBe(3.3);
  });

  it('does not let a reward redemption reduce season XP', async () => {
    arrangeSeason({
      profiles: members(30, JOINED_BEFORE_SEASON, 'm'),
      transactions: [
        { user_id: 'm-0', amount: 10000, source: 'event_attendance' },
        { user_id: 'm-0', amount: -1500, source: 'redemption' },
      ],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.xp).toBe(10000);
  });

  it('marks events with zero eligible members as unranked with a null rate, not 0%', async () => {
    arrangeSeason({
      profiles: members(5, JOINED_AFTER_LAST_EVENT, 'late'),
      registrations: [],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.events).toBe(2);
    expect(result.eligibleMembers).toBe(0);
    expect(result.status).toBe('unranked');
    expect(result.rank).toBeNull();
    expect(result.participationRate).toBeNull();
  });

  it('counts a transaction with a null source in season XP', async () => {
    arrangeSeason({
      profiles: members(30, JOINED_BEFORE_SEASON, 'm'),
      transactions: [
        { user_id: 'm-0', amount: 100, source: 'event_attendance' },
        // Hand-created dashboard rows carry no source; the query must not drop them.
        { user_id: 'm-1', amount: 50, source: null },
        { user_id: 'm-2', amount: -500, source: 'reset' },
      ],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.xp).toBe(150);
  });

  it('counts a member who joined at the season start whatever the timestamp format', async () => {
    // PostgREST renders "+00:00" where the season bound renders "Z": as raw
    // strings the identical instant misorders ('+' < 'Z'), so the comparison
    // must parse both sides.
    const seasonStartPlusOffset = START_ISO.replace('.000Z', '.000+00:00');
    arrangeSeason({
      profiles: [
        ...members(30, JOINED_BEFORE_SEASON, 'm'),
        { id: 'edge-0', created_at: seasonStartPlusOffset },
      ],
      registrations: [],
    });

    const result = await service.getChapterStanding(
      officerOf(CH_MANILA),
      CH_MANILA,
    );

    expect(result.newMembers).toBe(1);
  });

  it('serves a second call within the TTL from the cache without re-querying', async () => {
    const store = new Map<string, unknown>();
    const cachingCache = {
      getOrSet: jest.fn((key: string, _ttl: number, loader: () => unknown) => {
        if (!store.has(key)) store.set(key, loader());
        return store.get(key);
      }),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AppCacheService>;
    const cached = new ChaptersService(repo, cachingCache);
    repo.findById.mockResolvedValue(manilaRow);
    arrangeSeason({ profiles: members(30, JOINED_BEFORE_SEASON, 'm') });

    const officer = officerOf(CH_MANILA);
    const first = await cached.getChapterStanding(officer, CH_MANILA);
    const second = await cached.getChapterStanding(officer, CH_MANILA);

    expect(second).toEqual(first);
    expect(repo.findById).toHaveBeenCalledTimes(1);
    expect(cachingCache.getOrSet).toHaveBeenCalledWith(
      CacheKeys.standing(START_ISO, CH_MANILA),
      CACHE_TTL.STANDINGS,
      expect.any(Function),
    );
  });

  it('refuses a chapter officer requesting another chapter without touching data', async () => {
    await expect(
      service.getChapterStanding(officerOf('chapter-other'), CH_MANILA),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('allows an HQ admin to request any chapter', async () => {
    repo.findById.mockResolvedValue(cebuRow);
    arrangeSeason({ profiles: members(2, JOINED_BEFORE_SEASON, 'm') });
    const result = await service.getChapterStanding(admin, 'chapter-cebu');
    expect(repo.findById).toHaveBeenCalledWith('chapter-cebu');
    expect(result.chapterId).toBe('chapter-cebu');
  });

  it('throws NotFoundException for an unknown chapter', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      service.getChapterStanding(admin, 'chapter-missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── getStandings (ticket 02: ranked standings across all chapters) ──────────

describe('ChaptersService.getStandings', () => {
  const season = getCurrentSeason(new Date());
  const START_ISO = season.start.toISOString();
  const END_ISO = season.end.toISOString();
  const day = (n: number): string =>
    new Date(season.start.getTime() + n * 86_400_000).toISOString();

  const E = day(10);
  const JOINED = day(-30);

  const chapter = (
    id: string,
    name: string,
    region: string | null,
  ): {
    id: string;
    name: string;
    region: string | null;
    created_at: string;
  } => ({
    id,
    name,
    region,
    created_at: day(-400),
  });

  const membersOf = (
    chapterId: string,
    n: number,
    prefix: string,
  ): { id: string; chapter_id: string; created_at: string }[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      chapter_id: chapterId,
      created_at: JOINED,
    }));

  let service: ChaptersService;
  let repo: jest.Mocked<ChaptersRepository>;
  let cache: jest.Mocked<AppCacheService>;

  beforeEach(() => {
    repo = makeRepo();
    cache = makeCache();
    service = new ChaptersService(repo, cache);
  });

  function arrangeFourChapters(): void {
    const chapters = [
      chapter('ch-a', 'Alpha', 'Luzon'),
      chapter('ch-b', 'Beta', 'Visayas'),
      chapter('ch-c', 'Gamma', 'Mindanao'),
      chapter('ch-d', 'Delta', 'Luzon'),
    ];
    // Alpha: 30 eligible, 27 checked in → 90%, ranked.
    // Beta: 30 eligible, 15 checked in → 50%, ranked.
    // Gamma: 10 eligible, all 10 checked in → 100% but unranked (floor).
    // Delta: no events → no-events, null rate.
    const profiles = [
      ...membersOf('ch-a', 30, 'a'),
      ...membersOf('ch-b', 30, 'b'),
      ...membersOf('ch-c', 10, 'c'),
      ...membersOf('ch-d', 5, 'd'),
    ];
    const events = [
      { id: 'e-a', chapter_id: 'ch-a', event_date: E },
      { id: 'e-b', chapter_id: 'ch-b', event_date: E },
      { id: 'e-c', chapter_id: 'ch-c', event_date: E },
    ];
    const regs = [
      ...Array.from({ length: 27 }, (_, i) => ({
        event_id: 'e-a',
        user_id: `a-${i}`,
        status: 'approved',
        checked_in: true,
      })),
      ...Array.from({ length: 15 }, (_, i) => ({
        event_id: 'e-b',
        user_id: `b-${i}`,
        status: 'approved',
        checked_in: true,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        event_id: 'e-c',
        user_id: `c-${i}`,
        status: 'approved',
        checked_in: true,
      })),
    ];
    repo.findAll.mockResolvedValue(chapters);
    repo.findAllSeasonEvents.mockResolvedValue(events);
    repo.findAllProfiles.mockResolvedValue(profiles);
    repo.findEventRegistrations.mockResolvedValue(regs);
    repo.findSeasonTransactions.mockResolvedValue([]);
  }

  it('orders ranked chapters first by descending rate, then unranked, then no-events', async () => {
    arrangeFourChapters();
    const { standings } = await service.getStandings();

    expect(standings.map((s) => s.chapter)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
    ]);
    expect(standings.map((s) => s.status)).toEqual([
      'ranked',
      'ranked',
      'unranked',
      'no-events',
    ]);
  });

  it('assigns contiguous positions to ranked chapters only', async () => {
    arrangeFourChapters();
    const { standings } = await service.getStandings();

    expect(standings.map((s) => s.rank)).toEqual([1, 2, null, null]);
    expect(standings[0].participationRate).toBe(90);
    expect(standings[1].participationRate).toBe(50);
  });

  it('keeps an unranked high rate from displacing ranked chapters, rate still shown', async () => {
    arrangeFourChapters();
    const { standings } = await service.getStandings();

    const gamma = standings.find((s) => s.chapter === 'Gamma');
    expect(gamma?.status).toBe('unranked');
    expect(gamma?.rank).toBeNull();
    expect(gamma?.participationRate).toBe(100);
    // Gamma's 100% does not take position 1 from Alpha's 90%.
    expect(standings[0].chapter).toBe('Alpha');
    expect(standings[0].rank).toBe(1);
  });

  it('marks event-less chapters last with a null rate, not zero', async () => {
    arrangeFourChapters();
    const { standings } = await service.getStandings();

    const delta = standings[standings.length - 1];
    expect(delta.chapter).toBe('Delta');
    expect(delta.status).toBe('no-events');
    expect(delta.participationRate).toBeNull();
    expect(delta.rank).toBeNull();
  });

  it('bounds the all-chapters event scan at the present moment', async () => {
    arrangeFourChapters();
    await service.getStandings();

    expect(repo.findAllSeasonEvents).toHaveBeenCalledWith(
      START_ISO,
      expect.any(String),
    );
    const endArg: string = repo.findAllSeasonEvents.mock.calls[0][1];
    expect(endArg < END_ISO).toBe(true);
    expect(Date.parse(endArg)).toBeLessThanOrEqual(Date.now());
  });

  it('caches the standings for one hour under the season-scoped catalogue key', async () => {
    arrangeFourChapters();
    await service.getStandings();

    expect(cache.getOrSet).toHaveBeenCalledWith(
      CacheKeys.standings(START_ISO),
      CACHE_TTL.STANDINGS,
      expect.any(Function),
    );
    expect(CACHE_TTL.STANDINGS).toBe(3600);
    expect(END_ISO).not.toBe(START_ISO);
  });

  it('carries the computation time on the response', async () => {
    arrangeFourChapters();
    const result = await service.getStandings();

    expect(typeof result.computedAt).toBe('string');
    expect(result.standings[0].computedAt).toBe(result.computedAt);
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
