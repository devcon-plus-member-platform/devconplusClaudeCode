import { QRCodeSVG } from 'qrcode.react'
import { CalendarOutline, MapPointOutline, QRCodeOutline, StarOutline } from 'solar-icon-set'
import type { Event } from '@devcon-plus/supabase'
import { formatDate } from '../lib/dates'
import logoHorizontal from '../assets/logos/logo-horizontal.svg'

/** The headline printed on every poster (per the raffle wheel feature spec). */
export function getPosterHeadline(pointsValue: number) {
  return `Register to earn ${pointsValue} points and join the wheel of names raffle!`
}

// DEVCON+ brand palette — the exact four dot colors from the "+" logo mark
// (logo-horizontal.svg), the same mark that appears in the DEVCON 17 key art.
export const STRIPE_COLORS = ['#EA641D', '#E9C902', '#73B209', '#5C29A1']
export const DEVCON17_GOLD = '#F8C630'

// DEVCON 17 key-art background — deep navy-purple "space" gradient.
export const POSTER_BG = 'linear-gradient(160deg, #191046 0%, #120A38 40%, #0A0520 72%, #05030F 100%)'

/** Key-art bloom hues: the violet halo behind the subject and the warm screen-light below it. */
export const POSTER_VIOLET = '#7C3AED'
export const POSTER_INDIGO = '#5C29A1'
export const POSTER_RING_BLUE = '#3B82F6'
export const POSTER_DEEP_NAVY = '#191046'

export type PosterOrientation = 'portrait' | 'landscape'

/**
 * `#RRGGBB` → `rgba(r,g,b,a)`. Gradient stops fade a brand color to *its own*
 * zero-alpha rather than the `transparent` keyword, which resolves to transparent
 * BLACK and leaves a grey fringe around soft glows and dots.
 */
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// Sparse brand-colored specks, mirroring the confetti of data points in the key art.
// Positions are hand-placed (not random) so every render and every PNG export is identical.
const PARTICLES: Array<{ x: number; y: number; r: number; color: string; alpha: number }> = [
  { x: 8, y: 14, r: 2, color: STRIPE_COLORS[0], alpha: 0.75 },
  { x: 21, y: 7, r: 1.5, color: DEVCON17_GOLD, alpha: 0.6 },
  { x: 34, y: 19, r: 1.5, color: STRIPE_COLORS[2], alpha: 0.5 },
  { x: 47, y: 5, r: 2, color: POSTER_RING_BLUE, alpha: 0.55 },
  { x: 63, y: 12, r: 1.5, color: STRIPE_COLORS[0], alpha: 0.6 },
  { x: 74, y: 6, r: 2.5, color: DEVCON17_GOLD, alpha: 0.7 },
  { x: 88, y: 16, r: 1.5, color: STRIPE_COLORS[2], alpha: 0.55 },
  { x: 94, y: 30, r: 2, color: POSTER_RING_BLUE, alpha: 0.45 },
  { x: 5, y: 34, r: 1.5, color: DEVCON17_GOLD, alpha: 0.45 },
  { x: 13, y: 52, r: 2, color: STRIPE_COLORS[3], alpha: 0.6 },
  { x: 91, y: 48, r: 1.5, color: STRIPE_COLORS[0], alpha: 0.5 },
  { x: 96, y: 62, r: 2, color: DEVCON17_GOLD, alpha: 0.4 },
  { x: 4, y: 68, r: 2, color: STRIPE_COLORS[2], alpha: 0.4 },
  { x: 86, y: 78, r: 1.5, color: POSTER_RING_BLUE, alpha: 0.4 },
  { x: 17, y: 84, r: 1.5, color: STRIPE_COLORS[0], alpha: 0.35 },
  { x: 69, y: 92, r: 2, color: DEVCON17_GOLD, alpha: 0.3 },
]

// Concentric orbit arcs anchored below the bottom edge, so only their crowns show —
// the signature ring motif of the DEVCON 17 poster. Sizes are % of the poster box.
const RINGS: Array<{ w: number; h: number; bottom: number; color: string; alpha: number }> = [
  { w: 104, h: 26, bottom: -17, color: STRIPE_COLORS[0], alpha: 0.5 },
  { w: 132, h: 34, bottom: -22, color: DEVCON17_GOLD, alpha: 0.36 },
  { w: 166, h: 44, bottom: -28, color: STRIPE_COLORS[2], alpha: 0.28 },
  { w: 206, h: 56, bottom: -35, color: POSTER_RING_BLUE, alpha: 0.22 },
]

// Faint vertical light rays in the upper right, fading out at both ends.
const STREAKS: Array<{ x: number; top: number; h: number; alpha: number }> = [
  { x: 62, top: 2, h: 30, alpha: 0.16 },
  { x: 70, top: 8, h: 22, alpha: 0.1 },
  { x: 79, top: 0, h: 38, alpha: 0.13 },
  { x: 86, top: 10, h: 26, alpha: 0.09 },
  { x: 93, top: 4, h: 20, alpha: 0.11 },
]

/**
 * DEVCON 17 key-art atmosphere: violet halo, warm floor light, drifting brand
 * specks and the concentric orbit rings. Purely decorative and absolutely
 * positioned — drop it as the first child of a `relative overflow-hidden` box and
 * give the content beside it `relative` so it stacks on top.
 *
 * Every layer is a plain CSS gradient or border. No `filter`, `mask-image` or
 * `mix-blend-mode`: those are the pieces `html-to-image` renders inconsistently,
 * and this has to survive the PNG export byte-for-byte.
 */
export function PosterBackdrop({
  accent = POSTER_VIOLET,
  warm = STRIPE_COLORS[0],
  intensity = 1,
  rings = true,
}: {
  /** Hue of the main halo — pass the event's theme color to stay on-brand per program. */
  accent?: string
  /** Hue of the low glow (the key art's orange screen-light). */
  warm?: string
  /** Global multiplier, for surfaces where the full-strength bloom is too much. */
  intensity?: number
  rings?: boolean
}) {
  const a = (v: number) => Math.min(1, v * intensity)
  // A contained halo behind the middle of the poster, not a wash over the whole sheet —
  // the key art keeps its edges near-black and lets the violet bloom pool in the centre.
  const blooms = [
    `radial-gradient(86% 44% at 50% 36%, ${withAlpha(accent, a(0.34))} 0%, ${withAlpha(accent, 0)} 72%)`,
    `radial-gradient(64% 40% at 10% 26%, ${withAlpha(POSTER_INDIGO, a(0.26))} 0%, ${withAlpha(POSTER_INDIGO, 0)} 74%)`,
    `radial-gradient(58% 34% at 92% 18%, ${withAlpha(accent, a(0.2))} 0%, ${withAlpha(accent, 0)} 74%)`,
    `radial-gradient(78% 34% at 50% 88%, ${withAlpha(warm, a(0.2))} 0%, ${withAlpha(warm, 0)} 74%)`,
    `radial-gradient(44% 24% at 13% 90%, ${withAlpha(STRIPE_COLORS[2], a(0.14))} 0%, ${withAlpha(STRIPE_COLORS[2], 0)} 78%)`,
  ].join(', ')
  // Sinks the corners back to deep space so the blooms read as light sources.
  const vignette = `radial-gradient(112% 74% at 50% 40%, rgba(5,3,15,0) 42%, rgba(5,3,15,${a(0.5)}) 100%)`

  const specks = PARTICLES.map(
    (p) =>
      `radial-gradient(circle ${p.r}px at ${p.x}% ${p.y}%, ${withAlpha(p.color, a(p.alpha))} 0%, ${withAlpha(p.color, 0)} 100%)`,
  ).join(', ')

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{ backgroundImage: blooms }} />
      <div className="absolute inset-0" style={{ backgroundImage: specks }} />
      <div className="absolute inset-0" style={{ backgroundImage: vignette }} />
      {STREAKS.map((s) => (
        <div
          key={s.x}
          className="absolute w-px"
          style={{
            left: `${s.x}%`,
            top: `${s.top}%`,
            height: `${s.h}%`,
            backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${a(s.alpha)}) 45%, rgba(255,255,255,0) 100%)`,
          }}
        />
      ))}
      {rings &&
        RINGS.map((r) => (
          <div
            key={r.w}
            className="absolute left-1/2 rounded-[50%]"
            style={{
              width: `${r.w}%`,
              height: `${r.h}%`,
              bottom: `${r.bottom}%`,
              transform: 'translateX(-50%)',
              border: `1.5px solid ${withAlpha(r.color, a(r.alpha))}`,
            }}
          />
        ))}
    </div>
  )
}

// True pixel dimensions of the rendered poster. Both the modal (PNG capture) and
// the public page render at these exact sizes, then scale via a CSS transform — so
// the artwork stays crisp (vector text + SVG QR) at any display size.
//
// The canvas is fixed and `overflow-hidden`, so anything taller than it gets clipped
// on export. Every variable field below is length-bounded (title `line-clamp-3`,
// location `line-clamp-2`, everything else is one line), which makes the tallest
// possible stack a known number — these heights are sized to clear it with room to
// spare. If you add a field or grow the type, re-check `/__poster-debug` (the
// "extreme" fixture) before shipping: no content may cross the red frame outline.
export const POSTER_DIMS: Record<PosterOrientation, { w: number; h: number; qr: number }> = {
  portrait: { w: 460, h: 820, qr: 172 },
  landscape: { w: 800, h: 520, qr: 208 },
}

/**
 * DEVCON 17 accent ring — a smooth gradient bar or spine (not hard color blocks),
 * matching the flowing orbit-ring look of the key art. Shared with `EventPosterPlaceholder`.
 */
export function BrandStripe({ vertical = false, thickness = 10 }: { vertical?: boolean; thickness?: number }) {
  const gradient = `linear-gradient(${vertical ? '180deg' : '90deg'}, ${STRIPE_COLORS.join(', ')})`
  return (
    <div
      // `relative` so the stripe paints above any absolutely-positioned PosterBackdrop
      // behind it, instead of being tinted by the bloom layers.
      className="relative shrink-0"
      style={vertical ? { width: thickness, height: '100%', background: gradient } : { height: thickness, width: '100%', background: gradient }}
      aria-hidden
    />
  )
}

/** DEVCON 17 event-year mark — mirrors the gold "17★" motif in the key art. */
function Devcon17Badge() {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[13px] font-black uppercase tracking-[0.14em] text-white/90">DEVCON</span>
      <span className="flex items-center gap-0.5 text-[15px] font-black leading-none text-gold">
        17
        <StarOutline color={DEVCON17_GOLD} size={12} />
      </span>
    </div>
  )
}

function PosterEyebrow() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5">
      <StarOutline color={DEVCON17_GOLD} size={16} />
      <span className="text-[12px] font-extrabold uppercase tracking-[0.18em] text-white">
        Raffle Wheel of Names
      </span>
    </div>
  )
}

function QrCard({ value, size }: { value: string; size: number }) {
  return (
    <div className="rounded-[28px] bg-white p-5 shadow-2xl">
      <QRCodeSVG value={value} size={size} level="M" fgColor="#1E2A56" bgColor="#FFFFFF" />
    </div>
  )
}

/** Shrinks the headline as the points value grows more digits, so it stays length-bounded like the title. */
function headlineSizeClass(length: number) {
  if (length > 70) return 'text-[18px] leading-snug'
  if (length > 60) return 'text-[20px] leading-snug'
  return 'text-[22px] leading-tight'
}

/** Shrinks the title as it gets longer so it always fits within the poster's fixed card width. */
function titleSizeClass(length: number) {
  if (length > 70) return 'text-[13px] leading-snug'
  if (length > 50) return 'text-[15px] leading-snug'
  if (length > 32) return 'text-[18px] leading-tight'
  return 'text-[21px] leading-tight'
}

function EventBlock({ event, dateLabel }: { event: Event; dateLabel: string }) {
  return (
    <div className="w-full rounded-2xl bg-white/10 px-6 py-4 text-left">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Event</p>
      <p
        className={`mt-1 line-clamp-3 break-words font-black text-white ${titleSizeClass(event.title.length)}`}
      >
        {event.title}
      </p>
      <p className="mt-2.5 flex items-center gap-1.5 text-[14px] font-semibold text-white/95">
        <CalendarOutline color={DEVCON17_GOLD} size={16} />
        {dateLabel}
      </p>
      {event.location && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[13px] text-white/70">
          <MapPointOutline color="#FFFFFF" size={15} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{event.location}</span>
        </div>
      )}
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-white/90">
        <StarOutline color={DEVCON17_GOLD} size={14} />
        Earn +{event.points_value} pts
      </p>
    </div>
  )
}

function ScanCaption() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-[13px] font-bold text-white/90">
      <QRCodeOutline color="#FFFFFF" size={16} />
      Scan to register
    </p>
  )
}

/**
 * The branded raffle poster artwork, rendered at its native pixel size for the
 * given orientation. The QR encodes the public event page (where attendees
 * register, which enters them into the wheel pool). Callers scale this node with
 * a CSS transform to fit a preview, a print export, or a full screen.
 */
export default function RafflePosterArt({
  event,
  orientation,
}: {
  event: Event
  orientation: PosterOrientation
}) {
  const dims = POSTER_DIMS[orientation]
  const registerUrl = `${window.location.origin}/events/${event.slug}`
  const dateLabel = event.event_date ? formatDate.full(event.event_date) : 'Date to be announced'
  const headline = getPosterHeadline(event.points_value)

  return (
    <div
      style={{ width: dims.w, height: dims.h, background: POSTER_BG }}
      className="relative overflow-hidden text-white"
    >
      <PosterBackdrop />
      {orientation === 'portrait' ? (
        <div className="relative flex h-full w-full flex-col">
          <BrandStripe />
          {/* One centred stack — spare height is shared top/bottom instead of being
              dumped above the event block, so short and long events both stay balanced. */}
          <div className="flex flex-1 flex-col items-center justify-center px-10 py-8 text-center">
            <img src={logoHorizontal} alt="DEVCON+" className="h-7 w-auto" />
            <div className="mt-2.5">
              <Devcon17Badge />
            </div>
            <div className="mt-4">
              <PosterEyebrow />
            </div>
            <h3 className={`mt-4 line-clamp-3 font-black ${headlineSizeClass(headline.length)}`}>
              {headline}
            </h3>
            <div className="mt-5">
              <QrCard value={registerUrl} size={dims.qr} />
            </div>
            <div className="mt-4">
              <ScanCaption />
            </div>
            <div className="mt-6 w-full">
              <EventBlock event={event} dateLabel={dateLabel} />
            </div>
          </div>
          <BrandStripe />
        </div>
      ) : (
        <div className="relative flex h-full w-full">
          <BrandStripe vertical />
          <div className="flex flex-1 flex-col justify-center gap-7 px-12 py-9">
            <div>
              <img src={logoHorizontal} alt="DEVCON+" className="h-7 w-auto" />
              <div className="mt-3">
                <Devcon17Badge />
              </div>
              <div className="mt-4">
                <PosterEyebrow />
              </div>
              <h3 className={`mt-5 line-clamp-3 font-black ${headlineSizeClass(headline.length)}`}>
                {headline}
              </h3>
            </div>
            <EventBlock event={event} dateLabel={dateLabel} />
          </div>
          <div className="flex flex-col items-center justify-center gap-4 px-10">
            <QrCard value={registerUrl} size={dims.qr} />
            <ScanCaption />
          </div>
          <BrandStripe vertical />
        </div>
      )}
    </div>
  )
}
