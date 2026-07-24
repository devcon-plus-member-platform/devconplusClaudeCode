import {
  CalendarOutline,
  MapPointOutline,
  StarOutline,
  Microphone2Outline,
  CodeSquareOutline,
  NotebookOutline,
  CupHotOutline,
  FlagOutline,
  ConfettiOutline,
  UsersGroupRoundedOutline,
  LaptopOutline,
} from 'solar-icon-set'
import type { Event, EventCategory } from '@devcon-plus/supabase'
import type { SolarIcon } from '../lib/icons'
import { formatDate } from '../lib/dates'
import { STRIPE_COLORS } from './RafflePosterArt'
import { useThemeStore } from '../stores/useThemeStore'
import { resolveEventTheme } from '../lib/eventTheme'
import logoHorizontal from '../assets/logos/logo-horizontal.svg'

const CATEGORY_META: Record<EventCategory, { label: string; icon: SolarIcon }> = {
  tech_talk: { label: 'Tech Talk', icon: Microphone2Outline },
  hackathon: { label: 'Hackathon', icon: CodeSquareOutline },
  workshop: { label: 'Workshop', icon: NotebookOutline },
  brown_bag: { label: 'Brown Bag', icon: CupHotOutline },
  summit: { label: 'Summit', icon: FlagOutline },
  social: { label: 'Social', icon: ConfettiOutline },
  networking: { label: 'Networking', icon: UsersGroupRoundedOutline },
  code_camp: { label: 'Code Camp', icon: LaptopOutline },
}

/** Soft dot-grid texture used across the app on primary-colored surfaces. */
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46"><circle cx="0" cy="0" r="14" stroke="white" stroke-width="0.8" stroke-opacity="0.14" fill="none"/><circle cx="46" cy="0" r="14" stroke="white" stroke-width="0.8" stroke-opacity="0.14" fill="none"/><circle cx="0" cy="46" r="14" stroke="white" stroke-width="0.8" stroke-opacity="0.14" fill="none"/><circle cx="46" cy="46" r="14" stroke="white" stroke-width="0.8" stroke-opacity="0.14" fill="none"/><circle cx="23" cy="23" r="14" stroke="white" stroke-width="0.8" stroke-opacity="0.14" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

/** Same brand stripe as RafflePosterArt, horizontal-only (this placeholder is always square). */
function BrandStripe() {
  return (
    <div className="flex h-[8px] w-full shrink-0" aria-hidden>
      {STRIPE_COLORS.map((c) => (
        <div key={c} className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  )
}

/**
 * Branded square poster placeholder shown on EventDetail when an event has no
 * uploaded poster_image_url. Themed by the event's DEVCON program (falls back to
 * the viewer's active theme) and decorated with a large category watermark icon
 * so the middle of the card isn't empty space. Drops RafflePosterArt's QR +
 * raffle-specific copy — this is a generic per-event card, not a registration artifact.
 */
export default function EventPosterPlaceholder({ event }: { event: Event }) {
  const { activeTheme } = useThemeStore()
  const theme = resolveEventTheme(event.devcon_category, activeTheme())
  const meta = event.category ? CATEGORY_META[event.category] : null
  const Icon = meta?.icon ?? CalendarOutline
  const dateLabel = event.event_date ? formatDate.full(event.event_date) : 'Date to be announced'

  return (
    <div
      className="relative flex aspect-square w-full flex-col overflow-hidden rounded-xl text-white md:rounded-2xl"
      style={{ background: `linear-gradient(155deg, ${theme.hex} 0%, ${theme.darkHex} 100%)` }}
    >
      <BrandStripe />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: PATTERN_BG, backgroundSize: '46px 46px', opacity: 0.6 }}
        aria-hidden
      />
      <div className="relative flex flex-1 flex-col items-center px-5 pb-4 pt-5 text-center md:px-7 md:pb-6 md:pt-6">
        <img src={logoHorizontal} alt="DEVCON+" className="h-6 w-auto" />

        {meta && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 md:mt-4">
            <Icon color="#F6B11F" size={13} />
            <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white">
              {meta.label}
            </span>
          </div>
        )}

        {/* Watermark — fills the space between the category badge and the title */}
        <div className="relative flex flex-1 items-center justify-center">
          <div className="absolute h-24 w-24 rounded-full bg-white/10 md:h-32 md:w-32" aria-hidden />
          <Icon color="rgba(255,255,255,0.4)" size={50} />
        </div>

        <h3 className="line-clamp-3 text-[19px] font-black leading-tight md:text-[21px]">
          {event.title}
        </h3>

        <div className="mt-3 w-full md:mt-4">
          <div className="w-full rounded-2xl bg-white/10 px-3.5 py-2.5 text-left md:px-4 md:py-3">
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
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-white/90">
              <StarOutline color="#F8C630" size={14} />
              +{event.points_value} pts
            </p>
          </div>
        </div>
      </div>
      <BrandStripe />
    </div>
  )
}
