// MyQR — Always-on user identity QR
// Accessible at /qr from within MemberLayout.
// Generates a k='u' token via the generate-user-qr edge function.
// The organizer scanner auto-matches this to the member's next upcoming event.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, RefreshOutline, QRCodeOutline, StarOutline } from 'solar-icon-set'
import { QRCodeSVG } from 'qrcode.react'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../stores/useAuthStore'
import { usePointsStore } from '../../stores/usePointsStore'
import { supabase } from '../../lib/supabase'

// Countdown border geometry — matches EventTicket
const RECT_SIZE = 220
const RECT_RX   = 24
const RECT_CIRCUMFERENCE = 4 * (RECT_SIZE - 2 * RECT_RX) + 2 * Math.PI * RECT_RX

// Token TTL in seconds — must match generate-user-qr (300s)
const TOKEN_TTL = 300

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function MyQR() {
  const navigate = useNavigate()
  const { user, initials, chapterName } = useAuthStore()
  const { spendablePoints, loadTotalPoints } = usePointsStore()

  const [token, setToken] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(TOKEN_TTL)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    loadTotalPoints()
  }, [loadTotalPoints])

  // Token rotation — same pattern as EventTicket.tsx
  useEffect(() => {
    let cancelled = false
    let inErrorState = false

    async function fetchToken() {
      if (cancelled || inErrorState) return
      setIsRefreshing(true)
      setFetchError(false)

      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      if (!session) {
        navigate('/sign-in', { replace: true })
        return
      }

      const invokeWithToken = (accessToken: string) =>
        supabase.functions.invoke<{ token: string; expires_at: number }>(
          'generate-user-qr',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )

      let { data, error } = await invokeWithToken(session.access_token)
      if (cancelled) return

      // Retry once with a fresh session if first attempt fails
      if (error || !data?.token) {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession()
        if (cancelled) return

        if (refreshErr || !refreshData.session) {
          navigate('/sign-in', { replace: true })
          return
        }

        ;({ data, error } = await invokeWithToken(refreshData.session.access_token))
        if (cancelled) return
      }

      if (error || !data?.token) {
        setFetchError(true)
        inErrorState = true
      } else {
        setToken(data.token)
        setSecondsLeft(TOKEN_TTL)
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
  }, [retryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const strokeDashoffset = RECT_CIRCUMFERENCE * (1 - secondsLeft / TOKEN_TTL)
  const ringColor = fetchError
    ? '#EF4444'
    : secondsLeft > 30
      ? 'rgb(var(--color-primary))'
      : '#F8C630'

  const minutesLeft = Math.floor(secondsLeft / 60)
  const secsDisplay = secondsLeft % 60
  const countdownLabel = minutesLeft > 0
    ? `${minutesLeft}m ${secsDisplay}s`
    : `${secondsLeft}s`

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none mb-8">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14 text-center"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Back + Title */}
          <div className="relative z-10 px-4 pb-1 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >              <ArrowLeftOutline className="w-5 h-5" color="white" />
            </button>
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              My Identity
            </h1>
          </div>
          <div className="relative z-10 px-4 pb-4 pt-2">
            <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-md3-title-lg font-black text-white mx-auto mb-2 overflow-hidden">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user?.full_name ?? ''} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <h2 className="text-white text-[17px] font-bold leading-none">{user?.full_name}</h2>
          </div>
        </div>
      </header>

      <div className="flex flex-col items-center px-4 pb-12">

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl bg-white border border-slate-100"
        >
          {/* QR section */}
          <div className="flex flex-col items-center pt-8 pb-3 px-4 gap-3">
            <div className="relative w-[240px] h-[240px] flex items-center justify-center">

              {/* SVG countdown border */}
              <svg width={240} height={240} className="absolute pointer-events-none" aria-hidden="true">
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

              {/* QR container */}
              <div
                className="p-4 bg-white rounded-2xl shadow-[0_8px_32px_rgba(30,42,86,0.12)]"
                style={{ opacity: isRefreshing || !token ? 0.4 : 1, transition: 'opacity 0.3s' }}
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
                    <div
                      className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: 'rgb(var(--color-primary)) transparent transparent transparent' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Countdown / retry */}
            {fetchError ? (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setRetryKey(k => k + 1)}
                className="flex items-center gap-1.5 text-red text-md3-label-md font-semibold px-4 py-1.5 rounded-full border border-red/30 bg-red/5"
              >
                <RefreshOutline className="w-3 h-3" />
                Tap to retry
              </motion.button>
            ) : (
              <p
                className="text-md3-label-md font-medium"
                style={{ color: secondsLeft <= 30 ? '#F8C630' : 'rgb(var(--color-primary))' }}
              >
                {isRefreshing ? 'Refreshing…' : `Refreshes in ${countdownLabel}`}
              </p>
            )}
          </div>

          {/* Perforated divider */}
          <div className="relative flex items-center mx-0">
            <div className="absolute -left-3 w-6 h-6 rounded-full bg-slate-50 border-r border-slate-100" />
            <div className="flex-1 border-t-2 border-dashed border-slate-100 mx-4" />
            <div className="absolute -right-3 w-6 h-6 rounded-full bg-slate-50 border-l border-slate-100" />
          </div>

          {/* InfoCircleOutline rows */}
          <div className="px-4 pt-4 pb-8 space-y-3">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-slate-400 font-medium">Member</span>
              <span className="text-slate-900 font-bold">{user?.full_name ?? '—'}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-slate-400 font-medium">Points</span>
              <span className="flex items-center gap-1.5 text-slate-900 font-extrabold">
                <StarOutline className="w-3.5 h-3.5" color="#F8C630" />
                {spendablePoints.toLocaleString()} XP
              </span>
            </div>
            {chapterName && (
              <div className="flex justify-between items-center text-[13px]">
                <span className="text-slate-400 font-medium">Chapter</span>
                <span className="text-slate-900 font-bold">{chapterName}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="flex items-start gap-3 w-full max-w-sm mt-6 bg-blue/5 border border-blue/10 rounded-2xl px-4 py-4"
        >
          <QRCodeOutline className="w-5 h-5 shrink-0 text-blue/40" />
          <p className="text-slate-500 text-[13px] leading-relaxed">
            Show this QR at the venue entrance. Works for your next upcoming registered event at your chapter.
          </p>
        </motion.div>

      </div>
    </div>
  )
}
