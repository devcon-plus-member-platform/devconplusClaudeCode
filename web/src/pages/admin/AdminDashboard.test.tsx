import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminDashboard from './AdminDashboard'
import { useAuthStore } from '../../stores/useAuthStore'
import { useChapterStandingStore, type ChapterStanding } from '../../stores/useChapterStandingStore'
import { useRewardsStore } from '../../stores/useRewardsStore'

const apiFetch = vi.fn()
const publicFetch = vi.fn()

vi.mock('../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  publicFetch: (...args: unknown[]) => publicFetch(...args),
}))

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

const board: ChapterStanding[] = [
  { ...base, chapterId: 'chapter-cebu', chapter: 'Cebu', rank: 1, participationRate: 40 },
  { ...base, chapterId: 'chapter-manila', chapter: 'Manila', rank: 2, participationRate: 34 },
]

function setUser(role: string) {
  useAuthStore.setState({
    user: {
      id: 'u-1',
      role,
      username: 'tester',
      chapter_id: 'chapter-manila',
      full_name: 'Test User',
      email: 'test@example.com',
    } as unknown as never,
  } as never)
}

beforeEach(() => {
  apiFetch.mockImplementation(async (url: unknown) => {
    if (url === '/api/admin/analytics') {
      return {
        totalMembers: 10,
        totalEvents: 2,
        xpDistributed: 100,
        activeChapters: 3,
        memberGrowth: [],
        chapterStats: [],
        attendanceTrend: [],
      }
    }
    if (url === '/api/chapters/standings') {
      return { standings: board, computedAt: '2026-09-23T00:00:00.000Z' }
    }
    if (url === '/api/rewards/redemptions') return []
    throw new Error(`unexpected apiFetch ${String(url)}`)
  })
  publicFetch.mockResolvedValue([])
})

afterEach(() => {
  useAuthStore.setState({ user: null } as never)
  useChapterStandingStore.getState().reset()
  useRewardsStore.setState({ allRedemptions: [], isLoadingClaims: false })
  vi.clearAllMocks()
})

function apiUrls(): string[] {
  return apiFetch.mock.calls.map((call) => String(call[0]))
}

describe('AdminDashboard', () => {
  it('shows HQ the full dashboard with its admin shortcuts', async () => {
    setUser('hq_admin')
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Recent Events')).toBeInTheDocument()
    expect(screen.getByText('Rewards Claims')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chapter Standings' })).toBeInTheDocument()
    expect(screen.getByText('Create Event')).toBeInTheDocument()
    expect(screen.getByText('View All')).toBeInTheDocument()

    const urls = apiUrls()
    expect(urls).toContain('/api/admin/analytics')
    expect(urls).toContain('/api/chapters/standings')
    expect(urls).toContain('/api/rewards/redemptions')
  })

  it('gives officers the same data read-only, without the admin shortcuts', async () => {
    setUser('chapter_officer')
    render(
      <MemoryRouter>
        <AdminDashboard readOnly />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Recent Events')).toBeInTheDocument()
    expect(screen.getByText('Rewards Claims')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chapter Standings' })).toBeInTheDocument()
    expect(screen.queryByText('Create Event')).toBeNull()
    expect(screen.queryByText('View All')).toBeNull()

    const urls = apiUrls()
    expect(urls).toContain('/api/admin/analytics')
    expect(urls).toContain('/api/rewards/redemptions')
  })
})
