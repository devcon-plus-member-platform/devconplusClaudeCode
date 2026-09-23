import { describe, expect, it } from 'vitest'
import { formatRate, heroComparison, participationRateDisplay, seasonLabel, sortStandings, tiedRates } from './standings'
import type { ChapterStanding } from '../stores/useChapterStandingStore'

const base: ChapterStanding = {
  chapterId: 'x',
  chapter: 'X',
  region: 'Luzon',
  rank: null,
  status: 'ranked',
  participationRate: 50,
  eligibleMembers: 100,
  participants: 50,
  events: 2,
  checkIns: 60,
  avgPerEvent: 30,
  approvedRegistrations: 80,
  showUpRate: 75,
  newMembers: 5,
  xp: 1000,
  totalPoints: 2500,
  computedAt: '2026-09-18T00:00:00.000Z',
}

function row(
  overrides: Partial<ChapterStanding> & { chapterId: string; chapter: string },
): ChapterStanding {
  return { ...base, ...overrides }
}

function names(rows: ChapterStanding[]): string[] {
  return rows.map((r) => r.chapter)
}

describe('sortStandings', () => {
  it('keeps the server group order under the default sort: ranked, then unranked, then no-events', () => {
    const rows = [
      row({ chapterId: 'm', chapter: 'Manila', status: 'ranked', participationRate: 70 }),
      row({ chapterId: 'i', chapter: 'Iloilo', status: 'no-events', participationRate: null, eligibleMembers: 0 }),
      row({ chapterId: 'd', chapter: 'Davao', status: 'unranked', participationRate: 95 }),
      row({ chapterId: 'c', chapter: 'Cebu', status: 'ranked', participationRate: 90 }),
    ]
    expect(names(sortStandings(rows, 'participationRate', 'desc'))).toEqual([
      'Cebu',
      'Manila',
      'Davao',
      'Iloilo',
    ])
  })

  it('never lets an unranked chapter at 100% displace a ranked chapter at 90%', () => {
    const rows = [
      row({ chapterId: 'd', chapter: 'Davao', status: 'unranked', participationRate: 100 }),
      row({ chapterId: 'c', chapter: 'Cebu', status: 'ranked', participationRate: 90 }),
    ]
    expect(names(sortStandings(rows, 'participationRate', 'desc'))).toEqual([
      'Cebu',
      'Davao',
    ])
  })

  it('ascending participation rate still keeps the group order', () => {
    const rows = [
      row({ chapterId: 'd', chapter: 'Davao', status: 'unranked', participationRate: 95 }),
      row({ chapterId: 'c', chapter: 'Cebu', status: 'ranked', participationRate: 90 }),
      row({ chapterId: 'i', chapter: 'Iloilo', status: 'no-events', participationRate: null, eligibleMembers: 0 }),
      row({ chapterId: 'b', chapter: 'Bacolod', status: 'unranked', participationRate: 40 }),
      row({ chapterId: 'm', chapter: 'Manila', status: 'ranked', participationRate: 70 }),
    ]
    expect(names(sortStandings(rows, 'participationRate', 'asc'))).toEqual([
      'Manila',
      'Cebu',
      'Bacolod',
      'Davao',
      'Iloilo',
    ])
  })

  it('sorts showUpRate nulls last in both directions', () => {
    const rows = [
      row({ chapterId: 'n', chapter: 'Null', showUpRate: null }),
      row({ chapterId: 'e', chapter: 'Eighty', showUpRate: 80 }),
      row({ chapterId: 'f', chapter: 'Fifty', showUpRate: 50 }),
    ]
    expect(names(sortStandings(rows, 'showUpRate', 'asc'))).toEqual([
      'Fifty',
      'Eighty',
      'Null',
    ])
    expect(names(sortStandings(rows, 'showUpRate', 'desc'))).toEqual([
      'Eighty',
      'Fifty',
      'Null',
    ])
  })

  it('breaks ties on chapter name', () => {
    const rows = [
      row({ chapterId: 'm', chapter: 'Manila', status: 'ranked', participationRate: 70 }),
      row({ chapterId: 'c', chapter: 'Cebu', status: 'ranked', participationRate: 70 }),
    ]
    expect(names(sortStandings(rows, 'participationRate', 'desc'))).toEqual([
      'Cebu',
      'Manila',
    ])
  })
})

describe('formatRate', () => {
  it('always shows one decimal place', () => {
    expect(formatRate(40)).toBe('40.0%')
    expect(formatRate(48.4)).toBe('48.4%')
    expect(formatRate(100)).toBe('100.0%')
  })
})

describe('seasonLabel', () => {
  it('names the season by the two years it spans', () => {
    // A season runs from 24 June 00:00 Philippine time to the next.
    expect(seasonLabel(new Date('2026-09-23T00:00:00+08:00'))).toBe('Season 2026–27')
    expect(seasonLabel(new Date('2027-05-01T00:00:00+08:00'))).toBe('Season 2026–27')
    expect(seasonLabel(new Date('2027-06-24T00:00:00+08:00'))).toBe('Season 2027–28')
    expect(seasonLabel(new Date('2027-06-23T23:59:00+08:00'))).toBe('Season 2026–27')
  })
})

describe('heroComparison', () => {
  const first = { rank: 1, participationRate: 40 }
  const second = { rank: 2, participationRate: 37 }
  const third = { rank: 3, participationRate: 34 }

  it('reads "Ahead of 2nd" for the first-placed chapter', () => {
    expect(
      heroComparison({ status: 'ranked', rank: 1, participationRate: 40 }, [first, second, third]),
    ).toBe('Ahead of 2nd: 40.0% vs 37.0%')
  })

  it('reads "Behind 1st" for any other ranked chapter', () => {
    expect(
      heroComparison({ status: 'ranked', rank: 3, participationRate: 34 }, [first, second, third]),
    ).toBe('Behind 1st: 34.0% vs 40.0%')
  })

  it('never writes a rate difference as points', () => {
    const text = heroComparison({ status: 'ranked', rank: 1, participationRate: 40 }, [first, second])
    expect(text).not.toContain('pts')
  })

  it('returns null for unranked and no-events chapters, or with nobody to compare against', () => {
    expect(
      heroComparison({ status: 'unranked', rank: null, participationRate: 90 }, [first, second]),
    ).toBeNull()
    expect(
      heroComparison({ status: 'no-events', rank: null, participationRate: null }, [first, second]),
    ).toBeNull()
    expect(heroComparison({ status: 'ranked', rank: 1, participationRate: 40 }, [first])).toBeNull()
  })
})

describe('tiedRates', () => {
  it('collects only rates shared by two or more ranked chapters', () => {
    const rows = [
      row({ chapterId: 'c', chapter: 'Cebu', status: 'ranked', participationRate: 30 }),
      row({ chapterId: 'm', chapter: 'Manila', status: 'ranked', participationRate: 30 }),
      row({ chapterId: 'd', chapter: 'Davao', status: 'ranked', participationRate: 40 }),
      row({ chapterId: 'i', chapter: 'Iloilo', status: 'unranked', participationRate: 30 }),
      row({ chapterId: 'b', chapter: 'Bacolod', status: 'no-events', participationRate: null }),
    ]
    expect(tiedRates(rows)).toEqual(new Set([30]))
  })
})

describe('participationRateDisplay', () => {
  it('renders a defined rate with a percent sign', () => {
    expect(participationRateDisplay({ status: 'ranked', participationRate: 48.4 })).toEqual({
      kind: 'rate',
      text: '48.4%',
    })
    expect(participationRateDisplay({ status: 'unranked', participationRate: 100 })).toEqual({
      kind: 'rate',
      text: '100.0%',
    })
  })

  it('reserves "No events this season" for the no-events status', () => {
    expect(
      participationRateDisplay({ status: 'no-events', participationRate: null }),
    ).toEqual({ kind: 'no-events', text: 'No events this season' })
  })

  it('renders an em dash — never a bare % and never 0% — for events with no eligible members', () => {
    const display = participationRateDisplay({ status: 'unranked', participationRate: null })
    expect(display.kind).toBe('unavailable')
    expect(display.text).toBe('—')
    expect(display.text).not.toContain('%')
  })
})
