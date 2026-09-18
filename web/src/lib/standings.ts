import type { ChapterStanding } from '../stores/useChapterStandingStore'

export type StandingSortColumn =
  | 'chapter'
  | 'region'
  | 'participationRate'
  | 'eligibleMembers'
  | 'participants'
  | 'events'
  | 'checkIns'
  | 'avgPerEvent'
  | 'showUpRate'
  | 'newMembers'
  | 'xp'

export type StandingSortDir = 'asc' | 'desc'

/** Ranked chapters hold positions; unranked ones carry a rate but no position; */
/** chapters with no events this season have no rate at all. */
function statusOrder(status: ChapterStanding['status']): number {
  switch (status) {
    case 'ranked': return 0
    case 'unranked': return 1
    case 'no-events': return 2
  }
}

function compareNumbers(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a - b) * dir
}

export function sortStandings(
  rows: ChapterStanding[],
  column: StandingSortColumn,
  dir: StandingSortDir,
): ChapterStanding[] {
  const d = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    // Participation rate keeps the server's group order (ranked, then
    // unranked, then no events this season) in both directions, so the
    // default view is the same ranking officers see — an unranked chapter
    // never interleaves with ranked chapters however high its rate.
    if (column === 'participationRate') {
      return (
        statusOrder(a.status) - statusOrder(b.status) ||
        compareNumbers(a.participationRate, b.participationRate, d) ||
        a.chapter.localeCompare(b.chapter)
      )
    }
    switch (column) {
      case 'chapter': return a.chapter.localeCompare(b.chapter) * d
      case 'region': return (a.region ?? '').localeCompare(b.region ?? '') * d || a.chapter.localeCompare(b.chapter)
      case 'eligibleMembers': return (a.eligibleMembers - b.eligibleMembers) * d || a.chapter.localeCompare(b.chapter)
      case 'participants': return (a.participants - b.participants) * d || a.chapter.localeCompare(b.chapter)
      case 'events': return (a.events - b.events) * d || a.chapter.localeCompare(b.chapter)
      case 'checkIns': return (a.checkIns - b.checkIns) * d || a.chapter.localeCompare(b.chapter)
      case 'avgPerEvent': return (a.avgPerEvent - b.avgPerEvent) * d || a.chapter.localeCompare(b.chapter)
      case 'showUpRate': return compareNumbers(a.showUpRate, b.showUpRate, d) || a.chapter.localeCompare(b.chapter)
      case 'newMembers': return (a.newMembers - b.newMembers) * d || a.chapter.localeCompare(b.chapter)
      case 'xp': return (a.xp - b.xp) * d || a.chapter.localeCompare(b.chapter)
    }
  })
}

export type ParticipationRateDisplay =
  | { kind: 'rate'; text: string }
  | { kind: 'no-events'; text: string }
  | { kind: 'unavailable'; text: string }

/**
 * Single shared decision for rendering a participation rate, used by both the
 * officer My Chapter headline and the HQ table cell. Gates on the value, not
 * the status: a null rate with events but no eligible members is an em dash,
 * never a bare "%" — the wording "no events this season" is reserved for a
 * chapter that held nothing.
 */
export function participationRateDisplay(
  standing: Pick<ChapterStanding, 'status' | 'participationRate'>,
): ParticipationRateDisplay {
  if (standing.participationRate !== null) {
    return { kind: 'rate', text: `${standing.participationRate}%` }
  }
  if (standing.status === 'no-events') {
    return { kind: 'no-events', text: 'No events this season' }
  }
  return { kind: 'unavailable', text: '—' }
}
