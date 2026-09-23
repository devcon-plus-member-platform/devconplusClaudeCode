import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ChapterStandingsTable from './ChapterStandingsTable'
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
  totalPoints: 2500,
  computedAt: '2026-09-18T00:00:00.000Z',
}

function row(overrides: Partial<ChapterStanding> & { chapterId: string; chapter: string }): ChapterStanding {
  return { ...base, ...overrides }
}

const standings: ChapterStanding[] = [
  row({ chapterId: 'chapter-cebu', chapter: 'Cebu', region: 'Visayas', rank: 1, status: 'ranked', participationRate: 90, totalPoints: 9000, xp: 800 }),
  row({ chapterId: 'chapter-manila', chapter: 'Manila', region: 'Luzon', rank: 2, status: 'ranked', participationRate: 70, totalPoints: 5000, xp: 400 }),
  row({ chapterId: 'chapter-bacolod', chapter: 'Bacolod', region: 'Visayas', rank: 3, status: 'ranked', participationRate: 70, totalPoints: 1200, xp: 100 }),
  row({ chapterId: 'chapter-davao', chapter: 'Davao', region: 'Mindanao', rank: null, status: 'unranked', participationRate: 95, totalPoints: 300, xp: 50 }),
  row({ chapterId: 'chapter-iloilo', chapter: 'Iloilo', region: 'Visayas', rank: null, status: 'no-events', participationRate: null, eligibleMembers: 0, participants: 0, events: 0, checkIns: 0, avgPerEvent: 0, approvedRegistrations: 0, showUpRate: null, newMembers: 2, totalPoints: 0, xp: 0 }),
]

function chapterOrder(): string[] {
  const rows = document.querySelectorAll('tbody tr')
  return [...rows].map((tr) => {
    const cells = tr.querySelectorAll('td')
    // Chapter is the second column; strip the "Your chapter" pill text.
    return (cells[1]?.textContent ?? '').replace('Your chapter', '').trim()
  })
}

describe('ChapterStandingsTable', () => {
  it('renders all 13 column headings in the mockup order with the honest labels', () => {
    render(<ChapterStandingsTable standings={standings} />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
    expect(headers).toEqual([
      '#',
      'Chapter',
      'Region',
      'Participation rate',
      'Lifetime points',
      'Eligible members',
      'Checked in',
      'Events',
      'Total check-ins',
      'Avg per event',
      'Show-up rate',
      'New members',
      'Points earned this season',
    ])
  })

  it('never names the points columns XP', () => {
    render(<ChapterStandingsTable standings={standings} />)
    expect(screen.queryByText(/XP/)).toBeNull()
  })

  it('defaults to the server ranking: ranked by rate first, then unranked, then no-events', () => {
    render(<ChapterStandingsTable standings={standings} />)
    // Manila and Bacolod tie at 70% — the server breaks ties alphabetically.
    expect(chapterOrder()).toEqual(['Cebu', 'Bacolod', 'Manila', 'Davao', 'Iloilo'])
  })

  it('reorders rows when a sortable heading is clicked', () => {
    render(<ChapterStandingsTable standings={standings} />)
    fireEvent.click(screen.getByText('Chapter'))
    expect(chapterOrder()).toEqual(['Bacolod', 'Cebu', 'Davao', 'Iloilo', 'Manila'])
  })

  it('does not reorder rows when either points heading is clicked', () => {
    render(<ChapterStandingsTable standings={standings} />)
    const before = chapterOrder()
    fireEvent.click(screen.getByText('Lifetime points'))
    expect(chapterOrder()).toEqual(before)
    fireEvent.click(screen.getByText('Points earned this season'))
    expect(chapterOrder()).toEqual(before)
  })

  it('marks the officer chapter, unranked chapters, ties and event-less chapters', () => {
    render(<ChapterStandingsTable standings={standings} yourChapterId="chapter-manila" />)
    expect(screen.getByText('Your chapter')).toBeInTheDocument()
    expect(screen.getByText('Unranked')).toBeInTheDocument()
    expect(screen.getByText('No events this season')).toBeInTheDocument()
    // Manila and Bacolod share 70%: both rows explain the alphabetical order.
    const ties = screen.getAllByText('tied at 70.0% · A–Z')
    expect(ties).toHaveLength(2)
  })

  it('shows the swipe hint for narrow screens', () => {
    render(<ChapterStandingsTable standings={standings} />)
    expect(screen.getByText('Swipe the table to see more columns')).toBeInTheDocument()
  })

  it('renders one row per chapter', () => {
    render(<ChapterStandingsTable standings={standings} />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(standings.length + 1)
  })
})
