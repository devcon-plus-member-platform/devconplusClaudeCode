import { getCurrentSeason } from './season';

/**
 * Chapter leaderboard vocabulary — participation rate, checked in, season,
 * eligible member, unranked, no events this season — is defined in the root
 * `CONTEXT.md`. These types use those terms exactly.
 *
 * Fixed contract between the standings endpoints and both surfaces (officer
 * + HQ). Ordering of a list is the server's responsibility (ticket 02); the
 * single-chapter view (ticket 01) always carries `rank: null`.
 */

export type ChapterStandingStatus = 'ranked' | 'unranked' | 'no-events';

export interface ChapterStanding {
  chapterId: string;
  chapter: string;
  region: string | null;
  rank: number | null;
  status: ChapterStandingStatus;
  /** Percentage to one decimal place; null when the rate is undefined — no events, or no eligible members. */
  participationRate: number | null;
  eligibleMembers: number;
  participants: number;
  events: number;
  checkIns: number;
  avgPerEvent: number;
  approvedRegistrations: number;
  /** Check-ins as a percentage of approved registrations; null when none. */
  showUpRate: number | null;
  newMembers: number;
  /** Season-filtered points earned (reset and redemption ledger rows excluded). */
  xp: number;
  computedAt: string;
}

/**
 * A chapter with fewer than this many eligible members is unranked: below
 * this size a single person swings the rate by whole percentage points, so
 * a position would be noise rather than performance. The rate is still
 * computed and shown, tagged as unranked, rather than suppressed.
 */
export const MIN_ELIGIBLE_MEMBERS_FOR_RANK = 25;

export interface StandingInput {
  chapterId: string;
  chapter: string;
  region: string | null;
  seasonEvents: { id: string; event_date: string | null }[];
  profiles: { id: string; created_at: string }[];
  registrations: {
    event_id: string;
    user_id: string;
    status: string | null;
    checked_in: boolean | null;
  }[];
  transactions: {
    user_id: string | null;
    amount: number | null;
    source: string | null;
  }[];
  seasonStartIso: string;
  computedAtIso: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeChapterStanding(input: StandingInput): ChapterStanding {
  const base = {
    chapterId: input.chapterId,
    chapter: input.chapter,
    region: input.region,
    rank: null,
    computedAt: input.computedAtIso,
  };

  // PostgREST timestamps carry an explicit offset (2026-05-13T16:35:49.975623+00:00)
  // while the season bound is rendered with Z — compare parsed instants so a
  // member who joined within the same second as the boundary is not misordered.
  const seasonStartMs = Date.parse(input.seasonStartIso);
  const newMembers = input.profiles.filter(
    (p) => Date.parse(p.created_at) >= seasonStartMs,
  ).length;
  const memberIds = new Set(input.profiles.map((p) => p.id));
  // Earned, not net of spending: reward redemptions carry negative amounts
  // under source 'redemption' (rewards catalogue debits spendable_points only,
  // leaving the HQ lifetime_points column untouched). Excluded by source, not
  // by sign, so a future negative source cannot slip through.
  const xp = input.transactions
    .filter(
      (t) =>
        t.user_id !== null &&
        memberIds.has(t.user_id) &&
        t.source !== 'reset' &&
        t.source !== 'redemption',
    )
    .reduce((sum, t) => sum + (t.amount ?? 0), 0);

  if (input.seasonEvents.length === 0) {
    // No events this season: no eligible members, so the rate is undefined,
    // not zero — 0% would assert the chapter tried and nobody came.
    return {
      ...base,
      status: 'no-events',
      participationRate: null,
      eligibleMembers: 0,
      participants: 0,
      events: 0,
      checkIns: 0,
      avgPerEvent: 0,
      approvedRegistrations: 0,
      showUpRate: null,
      newMembers,
      xp,
    };
  }

  const eventDates = input.seasonEvents
    .map((e) => (e.event_date ? Date.parse(e.event_date) : NaN))
    .filter((ms) => !Number.isNaN(ms));
  const latestEventMs =
    eventDates.length > 0 ? Math.max(...eventDates) : Number.NaN;

  // Eligible member: the chapter held at least one season event dated on or
  // after the member joined. Equivalent to joined-at <= latest event date.
  // Recruiting stays rank-neutral: a member who joined after the most recent
  // event is excluded from both numerator and denominator.
  const eligibleIds = new Set(
    input.profiles
      .filter((p) => Date.parse(p.created_at) <= latestEventMs)
      .map((p) => p.id),
  );

  // Total check-ins, average per event and the show-up ratio are not cohort
  // measures: they count everyone who attended the chapter's events, whatever
  // chapter they belong to. Only the participation-rate numerator is
  // restricted to the chapter's own eligible members.
  const checkedRows = input.registrations.filter(
    (r) => r.checked_in === true && r.status !== 'cancelled',
  );
  const participants = new Set(
    checkedRows.filter((r) => eligibleIds.has(r.user_id)).map((r) => r.user_id),
  ).size;
  const checkIns = checkedRows.length;
  const approvedRegistrations = input.registrations.filter(
    (r) => r.status === 'approved',
  ).length;

  const eligibleMembers = eligibleIds.size;
  const participationRate =
    eligibleMembers > 0
      ? Math.min(100, round1((participants / eligibleMembers) * 100))
      : null;

  return {
    ...base,
    status:
      eligibleMembers < MIN_ELIGIBLE_MEMBERS_FOR_RANK ? 'unranked' : 'ranked',
    participationRate,
    eligibleMembers,
    participants,
    events: input.seasonEvents.length,
    checkIns,
    avgPerEvent:
      input.seasonEvents.length > 0
        ? round1(checkIns / input.seasonEvents.length)
        : 0,
    approvedRegistrations,
    showUpRate:
      approvedRegistrations > 0
        ? round1((checkIns / approvedRegistrations) * 100)
        : null,
    newMembers,
    xp,
  };
}

export function currentSeasonStartIso(now: Date = new Date()): string {
  return getCurrentSeason(now).start.toISOString();
}

export interface StandingsResponse {
  standings: ChapterStanding[];
  computedAt: string;
}

function compareRateDescThenName(
  a: ChapterStanding,
  b: ChapterStanding,
): number {
  return (
    (b.participationRate ?? 0) - (a.participationRate ?? 0) ||
    a.chapter.localeCompare(b.chapter)
  );
}

/**
 * Server-owned ordering so the officer surface and the HQ surface agree
 * without duplicating the rule: ranked chapters first by descending
 * participation rate (positions 1..N assigned here), then unranked chapters
 * (rate still shown, no position, never displacing ranked chapters), then
 * chapters with no events this season.
 */
export function orderStandings(
  standings: ChapterStanding[],
): ChapterStanding[] {
  const ranked = standings
    .filter((s) => s.status === 'ranked')
    .sort(compareRateDescThenName)
    .map((s, i) => ({ ...s, rank: i + 1 }));
  const unranked = standings
    .filter((s) => s.status === 'unranked')
    .sort(compareRateDescThenName)
    .map((s) => ({ ...s, rank: null }));
  const noEvents = standings
    .filter((s) => s.status === 'no-events')
    .sort((a, b) => a.chapter.localeCompare(b.chapter))
    .map((s) => ({ ...s, rank: null }));
  return [...ranked, ...unranked, ...noEvents];
}
