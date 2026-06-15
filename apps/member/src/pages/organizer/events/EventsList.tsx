import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPointOutline, BoltOutline, ClockCircleOutline, AddCircleOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useEventsStore } from '../../../stores/useEventsStore'
import { useAuthStore } from '../../../stores/useAuthStore'
import { EventStatusBadge } from '../../../components/EventStatusBadge'
import { staggerContainer, cardItem, fadeUp } from '../../../lib/animation'
import { isEventArchived } from '../../../lib/dates'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export function OrgEventsList() {
  const navigate = useNavigate()
  const { events, fetchEvents } = useEventsStore()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming')

  const isAdmin = user?.role === 'hq_admin' || user?.role === 'super_admin'
  const chapterEvents  = isAdmin
    ? events
    : events.filter((e) => e.chapter_id === (user?.chapter_id ?? null))
  const upcomingEvents = chapterEvents.filter((e) => !isEventArchived(e))
  const pastEvents     = chapterEvents.filter((e) => isEventArchived(e))
  const displayEvents  = activeTab === 'upcoming' ? upcomingEvents : pastEvents

  useEffect(() => { void fetchEvents() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="relative z-10 flex items-center justify-between px-4 pt-6">
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              Manage Events
            </h1>

            <button
              onClick={() => navigate('/organizer/events/create')}
              className="flex items-center gap-2 bg-white/25 border border-white/50 px-3.5 py-2 rounded-full text-white text-md3-body-md font-bold font-proxima active:bg-white/40 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.35)]"
            >
              <AddCircleOutline className="w-[18px] h-[18px]" color="white" />
              New Event
            </button>
          </div>
        </div>
      </header>

      <motion.div
        className="px-4 pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-24"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Upcoming / Past tabs */}
        <motion.div variants={fadeUp} className="bg-[#eef4ff] inline-flex self-start items-center p-1 rounded-full mb-2">
          {(['upcoming', 'past'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center justify-center px-5 py-1.5 rounded-full transition-all duration-300 ${
                activeTab === tab 
                  ? 'bg-[#1152d4] text-white shadow-sm' 
                  : 'text-black hover:bg-[#dbeafe]/50'
              }`}
            >
              <span className="font-proxima font-bold text-[16px] capitalize">
                {tab} ({tab === 'upcoming' ? upcomingEvents.length : pastEvents.length})
              </span>
            </button>
          ))}
        </motion.div>

        {displayEvents.map((event) => {
          const dateParts = event.event_date ? {
            month: new Date(event.event_date).toLocaleDateString('en-PH', { month: 'short' }).toUpperCase(),
            day: String(new Date(event.event_date).getDate()),
          } : null

          return (
            <motion.button
              key={event.id}
              variants={cardItem}
              className="w-full bg-white border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] rounded-[16px] p-3 flex items-center gap-4 text-left"
              onClick={() => navigate(
                isEventArchived(event)
                  ? `/organizer/events/${event.id}/summary`
                  : `/organizer/events/${event.id}`
              )}
              whileTap={{ scale: 0.98 }}
            >
              {/* Left Side: Image or Date Placeholder */}
              <div className="size-[72px] bg-slate-100 rounded-[12px] overflow-hidden shrink-0 relative">
                {event.cover_image_url ? (
                  <>
                    <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
                    {dateParts && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                        <span className="text-[10px] font-bold leading-none text-white/90 uppercase drop-shadow-sm">
                          {dateParts.month}
                        </span>
                        <span className="text-md3-title-lg font-black leading-tight text-white drop-shadow-md">
                          {dateParts.day}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-blue/10">
                    {dateParts ? (
                      <>
                        <span className="text-[10px] font-bold leading-none text-blue/60 uppercase">
                          {dateParts.month}
                        </span>
                        <span className="text-md3-headline-sm font-black leading-tight text-blue">
                          {dateParts.day}
                        </span>
                      </>
                    ) : (
                      <ClockCircleOutline className="size-8 text-blue/40" />
                    )}
                  </div>
                )}
              </div>

              {/* Right Side: Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <p className="font-proxima font-bold text-[14px] text-slate-900 leading-tight truncate">
                    {event.title}
                  </p>
                  {!isEventArchived(event) && <EventStatusBadge status={event.status} />}
                </div>

                <p className="text-[11px] text-slate-500 mb-0.5">
                  {event.event_date ? new Date(event.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No date set'}
                </p>

                {event.location && (
                  <p className="text-[11px] text-slate-400 truncate mb-1.5 flex items-center gap-1">
                    <MapPointOutline className="w-2.5 h-2.5" color="#94A3B8" />
                    {event.location}
                  </p>
                )}

                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-blue bg-blue/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <BoltOutline className="w-2.5 h-2.5" color="#1152d4" />
                    {event.points_value} XP
                  </span>
                  {isEventArchived(event) && (
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      Archived
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          )
        })}
      </motion.div>
    </div>
  )
}
