import { useEffect, useState } from 'react'
import { UsersGroupRoundedOutline, CalendarOutline, StarOutline, BuildingsOutline } from 'solar-icon-set'
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
import { supabase } from '../../lib/supabase'

interface KpiData {
  totalMembers: number
  totalEvents: number
  xpDistributed: number
  activeChapters: number
}

interface GrowthRow { month: string; count: number }
interface XpRow { chapter: string; xp: number }
interface AttendanceRow { event: string; attendance: number }

const KPI_SKELETON = { totalMembers: 0, totalEvents: 0, xpDistributed: 0, activeChapters: 0 }

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<KpiData>(KPI_SKELETON)
  const [memberGrowth, setMemberGrowth] = useState<GrowthRow[]>([])
  const [xpByChapter, setXpByChapter] = useState<XpRow[]>([])
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      const [
        membersRes,
        eventsRes,
        xpRes,
        chaptersRes,
        growthRes,
        xpChapterRes,
        attendanceRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.rpc('get_total_xp_distributed'),
        supabase.rpc('get_active_chapters_count'),
        supabase.rpc('get_member_growth'),
        supabase.rpc('get_xp_by_chapter'),
        supabase.rpc('get_attendance_trend'),
      ])

      setKpis({
        totalMembers: membersRes.count ?? 0,
        totalEvents: eventsRes.count ?? 0,
        xpDistributed: (xpRes.data as number) ?? 0,
        activeChapters: (chaptersRes.data as number) ?? 0,
      })
      setMemberGrowth((growthRes.data as GrowthRow[]) ?? [])
      setXpByChapter((xpChapterRes.data as XpRow[]) ?? [])
      setAttendanceTrend((attendanceRes.data as AttendanceRow[]) ?? [])
      setIsLoading(false)
    }
    void load()
  }, [])

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
    <div className="p-8">
      <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Admin Dashboard</h1>
      <p className="text-md3-body-md text-slate-500 mb-6">Platform overview for DEVCON+</p>

      {/* Row 1 — KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
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

      {/* Row 3 — XP by Chapter Horizontal Bar Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card mt-4">
        <p className="text-md3-body-lg font-bold text-slate-900 mb-4">XP by Chapter</p>
        {isLoading || xpByChapter.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-slate-400 text-md3-body-md">
            {isLoading ? 'Loading…' : 'No data yet'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={xpByChapter} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="chapter" type="category" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v) => [Number(v).toLocaleString(), 'XP']} />
              <Bar dataKey="xp" fill="#F8C630" radius={[0, 4, 4, 0]} />
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
    </div>
  )
}
