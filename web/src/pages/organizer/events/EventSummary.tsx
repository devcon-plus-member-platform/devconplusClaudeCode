import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftOutline, PenOutline, ClipboardListOutline, MapPointOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useEventsStore } from '../../../stores/useEventsStore'
import { ApprovalCard, type Registration } from '../../../components/ApprovalCard'
import { fadeUp, staggerContainer, cardItem } from '../../../lib/animation'

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export function OrgEventSummary() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { events, fetchEvents } = useEventsStore()

  const [registrants, setRegistrants] = useState<Registration[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [filter, setFilter]           = useState<FilterStatus>('all')
  
  const event = events.find((e) => e.id === id)

  const dateStr = event?.event_date
    ? new Date(event.event_date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'Date TBA'

  // Guard: load events if store is empty
  useEffect(() => {
    if (events.length === 0) void fetchEvents()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch registrants — re-runs if id or event title changes
  useEffect(() => {
    if (!id) return
    setIsLoading(true)
    supabase
      .from('event_registrations')
      .select('id, status, registered_at, checked_in, profiles(full_name, email, school_or_company)')
      .eq('event_id', id)
      .neq('status', 'cancelled')
      .then(({ data }) => {
        const mapped: Registration[] = (data ?? []).map((row) => {
          const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
          const p = profile as { full_name?: string; email?: string; school_or_company?: string } | null
          return {
            id:                row.id,
            member_name:       p?.full_name ?? 'Unknown',
            member_email:      p?.email ?? '',
            school_or_company: p?.school_or_company ?? '',
            event_title:       event?.title ?? '',
            registered_at:     row.registered_at ?? '',
            status:            row.status as Registration['status'],
            checked_in:        (row.checked_in as boolean | null) ?? false,
          }
        })
        setRegistrants(mapped)
        setIsLoading(false)
      })
  }, [id, event?.title]) // eslint-disable-line react-hooks/exhaustive-deps

  // Not-found fallback
  if (!event) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">Event not found.</p>
      </div>
    )
  }

  // Funnel counts
  const funnel = {
    total:    registrants.length,
    checkedIn: registrants.filter((r) => r.checked_in).length,
    approved: registrants.filter((r) => r.status === 'approved').length,
    pending:  registrants.filter((r) => r.status === 'pending').length,
    rejected: registrants.filter((r) => r.status === 'rejected').length,
  }

  const counts: Record<FilterStatus, number> = {
    all:      registrants.length,
    approved: funnel.approved,
    pending:  funnel.pending,
    rejected: funnel.rejected,
  }

  const filtered = filter === 'all' ? registrants : registrants.filter((r) => r.status === filter)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-[#1152d4] relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Icons */}
          <div className="relative z-10 px-4 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
              >
                <ArrowLeftOutline className="w-5 h-5" color="white" />
              </button>
              <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
                Event Summary
              </h1>
            </div>
            <button
              onClick={() => navigate(`/organizer/events/${id}/edit`)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >
              <PenOutline className="w-4 h-4" color="white" />
            </button>
          </div>
        </div>
      </header>

      <motion.div
        className="p-4 pb-24"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* ── Event Info (Styled like EventDetail) ── */}
        <motion.div variants={fadeUp} className="mb-6 px-1">
          <p className="text-md3-label-md text-slate-400 mb-1">{dateStr}</p>
          <h2 className="text-md3-title-lg font-bold text-slate-900 leading-tight">
            {event.title}
          </h2>
          {event.location && (
            <p className="text-md3-body-md text-slate-500 mt-1.5 flex items-center gap-1.5">
              <MapPointOutline className="w-3.5 h-3.5 shrink-0" />
              {event.location}
            </p>
          )}
        </motion.div>

        {/* ── Funnel Stats ── */}
        <motion.div variants={fadeUp} className="mb-6 space-y-3">
          {/* Row 1: Total Registered + Checked In */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Registered', value: funnel.total,    color: 'text-blue' },
              { label: 'Checked In',       value: funnel.checkedIn, color: 'text-green' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className={`text-md3-headline-sm font-black ${color}`}>{value}</p>
                <p className="text-md3-label-md text-slate-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
          {/* Row 2: Approved + Pending + Rejected */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Approved', value: funnel.approved, color: 'text-blue' },
              { label: 'Pending',  value: funnel.pending,  color: 'text-yellow-500' },
              { label: 'Rejected', value: funnel.rejected, color: 'text-red' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className={`text-md3-headline-sm font-black ${color}`}>{value}</p>
                <p className="text-md3-label-md text-slate-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Filter tabs ── */}
        <motion.div variants={fadeUp} className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-5">
          {(['all', 'pending', 'approved', 'rejected'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-md3-body-md font-semibold transition-colors capitalize ${
                filter === f
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </motion.div>

        {/* ── Attendee list ── */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-32" />
                    <div className="h-3 bg-slate-100 rounded w-48" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="bg-white rounded-2xl border border-slate-200 p-12 text-center"
              >
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <ClipboardListOutline className="w-7 h-7" color="#94A3B8" />
                </div>
                <p className="text-md3-body-lg font-bold text-slate-700">No registrants found</p>
                <p className="text-md3-body-md text-slate-400 mt-1">
                  {filter === 'all' ? 'No one registered for this event.' : `No ${filter} registrations.`}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={filter}
                className="space-y-3"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                {filtered.map((reg) => (
                  <motion.div key={reg.id} variants={cardItem}>
                    <ApprovalCard registration={reg} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>

    </div>
  )
}
