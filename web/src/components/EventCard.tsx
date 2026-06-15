import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarOutline, StarOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import type { Event } from '@devcon-plus/supabase'
import PromotedBadge from './PromotedBadge'
import FeaturedBadge from './FeaturedBadge'
import StatusPill from './StatusPill'
import { formatDate, isEventArchived } from '../lib/dates'

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function EventCard({ 
  event, 
  attendeeCount = 0,
  attendees = [],
  className = ''
}: { 
  event: Event; 
  attendeeCount?: number;
  attendees?: { avatar_url: string | null; full_name: string }[];
  className?: string;
}) {
  const navigate = useNavigate()
  const isExternal = event.is_external === true
  const externalUrl = event.external_registration_url ?? ''
  const externalIsTba = externalUrl === 'tba' || externalUrl === ''
  const isArchived = isEventArchived(event)
  const dateStr = event.event_date
    ? formatDate.compact(event.event_date)
    : 'Date TBA'

  return (
    <motion.button
      onClick={() => navigate(`/events/${event.slug}`)}
      className={`w-full bg-slate-900 rounded-2xl shadow-card text-left relative overflow-hidden group ${className || 'h-[200px]'} ${isArchived ? 'opacity-60 grayscale' : ''}`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-primary flex items-center justify-center">
            <CalendarOutline className="w-12 h-12" color="rgba(255,255,255,0.2)" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 h-full flex flex-col justify-between p-5 pt-6">
        <div className="space-y-3">
          {/* Title and Meta */}
          <div className="space-y-1">
            <p className="font-proxima font-bold text-white text-md3-title-lg leading-tight line-clamp-2">
              {event.title}
            </p>
            <div className="flex items-center gap-1 w-full min-w-0">
              <p className="font-proxima text-[#dfdfdf] text-[12px] tracking-[0.48px] uppercase shrink-0">
                {dateStr}
              </p>
              <div className="w-1 h-1 bg-[#dfdfdf] rounded-full shrink-0" />
              <p className="font-proxima text-[#dfdfdf] text-[12px] tracking-[0.48px] uppercase truncate min-w-0 flex-1">
                {event.location ?? 'DEVCON Philippines'}
              </p>
            </div>
          </div>

          {/* Badges/Chips */}
          <div className="flex flex-wrap gap-2">
            {isExternal && <FeaturedBadge />}
            <StatusPill status={event.status as any} />
            {event.is_promoted && <PromotedBadge />}
            {!isExternal && (
              <div className="bg-amber-100 flex gap-1 items-center justify-center px-2 py-0.5 rounded-full shrink-0">
                <StarOutline className="w-[6px] h-[6px]" color="#F8C630" />
                <span className="font-proxima font-semibold text-amber-700 text-[9px] tracking-[0.9px] uppercase leading-[13.5px]">
                  {event.points_value} EXP
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3">
          <div
            className={`text-[12px] font-semibold px-[18px] py-[12px] rounded-2xl flex items-center justify-center shrink-0 leading-none shadow-sm ${
              isExternal && externalIsTba
                ? 'bg-white/70 text-slate-500'
                : 'bg-primary text-white'
            }`}
          >
            {isExternal
              ? externalIsTba
                ? 'Registration Coming Soon'
                : 'Learn More'
              : 'Register Now'}
          </div>

          {/* Attendee Summary */}
          {attendeeCount > 0 && (
            <div className="flex -space-x-2">
               {attendees.slice(0, 1).map((a, i) => (
                 <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                   {a.avatar_url ? (
                     <img src={a.avatar_url} alt={a.full_name} className="w-full h-full object-cover" />
                   ) : (
                     <span className="text-[8px] font-bold text-slate-500">{getInitials(a.full_name)}</span>
                   )}
                 </div>
               ))}
               <div className="w-6 h-6 rounded-full border-2 border-white bg-slate-300 flex items-center justify-center shrink-0">
                 <span className="text-[8px] font-semibold text-slate-500">+{attendeeCount}</span>
               </div>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  )
}

export default memo(EventCard)
