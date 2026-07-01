import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { CloseCircleOutline, ConfettiOutline, CupStarOutline, GalleryAddOutline, MagniferOutline, MutedOutline, RestartOutline, ShareOutline, SoundwaveOutline, UsersGroupRoundedOutline } from 'solar-icon-set'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import type { Event } from '@devcon-plus/supabase'
import { publicFetch } from '../../lib/api'
import { backdrop } from '../../lib/animation'
import { playWin, setMuted, startSpinTicks, stopSpinTicks } from '../../lib/wheelSounds'
import NameWheel from '../../components/NameWheel'
import WheelPoster from '../../components/WheelPoster'

const JUMPSTART_URL = 'https://devcon.ph/jumpstart-internships/'

/** Centered celebratory modal entrance (no equivalent in lib/animation). */
const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 22 } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15 } },
}

// DEVCON 16 vivid rainbow — matches the wheel segment palette.
const CONFETTI_COLORS = ['#E5342B', '#F26C21', '#F6B11F', '#2BB24C', '#18B5C4', '#1E73BE', '#5B3FA0', '#B83A8E']

/** Lightweight, dependency-free confetti: colored pieces falling across the screen. */
function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        drift: (Math.random() - 0.5) * 240,
        rotate: Math.random() * 720 - 360,
        delay: Math.random() * 0.25,
        duration: 1.8 + Math.random() * 1.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 7 + Math.random() * 7,
      })),
    [],
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: '-12vh', x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: '112vh', x: p.drift, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  )
}

/** Sui logo — square mark (served from /public/photos). */
function SuiLogo() {
  return <img src="/photos/sui_logo.png" alt="Sui" className="inline-block h-5 w-auto object-contain" />
}

/** nmblr logo — landscape wordmark (served from /public/photos). */
function NmblrLogo() {
  return <img src="/photos/nmblr_logo.png" alt="nmblr" className="inline-block h-5 w-auto object-contain" />
}

/** Centered password popup gating an event's wheel. Closes itself on success. */
function PasswordGate({
  subtitle,
  onConfirm,
  onClose,
}: {
  subtitle?: string
  onConfirm: (password: string) => Promise<void>
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const submit = async () => {
    if (!password) {
      setError('Password is required')
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      await onConfirm(password)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      variants={backdrop}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4"
    >
      <motion.div
        variants={popIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[2rem] bg-white p-7 text-center shadow-2xl"
      >
        <h2 className="text-md3-title-lg font-black text-slate-900">Password</h2>
        {subtitle && <p className="mt-1 text-md3-body-sm text-slate-500">{subtitle}</p>}
        <p className="mt-3 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-2.5 text-left text-md3-label-md leading-relaxed text-slate-500">
          The password is the event organizer&rsquo;s email username. Check with the organizer if you don&rsquo;t have it.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-md3-body-md text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {error && (
          <p className="mt-3 rounded-lg border border-red/20 bg-red/5 px-3 py-2 text-md3-label-md text-red">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-md3-title-md font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={isLoading}
            className="flex-1 rounded-2xl bg-primary py-3 text-md3-title-md font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isLoading ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Shape returned by the public POST /api/events/:id/participants endpoint.
interface EventParticipant {
  name: string
  checked_in: boolean
  status: string
}

type PoolSource = 'event' | 'manual'
type PoolFilter = 'checked_in' | 'approved' | 'all'

const FILTER_LABELS: Record<PoolFilter, string> = {
  checked_in: 'Checked-in',
  approved: 'Approved',
  all: 'All registered',
}

const SPIN_TURNS = 5 // full rotations before settling

/** Parse a textarea into a clean, de-duplicated list of names (one per line). */
function parseManualNames(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of text.split('\n')) {
    const name = raw.trim()
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      names.push(name)
    }
  }
  return names
}

export default function WheelPage() {
  // Deep-link mode: /wheel/:eventId locks the wheel to one event (no picker).
  const { eventId: routeEventId } = useParams<{ eventId?: string }>()
  const isLocked = Boolean(routeEventId)

  // ── Source selection ──────────────────────────────────────────────────────
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState(routeEventId ?? '')
  const [source, setSource] = useState<PoolSource>('event')
  const [filter, setFilter] = useState<PoolFilter>('all')
  const [manualText, setManualText] = useState('')

  const [participants, setParticipants] = useState<EventParticipant[]>([])
  const [isLoadingEvents, setIsLoadingEvents] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ── Password gate ─────────────────────────────────────────────────────────
  // The wheel for an event only loads after its password (the organizer's email
  // local-part, validated server-side) is confirmed. Tracks which event id is
  // currently unlocked so filter changes don't re-prompt.
  const [verifiedEventId, setVerifiedEventId] = useState<string | null>(null)
  const [showPwModal, setShowPwModal] = useState(false)

  // ── Poster generator ──────────────────────────────────────────────────────
  const [showPoster, setShowPoster] = useState(false)

  // ── On-screen registration QR (expandable) ────────────────────────────────
  const [showQr, setShowQr] = useState(false)

  // ── Wheel / draw state ────────────────────────────────────────────────────
  const [entrants, setEntrants] = useState<string[]>([])
  const [removedWinners, setRemovedWinners] = useState<string[]>([])
  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const pendingWinnerRef = useRef<{ name: string; idx: number } | null>(null)

  // ── Sound ─────────────────────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false)
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      setMuted(next)
      if (next) stopSpinTicks()
      return next
    })
  }, [])

  // Stop any scheduled tick timers when the page unmounts.
  useEffect(() => () => stopSpinTicks(), [])

  // Keep the selected event in sync with the route param (SPA nav between
  // /wheel and /wheel/:eventId reuses this component instead of remounting).
  useEffect(() => {
    if (routeEventId) {
      setSource('event')
      setSelectedEventId(routeEventId)
    }
  }, [routeEventId])

  // Load the public event catalog (for the picker + to resolve the locked title).
  useEffect(() => {
    setIsLoadingEvents(true)
    publicFetch<Event[]>('/api/events')
      .then((data) => {
        // Externally-registered events have no in-app participant list to raffle.
        const sorted = data
          .filter((e) => !e.is_external)
          .sort((a, b) => (b.event_date ?? '').localeCompare(a.event_date ?? ''))
        setEvents(sorted)
      })
      .catch(() => setEvents([]))
      .finally(() => setIsLoadingEvents(false))
  }, [])

  // Whenever the selected event changes, prompt for its password before loading
  // participants. An already-unlocked event keeps its loaded names (so switching
  // the pool filter doesn't re-prompt).
  useEffect(() => {
    if (source !== 'event' || !selectedEventId) {
      setParticipants([])
      setShowPwModal(false)
      return
    }
    if (selectedEventId === verifiedEventId) return
    setParticipants([])
    setLoadError(null)
    setShowPwModal(true)
  }, [source, selectedEventId, verifiedEventId])

  // Validate the password server-side; on success the (anonymized) names load.
  // Throwing keeps the error visible inside PasswordConfirmModal.
  const handleVerifyPassword = useCallback(
    async (password: string) => {
      const id = selectedEventId
      const data = await publicFetch<EventParticipant[]>(
        `/api/events/${id}/participants`,
        { method: 'POST', body: JSON.stringify({ password }) },
      )
      setParticipants(data)
      setVerifiedEventId(id)
    },
    [selectedEventId],
  )

  const needsUnlock =
    source === 'event' && Boolean(selectedEventId) && selectedEventId !== verifiedEventId

  const selectedEvent = events.find((e) => e.id === selectedEventId)
  const selectedEventTitle = selectedEvent?.title ?? ''
  // The poster QR links to the public event page (where registering enters the
  // wheel pool), so it needs a resolved event with a slug.
  const canMakePoster = source === 'event' && Boolean(selectedEvent?.slug)
  // Same target as the poster QR: the public event page where attendees register.
  const registerUrl = selectedEvent?.slug
    ? `${window.location.origin}/events/${selectedEvent.slug}`
    : ''

  // The full pool for the current source + filter (winners NOT yet removed).
  const fullPool = useMemo(() => {
    if (source === 'manual') return parseManualNames(manualText)
    const filtered = participants.filter((p) => {
      if (filter === 'checked_in') return p.checked_in
      if (filter === 'approved') return p.status === 'approved'
      return p.status !== 'cancelled'
    })
    return filtered.map((p) => p.name)
  }, [source, manualText, participants, filter])

  // Reset the live pool whenever the full pool changes. Skip while a spin is in
  // flight so the wheel doesn't mutate mid-animation.
  useEffect(() => {
    if (isSpinning) return
    setEntrants(fullPool)
    setRemovedWinners([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullPool])

  const canSpin = entrants.length >= 2 && !isSpinning

  const handleSpin = useCallback(() => {
    if (!canSpin) return
    const idx = Math.floor(Math.random() * entrants.length)
    pendingWinnerRef.current = { name: entrants[idx], idx }

    const sliceAngle = 360 / entrants.length
    const sliceCenter = idx * sliceAngle + sliceAngle / 2
    // Target: slice center aligned to the top pointer (0°), after SPIN_TURNS turns.
    const targetMod = (360 - (sliceCenter % 360)) % 360
    const base = rotation + SPIN_TURNS * 360
    const currentMod = ((base % 360) + 360) % 360
    const adjustment = (targetMod - currentMod + 360) % 360

    setIsSpinning(true)
    setWinner(null)
    setRotation(base + adjustment)
    startSpinTicks() // this click is the user gesture that unlocks Web Audio
  }, [canSpin, entrants, rotation])

  // Called when the rotate transition settles.
  const handleSpinEnd = useCallback(() => {
    if (!isSpinning) return
    setIsSpinning(false)
    const won = pendingWinnerRef.current
    if (!won) return
    setWinner(won.name)
    playWin() // chime + applause; confetti fires off the `winner` state
    // Remove by index (not by name) so repeat spins draw different people even
    // when two entrants share the same anonymized display name (e.g. "Juan D.").
    setEntrants((prev) => prev.filter((_, i) => i !== won.idx))
    setRemovedWinners((prev) => [won.name, ...prev])
  }, [isSpinning])

  const handleReset = useCallback(() => {
    if (isSpinning) return
    setEntrants(fullPool)
    setRemovedWinners([])
    setWinner(null)
  }, [fullPool, isSpinning])

  const handleCloseWinner = useCallback(() => setWinner(null), [])

  const handleSpinAgain = useCallback(() => {
    setWinner(null)
    requestAnimationFrame(() => handleSpin())
  }, [handleSpin])

  const handleShare = useCallback(async () => {
    if (!selectedEventId) return
    const url = `${window.location.origin}/wheel/${selectedEventId}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Public wheel link copied to clipboard')
    } catch {
      // Clipboard API unavailable (insecure context / older browser).
      toast.message('Copy this link', { description: url })
    }
  }, [selectedEventId])

  return (
    <div className="flex h-screen flex-col bg-slate-100 p-6 lg:p-8">
      <header className="mb-4 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ConfettiOutline color="rgb(var(--color-primary))" size={22} />
            </div>
            <p className="text-md3-label-lg font-bold uppercase tracking-wide text-primary">
              DEVCON+ Raffle Wheel
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Unmute sound effects' : 'Mute sound effects'}
            aria-pressed={isMuted}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white transition hover:bg-slate-50"
          >
            {isMuted ? (
              <MutedOutline color="#94A3B8" size={20} />
            ) : (
              <SoundwaveOutline color="rgb(var(--color-primary))" size={20} />
            )}
          </button>
        </div>
        {selectedEventTitle ? (
          <h1 className="mt-2 text-md3-headline-lg font-black leading-tight text-slate-900">
            {selectedEventTitle}
          </h1>
        ) : isLocked ? (
          <h1 className="mt-2 text-md3-headline-lg font-black leading-tight text-slate-400">
            Loading event…
          </h1>
        ) : (
          <p className="mt-2 text-md3-body-md text-slate-500">
            {source === 'event'
              ? 'Pick an event and spin to draw a random winner from its participants.'
              : 'Add names to the list and spin to draw a random winner.'}
          </p>
        )}
      </header>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── Wheel column ── */}
        <div className="flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-card">
          {entrants.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <UsersGroupRoundedOutline color="#94A3B8" size={40} />
              <p className="text-md3-body-md font-semibold text-slate-700">
                {needsUnlock ? 'Locked' : 'No participants yet'}
              </p>
              <p className="max-w-xs text-md3-body-sm text-slate-500">
                {source === 'event'
                  ? needsUnlock
                    ? 'Enter the event password to load participants.'
                    : isLocked
                      ? 'No one matches this pool filter yet — try a different filter.'
                      : 'Pick an event and a filter, or switch to a manual list to add names yourself.'
                  : 'Add at least two names (one per line) to build the wheel.'}
              </p>
              {needsUnlock && !showPwModal && (
                <button
                  type="button"
                  onClick={() => setShowPwModal(true)}
                  className="mt-1 rounded-xl bg-primary px-5 py-2.5 text-md3-label-lg font-bold text-white transition hover:opacity-90"
                >
                  Enter password
                </button>
              )}
            </div>
          ) : (
            <>
              <div
                className="aspect-square w-full"
                style={{ maxWidth: 'min(100%, calc(100vh - 340px))' }}
              >
                <NameWheel
                  entrants={entrants}
                  rotation={rotation}
                  isSpinning={isSpinning}
                  onSpinEnd={handleSpinEnd}
                  onSpin={handleSpin}
                  canSpin={canSpin}
                />
              </div>
              <p className="mt-3 shrink-0 text-md3-body-sm text-slate-500">
                {entrants.length} in the wheel
                {removedWinners.length > 0 && ` · ${removedWinners.length} drawn`}
              </p>
              {entrants.length === 1 && (
                <p className="mt-1 text-md3-label-md font-semibold text-slate-700">
                  Only one left — {entrants[0]} wins by default.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Controls column ── */}
        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          {/* Source toggle — hidden in locked (shared-link) mode */}
          {!isLocked && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <p className="mb-2 text-md3-label-md font-bold uppercase tracking-wide text-slate-500">
                Source
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {(['event', 'manual'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(s)}
                    className={`rounded-lg py-2 text-md3-label-lg font-bold transition ${
                      source === s ? 'bg-primary text-white shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {s === 'event' ? 'From event' : 'Manual list'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {source === 'event' ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              {isLocked ? (
                <>
                  <p className="text-md3-label-md font-bold uppercase tracking-wide text-slate-500">
                    Event
                  </p>
                  <p className="mt-1 text-md3-body-lg font-bold text-slate-900">
                    {selectedEventTitle || '—'}
                  </p>
                </>
              ) : (
                <>
                  <label
                    htmlFor="wheel-event"
                    className="mb-1.5 block text-md3-label-md font-bold uppercase tracking-wide text-slate-500"
                  >
                    Event
                  </label>
                  <select
                    id="wheel-event"
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    disabled={isLoadingEvents}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-md3-body-md text-slate-900 focus:border-primary focus:outline-none"
                  >
                    <option value="">
                      {isLoadingEvents ? 'Loading events…' : 'Select an event…'}
                    </option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <p className="mb-1.5 mt-4 block text-md3-label-md font-bold uppercase tracking-wide text-slate-500">
                Pool
              </p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                {(['checked_in', 'approved', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`rounded-lg py-2 text-md3-label-md font-bold transition ${
                      filter === f ? 'bg-primary text-white shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>

              {needsUnlock && (
                <button
                  type="button"
                  onClick={() => setShowPwModal(true)}
                  className="mt-3 w-full rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-md3-label-lg font-bold text-primary transition hover:bg-primary/10"
                >
                  Enter event password
                </button>
              )}
              {loadError && <p className="mt-3 text-md3-body-sm text-red">{loadError}</p>}

              {/* Share — picker mode only: copy the public deep link for this event */}
              {!isLocked && selectedEventId && (
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-md3-label-lg font-bold text-white transition hover:opacity-90"
                >
                  <ShareOutline color="#fff" size={18} />
                  Share public wheel link
                </button>
              )}

              {/* Poster — generate a printable QR poster for this event */}
              {canMakePoster && (
                <button
                  type="button"
                  onClick={() => setShowPoster(true)}
                  className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-3 text-md3-label-lg font-bold text-primary transition hover:bg-primary/10"
                >
                  <GalleryAddOutline color="rgb(var(--color-primary))" size={18} />
                  Generate QR poster
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <label
                htmlFor="wheel-manual"
                className="mb-1.5 block text-md3-label-md font-bold uppercase tracking-wide text-slate-500"
              >
                Names — one per line
              </label>
              <textarea
                id="wheel-manual"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                rows={8}
                placeholder={'Juan dela Cruz\nMaria Santos\n…'}
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-md3-body-md text-slate-900 focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {/* On-screen registration QR — attendees scan it to open the event page
              and register (which drops them into the wheel pool). Tap to blow it up
              full-screen for scanning off a projector or from across the room. */}
          {canMakePoster && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-md3-label-md font-bold uppercase tracking-wide text-slate-500">
                  Scan to register
                </p>
                <button
                  type="button"
                  onClick={() => setShowQr(true)}
                  className="flex items-center gap-1 text-md3-label-md font-bold text-primary transition hover:opacity-80"
                >
                  <MagniferOutline color="rgb(var(--color-primary))" size={15} />
                  Enlarge
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowQr(true)}
                aria-label="Enlarge registration QR code"
                className="mx-auto block rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-primary/40 hover:shadow-md"
              >
                <QRCodeSVG value={registerUrl} size={172} level="M" fgColor="#1E2A56" bgColor="#FFFFFF" />
              </button>
              <p className="mt-3 text-center text-md3-body-sm text-slate-500">
                Register on the event page to enter the raffle wheel pool.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleReset}
            disabled={isSpinning || removedWinners.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-md3-label-lg font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RestartOutline color="#334155" size={18} />
            Reset pool
          </button>

          {/* Drawn winners list */}
          {removedWinners.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <p className="mb-2 text-md3-label-md font-bold uppercase tracking-wide text-slate-500">
                Winners drawn
              </p>
              <ol className="space-y-1.5">
                {removedWinners.map((name, i) => (
                  <li key={`${name}-${i}`} className="flex items-center gap-2 text-md3-body-md text-slate-900">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-md3-label-sm font-bold text-primary">
                      {removedWinners.length - i}
                    </span>
                    {name}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* ── Credits footer ── */}
      <footer className="mt-4 flex shrink-0 flex-col items-center justify-between gap-2 border-t border-slate-200 pt-3 text-center text-md3-label-md text-slate-500 sm:flex-row sm:text-left">
        <p>
          Proudly built by{' '}
          <a
            href={JUMPSTART_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-primary hover:underline"
          >
            DEVCON Jumpstart AI Engineer Internships
          </a>{' '}
          Cohort 3 &amp; 4
        </p>
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-start">
          Made possible through the support of:
          <SuiLogo />
          <NmblrLogo />
        </p>
      </footer>

      {/* ── Winner overlay (centered) ── */}
      <AnimatePresence>
        {winner && (
          <>
            <ConfettiBurst />
            <motion.div
              variants={backdrop}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={handleCloseWinner}
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
            >
              <motion.div
                variants={popIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-[2rem] bg-white p-12 text-center shadow-2xl"
              >
                <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-gold/20">
                  <CupStarOutline color="#F8C630" size={52} />
                </div>
                <p className="text-md3-title-md font-bold uppercase tracking-widest text-slate-400">
                  Winner
                </p>
                <p className="mt-2 break-words text-md3-headline-lg font-black leading-tight text-slate-900">
                  {winner}
                </p>
                <div className="mt-9 flex gap-3">
                  <button
                    type="button"
                    onClick={handleCloseWinner}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 text-md3-title-md font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleSpinAgain}
                    disabled={entrants.length < 2}
                    className="flex-1 rounded-2xl bg-primary py-4 text-md3-title-md font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove &amp; Spin Again
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Per-event password gate ── */}
      <AnimatePresence>
        {showPwModal && (
          <PasswordGate
            subtitle={selectedEventTitle ? `Unlock “${selectedEventTitle}”` : undefined}
            onConfirm={handleVerifyPassword}
            onClose={() => setShowPwModal(false)}
          />
        )}
      </AnimatePresence>

      {/* ── QR poster generator ── */}
      <AnimatePresence>
        {showPoster && selectedEvent && (
          <WheelPoster event={selectedEvent} onClose={() => setShowPoster(false)} />
        )}
      </AnimatePresence>

      {/* ── Expanded registration QR (large — for scanning off a screen/projector) ── */}
      <AnimatePresence>
        {showQr && canMakePoster && (
          <motion.div
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setShowQr(false)}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4"
          >
            <motion.div
              variants={popIn}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="relative flex w-full max-w-md flex-col items-center rounded-[2rem] bg-white p-8 text-center shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setShowQr(false)}
                aria-label="Close"
                className="absolute right-4 top-4 rounded-xl p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <CloseCircleOutline color="#94A3B8" size={26} />
              </button>
              <p className="text-md3-title-md font-bold uppercase tracking-widest text-slate-400">
                Scan to register
              </p>
              {selectedEventTitle && (
                <p className="mt-1 max-w-full break-words text-md3-title-lg font-black leading-tight text-slate-900">
                  {selectedEventTitle}
                </p>
              )}
              <div className="mt-6 w-[min(320px,68vw)] rounded-3xl border border-slate-200 p-5 shadow-lg">
                <QRCodeSVG
                  value={registerUrl}
                  size={320}
                  level="M"
                  fgColor="#1E2A56"
                  bgColor="#FFFFFF"
                  style={{ width: '100%', height: 'auto' }}
                />
              </div>
              <p className="mt-5 text-md3-body-sm text-slate-500">
                Register on the event page to enter the raffle wheel pool.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
