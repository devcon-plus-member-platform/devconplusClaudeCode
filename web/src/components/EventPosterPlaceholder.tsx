import { CalendarOutline, MapPointOutline } from 'solar-icon-set'
import type { Event } from '@devcon-plus/supabase'
import { formatDate } from '../lib/dates'
import { STRIPE_COLORS, POSTER_BG } from './RafflePosterArt'
import logoHorizontal from '../assets/logos/logo-horizontal.svg'

/** Same brand stripe as RafflePosterArt, horizontal-only (this placeholder is always square). */
function BrandStripe() {
  return (
    <div className="flex h-[8px] w-full" aria-hidden>
      {STRIPE_COLORS.map((c) => (
        <div key={c} className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  )
}

/**
 * Branded square poster placeholder shown on EventDetail when an event has no
 * uploaded poster_image_url. Reuses RafflePosterArt's DEVCON+ brand palette/stripe
 * but drops the QR + raffle-specific copy — this is a generic per-event card,
 * not a registration artifact.
 */
export default function EventPosterPlaceholder({ event }: { event: Event }) {
  const dateLabel = event.event_date ? formatDate.full(event.event_date) : 'Date to be announced'

  return (
    <div
      className="relative flex aspect-square w-full flex-col overflow-hidden rounded-2xl text-white"
      style={{ background: POSTER_BG }}
    >
      <BrandStripe />
      <div className="flex flex-1 flex-col items-center justify-center px-7 py-6 text-center">
        <img src={logoHorizontal} alt="DEVCON+" className="h-6 w-auto" />
        <h3 className="mt-4 line-clamp-3 text-[22px] font-black leading-tight">{event.title}</h3>
        <div className="mt-auto w-full pt-5">
          <div className="w-full rounded-2xl bg-white/10 px-4 py-3 text-left">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-white/95">
              <CalendarOutline color="#F6B11F" size={15} />
              {dateLabel}
            </p>
            {event.location && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-white/70">
                <MapPointOutline color="#FFFFFF" size={14} />
                {event.location}
              </p>
            )}
          </div>
        </div>
      </div>
      <BrandStripe />
    </div>
  )
}
