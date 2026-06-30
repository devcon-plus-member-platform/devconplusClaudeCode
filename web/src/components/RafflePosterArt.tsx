import { QRCodeSVG } from 'qrcode.react'
import { CalendarOutline, ConfettiOutline, MapPointOutline, QRCodeOutline } from 'solar-icon-set'
import type { Event } from '@devcon-plus/supabase'
import { formatDate } from '../lib/dates'
import logoHorizontal from '../assets/logos/logo-horizontal.svg'

/** The fixed label printed on every poster (per the raffle wheel feature spec). */
export const POSTER_HEADLINE = 'Register to join the raffle wheel of names!'

// DEVCON+ brand palette — the four colors of the "+" logo mark (orange → purple).
export const STRIPE_COLORS = ['#EA641D', '#E9C902', '#73B209', '#5C29A1']

export const POSTER_BG = 'linear-gradient(155deg, #1152D4 0%, #0D2E73 58%, #1E2A56 100%)'

export type PosterOrientation = 'portrait' | 'landscape'

// True pixel dimensions of the rendered poster. Both the modal (PNG capture) and
// the public page render at these exact sizes, then scale via a CSS transform — so
// the artwork stays crisp (vector text + SVG QR) at any display size.
export const POSTER_DIMS: Record<PosterOrientation, { w: number; h: number; qr: number }> = {
  portrait: { w: 460, h: 650, qr: 168 },
  landscape: { w: 680, h: 460, qr: 208 },
}

/** DEVCON+ brand accent — horizontal bar or vertical spine. */
function BrandStripe({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className={vertical ? 'flex h-full w-[10px] flex-col' : 'flex h-[10px] w-full'} aria-hidden>
      {STRIPE_COLORS.map((c) => (
        <div key={c} className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  )
}

function PosterEyebrow() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5">
      <ConfettiOutline color="#F6B11F" size={16} />
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

function EventBlock({ event, dateLabel }: { event: Event; dateLabel: string }) {
  return (
    <div className="w-full rounded-2xl bg-white/10 px-5 py-4 text-left">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Event</p>
      <p className="mt-1 break-words text-[21px] font-black leading-tight text-white">{event.title}</p>
      <p className="mt-2.5 flex items-center gap-1.5 text-[14px] font-semibold text-white/95">
        <CalendarOutline color="#F6B11F" size={16} />
        {dateLabel}
      </p>
      {event.location && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/70">
          <MapPointOutline color="#FFFFFF" size={15} />
          {event.location}
        </p>
      )}
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

  return (
    <div
      style={{ width: dims.w, height: dims.h, background: POSTER_BG }}
      className="relative overflow-hidden text-white"
    >
      {orientation === 'portrait' ? (
        <div className="flex h-full w-full flex-col">
          <BrandStripe />
          <div className="flex flex-1 flex-col items-center px-9 pb-6 pt-7 text-center">
            <img src={logoHorizontal} alt="DEVCON+" className="h-7 w-auto" />
            <div className="mt-4">
              <PosterEyebrow />
            </div>
            <h3 className="mt-4 text-[26px] font-black leading-[1.08]">{POSTER_HEADLINE}</h3>
            <div className="mt-5">
              <QrCard value={registerUrl} size={dims.qr} />
            </div>
            <div className="mt-3">
              <ScanCaption />
            </div>
            <div className="mt-auto w-full pt-5">
              <EventBlock event={event} dateLabel={dateLabel} />
            </div>
          </div>
          <BrandStripe />
        </div>
      ) : (
        <div className="flex h-full w-full">
          <BrandStripe vertical />
          <div className="flex flex-1 flex-col justify-between px-9 py-8">
            <div>
              <img src={logoHorizontal} alt="DEVCON+" className="h-7 w-auto" />
              <div className="mt-5">
                <PosterEyebrow />
              </div>
              <h3 className="mt-5 max-w-[330px] text-[30px] font-black leading-[1.08]">
                {POSTER_HEADLINE}
              </h3>
            </div>
            <EventBlock event={event} dateLabel={dateLabel} />
          </div>
          <div className="flex flex-col items-center justify-center pl-2 pr-9">
            <QrCard value={registerUrl} size={dims.qr} />
            <div className="mt-3">
              <ScanCaption />
            </div>
          </div>
          <BrandStripe vertical />
        </div>
      )}
    </div>
  )
}
