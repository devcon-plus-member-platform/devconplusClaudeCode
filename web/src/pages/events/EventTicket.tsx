import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, MapPointOutline, RefreshOutline, CheckCircleOutline, BoltOutline, DangerTriangleOutline, CalendarMarkOutline, CalendarAddOutline } from 'solar-icon-set'
import { QRCodeSVG } from 'qrcode.react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Variants } from 'framer-motion'
import AddToCalendarSheet from '../../components/AddToCalendarSheet'
import { useEventsStore } from '../../stores/useEventsStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { resolveEventTheme } from '../../lib/eventTheme'
import { supabase } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'

// Animation variants
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32, scale: 0.96 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
}

const staggerRows: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.38 } },
}

const rowItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
}

// Countdown border geometry — rounded rect that wraps the QR container
const RECT_SIZE = 220   // slightly larger than the 204px QR container
const RECT_RX   = 24   // rounded-3xl to match the card aesthetic
const RECT_CIRCUMFERENCE = 4 * (RECT_SIZE - 2 * RECT_RX) + 2 * Math.PI * RECT_RX

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// Inline horizontal logo — white text paths + multicolor ICON
function LogoHorizontalWhite({ width = 132 }: { width?: number }) {
  const height = Math.round((width / 178) * 27)
  return (
    <svg width={width} height={height} viewBox="0 0 178 27" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M69.94 0.499878H77.0441L66.98 25.6222H59.8759L49.8118 0.499878H56.9159L63.4279 16.7727L69.94 0.499878Z" fill="white"/>
      <path d="M48.0179 6.09481H34.3277V10.0076H46.7598V15.6025H34.3277V20.0273H48.0179V25.6222H28.0006V0.499878H48.0179V6.09481Z" fill="white"/>
      <path d="M0 25.6222V0.499878H9.2871C18.0192 0.499878 24.1613 5.69257 24.1613 13.0428C24.1613 20.393 18.0192 25.6222 9.2871 25.6222H0ZM6.32707 19.9542H10.2491C14.5782 19.9542 17.6862 17.0653 17.6862 13.0428C17.6862 9.02027 14.5782 6.16795 10.2491 6.16795H6.32707V19.9542Z" fill="white"/>
      <path d="M133.618 25.5612V0.438843H139.945L151.008 15.2855V0.438843H157.335V25.5612H151.008L139.945 10.7145V25.5612H133.618Z" fill="white"/>
      <path d="M90.6972 26C83.2972 26 77.0441 20.0394 77.0441 12.9817C77.0441 5.92405 83.2972 0 90.6972 0C94.6563 0 98.2823 1.68214 100.798 4.31505L96.1733 8.37412C94.8413 6.72855 92.8433 5.66807 90.6972 5.66807C86.8122 5.66807 83.5192 9.03235 83.5192 12.9817C83.5192 16.9677 86.8122 20.3319 90.6972 20.3319C92.8803 20.3319 94.8413 19.2714 96.2103 17.6259L100.798 21.6484C98.2823 24.3179 94.6563 26 90.6972 26Z" fill="white"/>
      <circle cx="122.819" cy="7.55064" r="7.42857" fill="#EA641D"/>
      <circle cx="111.676" cy="7.55064" r="7.42857" fill="#E9C902"/>
      <circle cx="111.676" cy="18.6935" r="7.42857" fill="#5C29A1"/>
      <circle cx="122.819" cy="18.6935" r="7.42857" fill="#73B209"/>
      <circle cx="122.819" cy="7.55064" r="7.42857" fill="#EA641D"/>
      <path d="M117.247 2.6394C118.402 3.94879 119.104 5.6671 119.104 7.55054C119.104 9.4337 118.402 11.1514 117.247 12.4607C116.092 11.1515 115.39 9.43337 115.39 7.55054C115.39 5.66743 116.092 3.9487 117.247 2.6394Z" fill="#E9C902"/>
      <path d="M175.425 11.1364C176.48 11.1364 177.335 11.9917 177.335 13.0468C177.335 14.1019 176.48 14.9572 175.425 14.9572H172.402V18.0223C172.402 19.1483 171.489 20.061 170.363 20.061C169.238 20.061 168.325 19.1483 168.325 18.0223V14.9572H165.245C164.19 14.9572 163.335 14.1019 163.335 13.0468C163.335 11.9917 164.19 11.1364 165.245 11.1364H168.325V8.09973C168.325 6.97379 169.238 6.06104 170.363 6.06104C171.489 6.06104 172.402 6.97379 172.402 8.09973V11.1364H175.425Z" fill="white"/>
    </svg>
  )
}

export default function EventTicket() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { events, registrations, cancelRegistration, fetchRegistrations } = useEventsStore()
  const { user } = useAuthStore()
  const { activeTheme } = useThemeStore()
  const theme = activeTheme()

  const event = events.find((e) => e.slug === slug)
  const reg = registrations.find((r) => r.event_id === event?.id)

  const effectiveTheme = resolveEventTheme(event?.devcon_category, theme)

  const [token, setToken] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(30)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [checkedIn, setCheckedIn] = useState(() => reg?.checked_in === true)

  const [showCalSheet, setShowCalSheet] = useState(false)

  const [cancelStep, setCancelStep] = useState<null | 'first' | 'second'>(null)
  const [isCancelling, setIsCancelling]     = useState(false)
  const [cancelError, setCancelError]       = useState<string | null>(null)
  const [qrFullscreen, setQrFullscreen]     = useState(false)

  const eventEnded = event?.status === 'past' && !checkedIn

  // Token rotation — fetch on mount and 6s before each expiry
  useEffect(() => {
    if (!reg || event?.status === 'past') return
    let cancelled = false
    let inErrorState = false

    async function fetchToken() {
      if (cancelled || inErrorState) return
      setIsRefreshing(true)
      setFetchError(false)

      try {
        const data = await apiFetch<{ token: string; expires_at: number }>(
          '/api/qr/registration-token',
          { method: 'POST', body: JSON.stringify({ registrationId: reg!.id }) },
        )
        if (cancelled) return
        setToken(data.token)
        setSecondsLeft(30)
      } catch {
        if (!cancelled) { setFetchError(true); inErrorState = true }
      }
      setIsRefreshing(false)
    }

    void fetchToken()

    const intervalId = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev === 6) void fetchToken()
        return prev <= 1 ? 1 : prev - 1
      })
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [reg?.id, retryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Best-effort realtime: instant "✓ checked in" when the channel connects. On
  // error (e.g. past the 200-connection cap) it gives up — no retry, no rebuild —
  // and the 5 s poll below delivers within a few seconds instead. The poll is the
  // safety net, so we don't need to rebuild the channel on visibility/network changes.
  useEffect(() => {
    if (!reg || event?.status === 'past') return
    const regId = reg.id
    const channel = supabase
      .channel(`checkin-${regId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'event_registrations', filter: `id=eq.${regId}` },
        (payload) => {
          if ((payload.new as { checked_in: boolean | null }).checked_in) setCheckedIn(true)
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[checkin] channel unavailable, falling back to polling:', status, err)
          void supabase.removeChannel(channel)
        }
      })
    return () => { void supabase.removeChannel(channel) }
  }, [reg?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling baseline: refetch registrations every 5 s while waiting for the scan,
  // through the backend (no direct Supabase query). Covers the mount-window scan
  // and the case where the realtime channel gave up. Clears once checked-in.
  useEffect(() => {
    if (!reg || checkedIn || event?.status === 'past' || !user) return
    const interval = setInterval(() => { void fetchRegistrations(user.id) }, 5000)
    return () => clearInterval(interval)
  }, [reg?.id, checkedIn, event?.status, user, fetchRegistrations])

  // Reflect a checked_in flip from the store (set by the poll above) into local state.
  useEffect(() => {
    if (reg?.checked_in) setCheckedIn(true)
  }, [reg?.checked_in])

  if (!event || !reg || reg.status !== 'approved') {
    return (
      <div className="p-4 text-center text-slate-400 pt-20">
        Ticket not available.{' '}
        <button onClick={() => navigate(-1)} className="text-primary">Go back</button>
      </div>
    )
  }

  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-PH', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : 'Date TBA'

  // Countdown border progress
  const strokeDashoffset = RECT_CIRCUMFERENCE * (1 - secondsLeft / 30)
  const ringColor = fetchError
    ? '#EF4444'
    : secondsLeft > 10
      ? 'rgb(var(--color-primary))'
      : '#F8C630'

  const infoRows: { label: string; value: string; valueClass: string }[] = [
    { label: 'Name',         value: user?.full_name ?? '—',       valueClass: 'text-slate-900 font-medium' },
    { label: 'Points Value', value: `+${event.points_value} pts`, valueClass: 'text-green font-bold' },
  ]

  const handleConfirmCancel = async () => {
    if (!reg) return
    setIsCancelling(true)
    setCancelError(null)
    try {
      await cancelRegistration(reg.id)
      navigate('/events', { replace: true })
    } catch {
      setCancelError('Failed to cancel. Please try again.')
      setIsCancelling(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ 
        background: `${PATTERN_BG}, linear-gradient(160deg, ${effectiveTheme.darkHex} 0%, ${effectiveTheme.hex} 100%)`,
        backgroundSize: '60px 60px, auto',
        backgroundRepeat: 'repeat, no-repeat'
      }}
    >

      {/* Floating back button */}
      <motion.button
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.05, duration: 0.2 }}
        onClick={() => navigate(-1)}
        whileTap={{ scale: 0.92 }}
        className="fixed top-4 left-4 z-20 flex items-center gap-1.5 text-white/90 bg-white/20 backdrop-blur-md px-3.5 py-2 rounded-full text-md3-body-md font-medium border border-white/20"
      >
        <ArrowLeftOutline className="w-4 h-4" />
        Back
      </motion.button>

      {/* Scrollable content */}
      <div className="flex flex-col items-center px-4 pt-20 pb-12">

        {/* TicketOutline card */}
        <motion.div
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          style={{ transitionDelay: '0.12s' }}
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* ── Primary header strip ── */}
          <div
            className="px-4 pt-6 pb-5 text-center"
            style={{ backgroundColor: checkedIn ? '#21C45D' : effectiveTheme.hex, transition: 'background-color 0.6s ease' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.24 }}
              className="flex justify-center mb-4"
            >
              <LogoHorizontalWhite width={128} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.34, duration: 0.22 }}
            >
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">
                Event Ticket
              </p>
              <h2 className="text-white text-[17px] font-bold mt-1 leading-snug">
                {event.title}
              </h2>
              <p className="text-white/75 text-md3-label-md mt-1.5">{dateStr}</p>
              {event.location && (
                <p className="text-white/60 text-md3-label-md flex items-center justify-center gap-1 mt-0.5">
                  <MapPointOutline className="w-3 h-3 shrink-0" />
                  {event.location}
                </p>
              )}
            </motion.div>
          </div>

          {/* ── White ticket body ── */}
          <div className="bg-white">

            {/* QR code / success card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center pt-6 pb-3 px-4 gap-3"
            >
              {/* Fixed-size wrapper so QR and success card share the same footprint */}
              <div className="relative w-[240px] h-[240px] flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {checkedIn ? (
                    <motion.div
                      key="checked-in"
                      initial={{ opacity: 0, scale: 0.82 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="w-[204px] h-[204px] bg-white rounded-2xl shadow-[0_8px_32px_rgba(33,196,93,0.20)] border border-green/20 flex flex-col items-center justify-center gap-2"
                    >
                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                        className="w-16 h-16 rounded-full bg-green/15 flex items-center justify-center"
                      >
                        <CheckCircleOutline className="w-9 h-9" color="#21C45D" />
                      </motion.div>
                      <motion.p
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.26, duration: 0.22 }}
                        className="text-md3-body-lg font-black text-slate-900"
                      >
                        Signed In!
                      </motion.p>
                      <motion.p
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.32, duration: 0.2 }}
                        className="text-[11px] text-slate-400 text-center px-4"
                      >
                        Attendance recorded
                      </motion.p>
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.2 }}
                        className="flex items-center gap-1 bg-green/10 rounded-full px-3 py-1 border border-green/20"
                      >
                        <BoltOutline className="w-3 h-3" color="#21C45D" />
                        <span className="text-md3-label-md font-bold text-green">+{event.points_value} XP earned!</span>
                      </motion.div>
                    </motion.div>
                  ) : eventEnded ? (
                    <motion.div
                      key="event-ended"
                      initial={{ opacity: 0, scale: 0.82 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="w-[204px] h-[204px] bg-white rounded-2xl shadow-card border border-slate-100 flex flex-col items-center justify-center gap-2"
                    >
                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                        className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center"
                      >
                        <CalendarMarkOutline className="w-9 h-9" color="#94A3B8" />
                      </motion.div>
                      <motion.p
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.26, duration: 0.22 }}
                        className="text-md3-body-lg font-black text-slate-900"
                      >
                        Event Ended
                      </motion.p>
                      <motion.p
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.32, duration: 0.2 }}
                        className="text-[11px] text-slate-400 text-center px-4"
                      >
                        This ticket is no longer valid.
                      </motion.p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="qr-code"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.2 }}
                      className="relative flex items-center justify-center"
                    >
                      {/* SVG countdown border — rounded rect around the QR container */}
                      <svg
                        width={240}
                        height={240}
                        className="absolute pointer-events-none"
                        aria-hidden="true"
                      >
                        <rect
                          x={10} y={10}
                          width={RECT_SIZE} height={RECT_SIZE}
                          rx={RECT_RX} ry={RECT_RX}
                          fill="none"
                          stroke="rgba(0,0,0,0.07)"
                          strokeWidth={4}
                        />
                        <rect
                          x={10} y={10}
                          width={RECT_SIZE} height={RECT_SIZE}
                          rx={RECT_RX} ry={RECT_RX}
                          fill="none"
                          stroke={ringColor}
                          strokeWidth={4}
                          strokeLinecap="round"
                          strokeDasharray={RECT_CIRCUMFERENCE}
                          strokeDashoffset={strokeDashoffset}
                          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
                        />
                      </svg>

                      {/* QR container — tap to zoom */}
                      <div
                        className="p-4 bg-white rounded-2xl shadow-[0_8px_32px_rgba(30,42,86,0.18)] cursor-pointer active:scale-[0.97] transition-transform"
                        style={{ opacity: isRefreshing || !token ? 0.4 : 1, transition: 'opacity 0.3s' }}
                        onClick={() => { if (token && !isRefreshing) setQrFullscreen(true) }}
                      >
                        {token ? (
                          <QRCodeSVG
                            value={token}
                            size={172}
                            level="M"
                            fgColor="#1E2A56"
                            bgColor="#FFFFFF"
                          />
                        ) : (
                          <div className="w-[172px] h-[172px] flex items-center justify-center">
                            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'rgb(var(--color-primary)) transparent transparent transparent' }} />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Countdown label / retry — hidden after check-in or when event has ended */}
              {!checkedIn && !eventEnded && (
                fetchError ? (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setRetryKey(k => k + 1)}
                    className="flex items-center gap-1.5 text-red text-md3-label-md font-semibold px-4 py-1.5 rounded-full border border-red/30 bg-red/5"
                  >
                    <RefreshOutline className="w-3 h-3" />
                    Tap to retry
                  </motion.button>
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <p className="text-md3-label-md font-medium" style={{ color: secondsLeft <= 10 ? '#F8C630' : 'rgb(var(--color-primary))' }}>
                      {isRefreshing ? 'Refreshing…' : `Refreshes in ${secondsLeft}s`}
                    </p>
                    {token && !isRefreshing && (
                      <p className="text-[10px] text-slate-400">Tap QR to enlarge</p>
                    )}
                  </div>
                )
              )}
            </motion.div>

            {/* Perforated divider with side notches */}
            <div className="relative flex items-center mx-0">
              <div className="absolute -left-3 w-6 h-6 rounded-full bg-slate-100" />
              <div className="flex-1 border-t-2 border-dashed border-slate-200 mx-4" />
              <div className="absolute -right-3 w-6 h-6 rounded-full bg-slate-100" />
            </div>

            {/* Member info rows */}
            <motion.div
              variants={staggerRows}
              initial="hidden"
              animate="visible"
              className="px-4 pt-4 pb-6 space-y-3"
            >
              {infoRows.map(({ label, value, valueClass }) => (
                <motion.div key={label} variants={rowItem} className="flex justify-between items-center text-md3-label-md">
                  <span className="text-slate-400">{label}</span>
                  <span className={valueClass}>{value}</span>
                </motion.div>
              ))}
            </motion.div>

            {/* Cancel registration — only shown when not yet checked in */}
            {!reg.checked_in && !checkedIn && !eventEnded && (
              <div className="px-4 pb-5">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCancelStep('first')}
                  className="w-full py-2.5 text-md3-body-md font-semibold text-red border border-red/20 rounded-xl hover:bg-red/5 transition-colors"
                >
                  Cancel Registration
                </motion.button>
              </div>
            )}

          </div>
        </motion.div>

        {/* Add to CalendarOutline — hidden when no date or event is past */}
        {event.event_date && event.status !== 'past' && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65, duration: 0.3 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCalSheet(true)}
            className="w-full max-w-sm flex items-center justify-center gap-2
                       bg-white/[0.18] border border-white/30 text-white
                       rounded-2xl py-3 text-md3-body-md font-semibold backdrop-blur-sm mt-4"
          >
            <CalendarAddOutline className="w-4 h-4" />
            Add to Calendar
          </motion.button>
        )}

        {/* Hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.62, duration: 0.3 }}
          className="text-white/40 text-md3-label-md text-center mt-5"
        >
          {checkedIn
            ? 'You\'re all set — enjoy the event!'
            : eventEnded
              ? 'This event has already ended.'
              : 'Show this QR code at the venue entrance.\nKeep this screen open — QR refreshes automatically.'}
        </motion.p>

      </div>

      {/* ── Fullscreen QR overlay ── */}
      <AnimatePresence>
        {qrFullscreen && token && (
          <motion.div
            key="qr-fullscreen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-5"
            onClick={() => setQrFullscreen(false)}
          >
            <motion.div
              initial={{ scale: 0.82 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.82 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            >
              <QRCodeSVG
                value={token}
                size={300}
                level="M"
                fgColor="#1E2A56"
                bgColor="#FFFFFF"
              />
            </motion.div>
            <p className="text-lg font-semibold" style={{ color: secondsLeft <= 10 ? '#F8C630' : 'rgb(var(--color-primary))' }}>
              {isRefreshing ? 'Refreshing…' : `Refreshes in ${secondsLeft}s`}
            </p>
            <p className="absolute bottom-10 text-slate-300 text-md3-label-sm">Tap anywhere to close</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cancel confirmation sheets ── */}
      <AnimatePresence>
        {cancelStep && (
          <motion.div
            key="cancel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-end"
            onClick={() => { if (!isCancelling) setCancelStep(null) }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full bg-white rounded-t-3xl px-4 pt-4 pb-10"
              onClick={(e) => e.stopPropagation()}
            >
              {cancelStep === 'first' ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-4">
                    <DangerTriangleOutline className="w-6 h-6" color="#EF4444" />
                  </div>
                  <h3 className="text-md3-title-lg font-black text-slate-900 text-center mb-1">
                    Cancel your registration?
                  </h3>
                  <p className="text-md3-body-md text-slate-500 text-center mb-6">
                    You'll lose your spot for <span className="font-semibold text-slate-700">{event.title}</span>. This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setCancelStep(null)}
                      className="flex-1 py-3 rounded-2xl border border-slate-200 text-md3-body-md font-bold text-slate-700"
                    >
                      Keep my spot
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setCancelStep('second')}
                      className="flex-1 py-3 rounded-2xl bg-slate-100 text-md3-body-md font-bold text-slate-900"
                    >
                      Yes, continue →
                    </motion.button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-4">
                    <DangerTriangleOutline className="w-6 h-6" color="#EF4444" />
                  </div>
                  <h3 className="text-md3-title-lg font-black text-slate-900 text-center mb-1">
                    Are you absolutely sure?
                  </h3>
                  <p className="text-md3-body-md text-slate-500 text-center mb-2">
                    You will be permanently removed from the attendee list.
                  </p>
                  {cancelError && (
                    <p className="text-md3-label-md text-red text-center mb-2">{cancelError}</p>
                  )}
                  <div className="flex gap-3 mt-4">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setCancelStep('first')}
                      disabled={isCancelling}
                      className="flex-1 py-3 rounded-2xl border border-slate-200 text-md3-body-md font-bold text-slate-700 disabled:opacity-50"
                    >
                      Go back
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleConfirmCancel}
                      disabled={isCancelling}
                      className="flex-1 py-3 rounded-2xl bg-red text-white text-md3-body-md font-bold disabled:opacity-50"
                    >
                      {isCancelling ? 'Cancelling…' : 'Cancel Registration'}
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddToCalendarSheet
        event={event}
        isOpen={showCalSheet}
        onClose={() => setShowCalSheet(false)}
      />

    </div>
  )
}
