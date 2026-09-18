/**
 * Current-season window for the chapter leaderboard.
 *
 * The season is the points year the app already uses: it runs from one
 * 24 June 00:00 Philippine time to the next, matching the annual points
 * reset (`supabase/migrations/20260708_reset_points_annual.sql`, cron
 * `0 16 23 6 *` — June 23 16:00 UTC). Check-in records are never deleted,
 * so the season is applied as a date filter, not read from a column.
 *
 * Philippine time is UTC+8 year-round (no DST) — mirrors the web helper
 * `getPointsExpiry()` in `web/src/lib/dates.ts`. The server keeps its own
 * copy rather than importing across the web/server boundary.
 */

export const PH_OFFSET_MS = 8 * 3_600_000;

export interface SeasonWindow {
  start: Date;
  end: Date;
}

/** 24 June 00:00 PHT for the given Philippine-calendar year, as a UTC instant. */
export function seasonStartUtcMs(phYear: number): number {
  return Date.UTC(phYear, 5, 24) - PH_OFFSET_MS;
}

export function getCurrentSeason(now: Date = new Date()): SeasonWindow {
  const phYear = new Date(now.getTime() + PH_OFFSET_MS).getUTCFullYear();
  const startYear =
    now.getTime() >= seasonStartUtcMs(phYear) ? phYear : phYear - 1;
  return {
    start: new Date(seasonStartUtcMs(startYear)),
    end: new Date(seasonStartUtcMs(startYear + 1)),
  };
}
