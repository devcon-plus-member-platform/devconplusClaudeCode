import { describe, expect, it } from 'vitest'
import { sortStandings } from './AdminStandings'
import type { ChapterStanding } from '../../stores/useChapterStandingStore'

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
