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
import { BrandStripe, DEVCON17_GOLD, PosterBackdrop } from './RafflePosterArt'
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

/**
 * Branded landscape poster placeholder shown on EventDetail when an event has no
 * uploaded poster_image_url. Themed by the event's DEVCON program (falls back to
 * the viewer's active theme) and decorated with a category watermark icon so the
 * card isn't empty space. Drops RafflePosterArt's QR + raffle-specific copy — this
 * is a generic per-event card, not a registration artifact.
 */
export default function EventPosterPlaceholder({ event }: { event: Event }) {
  const { activeTheme } = useThemeStore()
  const theme = resolveEventTheme(event.devcon_category, activeTheme())
  const meta = event.category ? CATEGORY_META[event.category] : null
  const Icon = meta?.icon ?? CalendarOutline
  const dateLabel = event.event_date ? formatDate.full(event.event_date) : 'Date to be announced'

  return (
    <div
      className="relative flex aspect-video w-full flex-col overflow-hidden rounded-xl text-white md:rounded-2xl"
      // Keeps the program's hue up top but sinks into DEVCON 17 deep space at the
      // bottom, which is what gives the orbit rings something to glow against.
      style={{
        background: `linear-gradient(160deg, ${theme.hex} 0%, ${theme.darkHex} 46%, #120A34 78%, #0B0620 100%)`,
      }}
    >
      <BrandStripe thickness={8} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: PATTERN_BG, backgroundSize: '46px 46px', opacity: 0.32 }}
        aria-hidden
      />
      {/* Same key-art atmosphere as the raffle poster, haloed in the event's own theme
          colour and dialled back so the title stays the loudest thing on the card. */}
      <PosterBackdrop accent={theme.hex} intensity={0.8} />
      <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-5 py-3 text-center md:gap-10 md:px-7 md:py-4">
        {/* Watermark icon — top center, scales with available height */}
        <div className="relative flex shrink-0 items-center justify-center">
          <div className="absolute h-12 w-12 rounded-full bg-white/10 md:h-16 md:w-16" aria-hidden />
          <Icon color="rgba(255,255,255,0.4)" size={28} />
        </div>

        <div className="flex min-w-0 w-full max-w-md flex-col items-center text-center">
          <div className="flex w-full items-center justify-center gap-2">
            <img src={logoHorizontal} alt="DEVCON+" className="h-4 w-auto md:h-5" />
            {meta && (
              <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1">
                <Icon color={DEVCON17_GOLD} size={11} />
                <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-white">
                  {meta.label}
                </span>
              </div>
            )}
          </div>

          <h3 className="mt-1.5 line-clamp-2 text-[15px] font-black leading-tight md:text-[18px]">
            {event.title}
          </h3>

          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold text-white/90 md:text-[12px]">
            <span className="flex items-center gap-1">
              <CalendarOutline color={DEVCON17_GOLD} size={13} />
              {dateLabel}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 text-white/70">
                <MapPointOutline color="#FFFFFF" size={12} />
                {event.location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <StarOutline color={DEVCON17_GOLD} size={13} />
              Earn +{event.points_value} pts
            </span>
          </div>
        </div>
      </div>
      <BrandStripe thickness={8} />
    </div>
  )
}
