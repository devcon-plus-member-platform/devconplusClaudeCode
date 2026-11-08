import { motion } from 'framer-motion'
import { AltArrowRightOutline, ClockCircleOutline, MapPointOutline, UsersGroupRoundedOutline } from 'solar-icon-set'
import type { Event } from '@devcon-plus/supabase'
import { cardItem } from '../lib/animation'
import { formatEventDate, isEventArchived } from '../lib/dates'

interface EventListCardProps {
  event: Event
  attendeeCount?: number
  onSelect: () => void
}

/**
 * Compact event row used by the Events list — both the Discover grid and the
 * "Past Chapter Events" section. Past events render greyed out with a "Past" pill,
 * so one card covers both places.
 */
export default function EventListCard({ event, attendeeCount, onSelect }: EventListCardProps) {
  const dateParts = event.event_date ? formatEventDate(event.event_date) : null
  const isArchived = isEventArchived(event)
  const isExternal = event.is_external === true

  return (
    <motion.button
      variants={cardItem}
      onClick={onSelect}
      className={`w-full bg-white border border-slate-200 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] rounded-2xl p-3 flex items-center gap-4 text-left ${
        isArchived ? 'opacity-60 grayscale' : ''
      }`}
      whileTap={{ scale: 0.98 }}
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
          <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10">
            {dateParts ? (
              <>
                <span className="text-[10px] font-bold leading-none text-primary/60 uppercase">
                  {dateParts.month}
                </span>
                <span className="text-md3-headline-sm font-black leading-tight text-primary">
                  {dateParts.day}
                </span>
              </>
            ) : (
              <ClockCircleOutline className="size-8" color="rgb(var(--color-primary) / 0.4)" />
            )}
          </div>
        )}
      </div>

      {/* Right Side: Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className="font-proxima font-bold text-[14px] text-slate-900 leading-tight truncate min-w-0 flex-1">
            {event.title}
          </p>
          <AltArrowRightOutline className="w-3.5 h-3.5 shrink-0 mt-0.5" color="#CBD5E1" />
        </div>

        {/* Date Text */}
        <p className="text-[11px] text-slate-500 mb-0.5 truncate">
          {event.event_date ? new Date(event.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No date set'}
        </p>

        {/* Location */}
        {event.location && (
          <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1 min-w-0">
            <MapPointOutline className="w-2.5 h-2.5 shrink-0" color="#94A3B8" />
            <span className="truncate min-w-0">{event.location}</span>
          </p>
        )}

        <div className="flex items-center gap-2">
          {!isExternal && (
            <span className="backdrop-blur-[16px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase leading-[13.5px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              +{event.points_value} pts
            </span>
          )}
          {attendeeCount ? (
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              <UsersGroupRoundedOutline className="w-3 h-3" color="#64748B" />
              {attendeeCount}
            </span>
          ) : null}
          {isArchived && (
            <span className="backdrop-blur-[16px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase leading-[13.5px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              Past
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}
