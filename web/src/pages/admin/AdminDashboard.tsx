import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UsersGroupRoundedOutline, CalendarOutline, StarOutline, BuildingsOutline, AddCircleOutline, AltArrowUpOutline, AltArrowDownOutline } from 'solar-icon-set'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { apiFetch, publicFetch } from '../../lib/api'
import type { Event } from '@devcon-plus/supabase'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import { EventStatusBadge } from '../../components/EventStatusBadge'
import { formatDate, computeEventStatus } from '../../lib/dates'

interface KpiData {
  totalMembers: number
  totalEvents: number
  xpDistributed: number
  activeChapters: number
}

interface GrowthRow { month: string; count: number }
interface ChapterStat { chapter: string; members: number; xp: number }
interface AttendanceRow { event: string; attendance: number }

type ChapterMetric = 'members' | 'xp'
type RecentEventsFilter = 'devcon' | 'featured' | 'all'
type RecentEventsSortColumn = 'title' | 'chapter' | 'eventDate' | 'created' | 'status'
type SortDir = 'asc' | 'desc'

const RECENT_EVENTS_FILTERS: { id: RecentEventsFilter; label: string }[] = [
  { id: 'devcon', label: 'DEVCON' },
  { id: 'featured', label: 'Community Featured' },
  { id: 'all', label: 'All' },
]

// Same classification rules as the member-facing EventsList chip filter —
// keep in sync with web/src/pages/events/EventsList.tsx.
function matchesRecentEventsFilter(event: Event, filter: RecentEventsFilter): boolean {
  switch (filter) {
    case 'devcon':
      return !event.is_external && (!event.devcon_category || event.devcon_category === 'devcon')
    case 'featured':
      return !!event.is_featured || (!!event.is_external && event.visibility === 'public')
    default:
      return true
  }
}

const KPI_SKELETON = { totalMembers: 0, totalEvents: 0, xpDistributed: 0, activeChapters: 0 }

// Per-bar row height so the chart grows to fit every chapter instead of squashing.
const CHAPTER_BAR_HEIGHT = 30
const CHART_MIN_HEIGHT = 200

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState<KpiData>(KPI_SKELETON)
  const [memberGrowth, setMemberGrowth] = useState<GrowthRow[]>([])
  const [chapterStats, setChapterStats] = useState<ChapterStat[]>([])
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceRow[]>([])
  const [chapterMetric, setChapterMetric] = useState<ChapterMetric>('members')
  const [isLoading, setIsLoading] = useState(true)

  const [recentEvents, setRecentEvents] = useState<Event[]>([])
  const [chapterNames, setChapterNames] = useState<Record<string, string>>({})
  const [recentEventsFilter, setRecentEventsFilter] = useState<RecentEventsFilter>('devcon')
  const [isRecentEventsLoading, setIsRecentEventsLoading] = useState(true)
  const [recentEventsSortColumn, setRecentEventsSortColumn] = useState<RecentEventsSortColumn | null>(null)
  const [recentEventsSortDir, setRecentEventsSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const analytics = await apiFetch<{
          totalMembers: number; totalEvents: number
          xpDistributed: number; activeChapters: number
          memberGrowth: GrowthRow[]; chapterStats: ChapterStat[]
          attendanceTrend: AttendanceRow[]
        }>('/api/admin/analytics')
        setKpis({
          totalMembers:  analytics.totalMembers,
          totalEvents:   analytics.totalEvents,
          xpDistributed: analytics.xpDistributed,
          activeChapters: analytics.activeChapters,
        })
        setMemberGrowth(analytics.memberGrowth)
        setChapterStats(analytics.chapterStats ?? [])
        setAttendanceTrend(analytics.attendanceTrend)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  useEffect(() => {
    const loadRecentEvents = async () => {
      setIsRecentEventsLoading(true)
      try {
        const [eventRows, chapterRows] = await Promise.all([
          publicFetch<Event[]>('/api/events'),
          publicFetch<{ id: string; name: string }[]>('/api/chapters'),
        ])
        setRecentEvents(eventRows)
        setChapterNames(Object.fromEntries(chapterRows.map((c) => [c.id, c.name])))
      } finally {
        setIsRecentEventsLoading(false)
      }
    }
    void loadRecentEvents()
  }, [])

  const recentEventsChapterLabel = (event: Event): string =>
    event.chapter_id === null ? 'HQ — All Chapters' : (chapterNames[event.chapter_id ?? ''] ?? '—')

  const filteredRecentEvents = useMemo(() => {
    const matched = recentEvents.filter((e) => matchesRecentEventsFilter(e, recentEventsFilter))
    return [...matched].sort((a, b) => {
      if (recentEventsSortColumn === null) {
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      }
      const dir = recentEventsSortDir === 'asc' ? 1 : -1
      switch (recentEventsSortColumn) {
        case 'title': return a.title.localeCompare(b.title) * dir
        case 'chapter': return recentEventsChapterLabel(a).localeCompare(recentEventsChapterLabel(b)) * dir
        case 'eventDate': return (new Date(a.event_date ?? 0).getTime() - new Date(b.event_date ?? 0).getTime()) * dir
        case 'created': return (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()) * dir
        case 'status': return computeEventStatus(a).localeCompare(computeEventStatus(b)) * dir
        default: return 0
      }
    })
  }, [recentEvents, recentEventsFilter, recentEventsSortColumn, recentEventsSortDir, chapterNames])

  const { pageItems: recentEventsPage, ...recentEventsPagination } = usePagination(filteredRecentEvents, 10)

  // Click cycles a column: asc → desc → back to default (newest created first).
  const handleRecentEventsSort = (col: RecentEventsSortColumn) => {
    recentEventsPagination.setPage(1)
    if (recentEventsSortColumn !== col) {
      setRecentEventsSortColumn(col)
      setRecentEventsSortDir('asc')
    } else if (recentEventsSortDir === 'asc') {
      setRecentEventsSortDir('desc')
    } else {
      setRecentEventsSortColumn(null)
      setRecentEventsSortDir('asc')
    }
  }

  const recentEventsSortIcon = (col: RecentEventsSortColumn) => {
    if (recentEventsSortColumn !== col) return null
    return recentEventsSortDir === 'asc'
      ? <AltArrowUpOutline color="#1152D4" width={14} height={14} />
      : <AltArrowDownOutline color="#1152D4" width={14} height={14} />
  }

  // "Top Chapters" chart: every chapter, ranked by the toggled metric.
  const topChapters = [...chapterStats].sort((a, b) => b[chapterMetric] - a[chapterMetric])
  // Grow both charts vertically so no chapter label is dropped.
  const chapterChartHeight = Math.max(CHART_MIN_HEIGHT, chapterStats.length * CHAPTER_BAR_HEIGHT)

  const kpiCards = [
    {
      label: 'Total Members',
      value: isLoading ? '—' : kpis.totalMembers.toLocaleString(),
      Icon: UsersGroupRoundedOutline,
      color: 'bg-blue/10 text-blue',
    },
    {
      label: 'Total Events',
      value: isLoading ? '—' : kpis.totalEvents.toLocaleString(),
      Icon: CalendarOutline,
      color: 'bg-green/10 text-green',
    },
    {
      label: 'XP Distributed',
      value: isLoading ? '—' : kpis.xpDistributed >= 1_000_000
        ? `${(kpis.xpDistributed / 1_000_000).toFixed(1)}M`
        : kpis.xpDistributed.toLocaleString(),
      Icon: StarOutline,
      color: 'bg-gold/10 text-gold',
    },
    {
      label: 'Active Chapters',
      value: isLoading ? '—' : kpis.activeChapters.toLocaleString(),
      Icon: BuildingsOutline,
      color: 'bg-promoted/10 text-promoted',
    },
  ]

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Admin Dashboard</h1>
          <p className="text-md3-body-md text-slate-500">Platform overview for DEVCON+</p>
        </div>
        <button
          onClick={() => navigate('/admin/events', { state: { openCreate: true } })}
          className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark active:scale-95 transition-colors shrink-0"
        >
          <AddCircleOutline className="w-5 h-5" />
          <span className="hidden sm:inline">Create Event</span>
        </button>
      </div>

      {/* Row 1 — KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className={`text-md3-headline-sm font-black ${isLoading ? 'text-slate-300' : 'text-slate-900'}`}>{value}</p>
            <p className="text-md3-label-md text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Row 2 — Member Growth Area Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card mt-4">
        <p className="text-md3-body-lg font-bold text-slate-900 mb-4">Member Growth</p>
        {isLoading || memberGrowth.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-slate-400 text-md3-body-md">
            {isLoading ? 'Loading…' : 'No data yet'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={memberGrowth}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area dataKey="count" fill="#1152D4" stroke="#0D42AA" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 3 — Top Chapters (toggle: Members / XP) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card mt-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-md3-body-lg font-bold text-slate-900">Top Chapters</p>
          {/* Segmented toggle — admin surface uses blue (non-themed) */}
          <div className="flex gap-1.5 shrink-0">
            {([
              { key: 'members', label: 'Members' },
              { key: 'xp',      label: 'XP'      },
            ] as const).map(({ key, label }) => {
              const active = chapterMetric === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChapterMetric(key)}
                  className={`px-3.5 py-1.5 rounded-full border text-md3-label-md font-semibold transition-colors ${
                    active
                      ? 'bg-blue text-white border-blue shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        {isLoading || topChapters.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-slate-400 text-md3-body-md">
            {isLoading ? 'Loading…' : 'No data yet'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chapterChartHeight}>
            <BarChart data={topChapters} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis dataKey="chapter" type="category" tick={{ fontSize: 11 }} width={96} interval={0} />
              <Tooltip formatter={(v) => [Number(v).toLocaleString(), chapterMetric === 'members' ? 'Members' : 'XP']} />
              <Bar
                dataKey={chapterMetric}
                fill={chapterMetric === 'members' ? '#1152D4' : '#F8C630'}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 4 — Event Attendance Trend Line Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card mt-4">
        <p className="text-md3-body-lg font-bold text-slate-900 mb-4">Event Attendance Trend</p>
        {isLoading || attendanceTrend.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-slate-400 text-md3-body-md">
            {isLoading ? 'Loading…' : 'No completed events yet'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={attendanceTrend}>
              <XAxis dataKey="event" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line dataKey="attendance" stroke="#1152D4" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 5 — Recent Events (toggle: DEVCON / Community Featured / All) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
          <p className="text-md3-body-lg font-bold text-slate-900">Recent Events</p>
          <div className="flex gap-1.5 shrink-0">
            {RECENT_EVENTS_FILTERS.map(({ id, label }) => {
              const active = recentEventsFilter === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setRecentEventsFilter(id)
                    recentEventsPagination.setPage(1)
                  }}
                  className={`px-3.5 py-1.5 rounded-full border text-md3-label-md font-semibold transition-colors ${
                    active
                      ? 'bg-blue text-white border-blue shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {isRecentEventsLoading ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400 text-md3-body-md">Loading…</div>
        ) : recentEventsPage.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-slate-400 text-md3-body-md">No events found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-t border-slate-100 text-md3-label-md text-slate-500">
                  <th className="px-5 py-2.5 font-semibold">
                    <button type="button" onClick={() => handleRecentEventsSort('title')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
                      Event {recentEventsSortIcon('title')}
                    </button>
                  </th>
                  <th className="px-5 py-2.5 font-semibold">
                    <button type="button" onClick={() => handleRecentEventsSort('chapter')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
                      Chapter {recentEventsSortIcon('chapter')}
                    </button>
                  </th>
                  <th className="px-5 py-2.5 font-semibold">
                    <button type="button" onClick={() => handleRecentEventsSort('eventDate')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
                      Event Date {recentEventsSortIcon('eventDate')}
                    </button>
                  </th>
                  <th className="px-5 py-2.5 font-semibold">
                    <button type="button" onClick={() => handleRecentEventsSort('created')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
                      Created {recentEventsSortIcon('created')}
                    </button>
                  </th>
                  <th className="px-5 py-2.5 font-semibold">
                    <button type="button" onClick={() => handleRecentEventsSort('status')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
                      Status {recentEventsSortIcon('status')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentEventsPage.map((event) => (
                  <tr key={event.id} className="border-t border-slate-100">
                    <td className="px-5 py-3 text-md3-body-md font-semibold text-slate-900 max-w-[240px] truncate">{event.title}</td>
                    <td className="px-5 py-3 text-md3-body-md text-slate-500">{recentEventsChapterLabel(event)}</td>
                    <td className="px-5 py-3 text-md3-body-md text-slate-500">{event.event_date ? formatDate.short(event.event_date) : '—'}</td>
                    <td className="px-5 py-3 text-md3-body-md text-slate-500">{event.created_at ? formatDate.short(event.created_at) : '—'}</td>
                    <td className="px-5 py-3"><EventStatusBadge status={computeEventStatus(event)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination controller={recentEventsPagination} itemLabel="event" className="border-t border-slate-100" />
      </div>
    </div>
  )
}
