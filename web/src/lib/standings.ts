import type { ChapterStanding } from '../stores/useChapterStandingStore'

/**
 * Heading for the chapter points-total column. Chosen once by the owner in
 * ticket 01 with a read-only database check: the 24 June reset never ran
 * (zero `reset` ledger rows since the 2026 reset moment), so the lifetime
 * column was never zeroed and the honest label is "Lifetime points". If a
 * future reset runs, flip this one line to "Total points (since 24 June)".
 */
export const POINTS_TOTAL_LABEL = 'Lifetime points'

/** A rate is always shown to one decimal place, so a tie reads the same in every pill. */
export function formatRate(rate: number): string {
  return `${rate.toFixed(1)}%`
}

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
    return { kind: 'rate', text: formatRate(standing.participationRate) }
  }
  if (standing.status === 'no-events') {
    return { kind: 'no-events', text: 'No events this season' }
  }
  return { kind: 'unavailable', text: '—' }
}

/** Manila is UTC+8 year-round (no DST) — mirrors getPointsExpiry in dates.ts. */
const PH_OFFSET_MS = 8 * 3_600_000

/**
 * Season name derived from the 24 June boundaries, never hard-coded: a season
 * runs from one 24 June 00:00 Philippine time to the next and is named by the
 * two years it spans, e.g. "Season 2026–27".
 */
export function seasonLabel(now: Date = new Date()): string {
  const phYear = new Date(now.getTime() + PH_OFFSET_MS).getUTCFullYear()
  const startYear =
    now.getTime() >= Date.UTC(phYear, 5, 24) - PH_OFFSET_MS ? phYear : phYear - 1
  return `Season ${startYear}–${String(startYear + 1).slice(2)}`
}

/**
 * Officer's hero comparison line, in the same unit as the ranking — never
 * "pts", which names the points columns. Null when the chapter is unranked,
 * has no events, or the board has no chapter to compare against.
 */
export function heroComparison(
  own: Pick<ChapterStanding, 'status' | 'rank' | 'participationRate'>,
  standings: Pick<ChapterStanding, 'rank' | 'participationRate'>[],
): string | null {
  if (own.status !== 'ranked' || own.rank === null || own.participationRate === null) {
    return null
  }
  if (own.rank === 1) {
    const second = standings.find((s) => s.rank === 2)
    if (!second || second.participationRate === null) return null
    return `Ahead of 2nd: ${formatRate(own.participationRate)} vs ${formatRate(second.participationRate)}`
  }
  const first = standings.find((s) => s.rank === 1)
  if (!first || first.participationRate === null) return null
  return `Behind 1st: ${formatRate(own.participationRate)} vs ${formatRate(first.participationRate)}`
}

/**
 * Participation rates shared by two or more ranked chapters. Those rows carry
 * a "tied at … · A–Z" pill, since the server breaks ties alphabetically.
 */
export function tiedRates(
  standings: Pick<ChapterStanding, 'status' | 'participationRate'>[],
): Set<number> {
  const counts = new Map<number, number>()
  for (const s of standings) {
    if (s.status !== 'ranked' || s.participationRate === null) continue
    counts.set(s.participationRate, (counts.get(s.participationRate) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([rate]) => rate))
}
