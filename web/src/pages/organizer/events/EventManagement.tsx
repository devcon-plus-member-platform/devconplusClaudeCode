import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPointOutline, BoltOutline, ClockCircleOutline, AddCircleOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import type { Event } from '@devcon-plus/supabase'
import { useEventsStore } from '../../../stores/useEventsStore'
import { useAuthStore } from '../../../stores/useAuthStore'
import { StatusBadge } from '../../../components/StatusBadge'
import { staggerContainer, cardItem, fadeUp } from '../../../lib/animation'
import { isEventArchived } from '../../../lib/dates'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export function OrgEventManagement() {
  const navigate = useNavigate()
  const { events, fetchEvents } = useEventsStore()
  const { user } = useAuthStore()

  useEffect(() => { void fetchEvents() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const chapterEvents = events.filter((e) => e.chapter_id === (user?.chapter_id ?? null))
  const pastEvents     = chapterEvents.filter((e) => isEventArchived(e))
  const upcomingEvents = chapterEvents.filter((e) => !isEventArchived(e))
  const currentEvent   = upcomingEvents.find((e) => e.is_featured) ?? upcomingEvents[0]

  return (
    <div>
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-[#1152d4] relative z-0 pointer-events-auto pb-[24px]"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Icons */}
          <div className="relative z-10 flex items-center justify-between px-4 pt-6 pb-4">
            <h1 className="text-white text-[28px] font-semibold font-proxima leading-none tracking-tight">
              Events
            </h1>
            
            <button
              onClick={() => navigate('/organizer/events/create')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white/20 backdrop-blur-md border border-white/40 text-white text-md3-body-md font-bold rounded-full active:bg-white/40 transition-colors shadow-lg shrink-0"
            >
              <AddCircleOutline className="w-4 h-4" />
              New Event
            </button>
          </div>
        </div>
      </header>

      <motion.div
        className="p-4 space-y-6"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <motion.div variants={fadeUp} className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <p className="font-proxima font-bold text-[18px] text-black">
                Upcoming Events
              </p>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-full">
                {upcomingEvents.length} Total
              </span>
            </div>

            {/* Featured current event - Hero Style */}
            {currentEvent && (
              <motion.div
                variants={cardItem}
                className="w-full h-[240px] bg-slate-900 rounded-[24px] shadow-card text-left relative overflow-hidden group cursor-pointer"
                onClick={() => navigate(`/organizer/events/${currentEvent.id}`)}
                whileTap={{ scale: 0.97 }}
              >
                {/* Background Image with Overlay */}
                <div className="absolute inset-0 z-0">
                  {currentEvent.cover_image_url ? (
                    <img
                      src={currentEvent.cover_image_url}
                      alt={currentEvent.title}
                      className="w-full h-full object-cover opacity-60"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#1152d4] opacity-40" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                </div>

                {/* Content Overlay */}
                <div className="relative z-10 h-full flex flex-col justify-between p-5 pt-6">
                  <div className="space-y-3">
                    <div className="flex">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/90 bg-white/20 px-2.5 py-1 rounded-full backdrop-blur-sm border border-white/10">
                        Current Event
                      </span>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="font-proxima font-bold text-white text-md3-title-lg leading-tight line-clamp-2">
                        {currentEvent.title}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <MapPointOutline className="w-3.5 h-3.5" color="white" />
                        <p className="font-proxima text-white/70 text-[12px] uppercase tracking-wide truncate">
                          {currentEvent.location ?? 'TBA'}
                        </p>
                      </div>
                      </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                      <div className="bg-[#1152d4] text-white text-[12px] font-bold px-[18px] py-[10px] rounded-full flex items-center justify-center shrink-0 leading-none shadow-lg">
                      Manage Event
                      </div>

                      <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5">
                      <BoltOutline className="w-3.5 h-3.5" color="#F8C630" />
                      <span className="text-white font-bold text-[12px]">{currentEvent.points_value} XP</span>
                      </div>
                      </div>
                </div>
              </motion.div>
            )}

            {/* Remaining upcoming events */}
            <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
              {upcomingEvents
                .filter((e) => e.id !== currentEvent?.id)
                .map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onTap={() => navigate(`/organizer/events/${event.id}`)}
                  />
                ))}
            </motion.div>
          </motion.div>
        )}

        {/* Past events */}
        {pastEvents.length > 0 && (
          <motion.div variants={fadeUp} className="space-y-4 pt-2">
            <div className="flex items-center justify-between px-1">
              <p className="font-proxima font-bold text-[18px] text-black">
                Past Events
              </p>
            </div>
            <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
              {pastEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onTap={() => navigate(`/organizer/events/${event.id}/summary`)}
                />
              ))}
            </motion.div>
          </motion.div>
        )}

        {pastEvents.length === 0 && upcomingEvents.length === 0 && (
          <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-md3-body-lg font-bold text-slate-700">No events yet</p>
            <p className="text-md3-body-md text-slate-400 mt-1">Create your first chapter event.</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

function formatEventDate(iso: string): { month: string; day: string } {
  const d = new Date(iso)
  return {
    month: d.toLocaleDateString('en-PH', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  }
}

// ─── Event row sub-component ───────────────────────────────────────────────────

interface EventRowProps {
  event: Event
  onTap: () => void
}

function EventRow({ event, onTap }: EventRowProps) {
  const dateParts = event.event_date ? formatEventDate(event.event_date) : null
  const isExpired = isEventArchived(event)

  return (
    <motion.button
      variants={cardItem}
      onClick={onTap}
      whileTap={{ scale: 0.98 }}
      className={`w-full bg-white border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] rounded-[16px] p-3 flex items-center gap-4 text-left ${
        isExpired ? 'opacity-60 grayscale' : ''
      }`}
    >
      {/* Left Side: Image or Date Placeholder */}
      <div className="size-[72px] bg-slate-100 rounded-[12px] overflow-hidden shrink-0 relative">
        {event.cover_image_url ? (
          <>
            <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
            {/* Date Overlay for Images */}
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
          {!isExpired && (
            <StatusBadge
              status={
                event.status === 'upcoming'
                  ? 'pending'
                  : event.status === 'ongoing'
                  ? 'approved'
                  : 'rejected'
              }
            />
          )}
        </div>

        {/* Date Text */}
        <p className="text-[11px] text-slate-500 mb-0.5">
          {event.event_date ? new Date(event.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No date set'}
        </p>

        {/* Location */}
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
          {isExpired && (
            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              Archived
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}
