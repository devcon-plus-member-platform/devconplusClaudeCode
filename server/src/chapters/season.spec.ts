import { getCurrentSeason, seasonStartUtcMs } from './season';

// 24 June 00:00 PHT == 23 June 16:00 UTC (PHT is UTC+8, no DST).
const START_2026 = '2026-06-23T16:00:00.000Z';
const START_2025 = '2025-06-23T16:00:00.000Z';
const START_2027 = '2027-06-23T16:00:00.000Z';

describe('getCurrentSeason', () => {
  it('returns the June-24-to-June-24 window for a mid-season date', () => {
    const { start, end } = getCurrentSeason(new Date('2026-09-18T00:00:00Z'));
    expect(start.toISOString()).toBe(START_2026);
    expect(end.toISOString()).toBe(START_2027);
  });

  it('stays in the previous season just before the boundary instant', () => {
    const { start, end } = getCurrentSeason(new Date('2026-06-23T15:59:59.999Z'));
    expect(start.toISOString()).toBe(START_2025);
    expect(end.toISOString()).toBe(START_2026);
  });

  it('starts the new season exactly at the boundary instant', () => {
    const { start, end } = getCurrentSeason(new Date('2026-06-23T16:00:00.000Z'));
    expect(start.toISOString()).toBe(START_2026);
    expect(end.toISOString()).toBe(START_2027);
  });

  it('treats early-January dates as the second half of the running season', () => {
    const { start, end } = getCurrentSeason(new Date('2026-01-15T00:00:00Z'));
    expect(start.toISOString()).toBe(START_2025);
    expect(end.toISOString()).toBe(START_2026);
  });

  it('agrees with the 24 June 00:00 Philippine-time wall clock', () => {
    // Written with an explicit +08:00 offset so the PHT reading is unambiguous.
    const boundaryPht = new Date('2026-06-24T00:00:00+08:00');
    expect(boundaryPht.toISOString()).toBe(START_2026);
    expect(seasonStartUtcMs(2026)).toBe(boundaryPht.getTime());
  });
});
