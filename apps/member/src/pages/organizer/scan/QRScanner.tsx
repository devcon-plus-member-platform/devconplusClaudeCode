import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftOutline, AltArrowDownOutline, CalendarOutline, CameraRotateOutline, CheckCircleOutline, InfoCircleOutline, CloseCircleOutline, BoltOutline, ClockCircleOutline, UserCheckOutline, UserCrossOutline, FlipHorizontalOutline, SettingsOutline } from 'solar-icon-set'
import { formatDate } from '../../../lib/dates'

// ── Types ────────────────────────────────────────────────────────────────────

type CameraStatus = 'starting' | 'active' | 'permission_denied' | 'error'

interface EventContext {
  id: string
  title: string
  event_date: string | null
}

interface ResultOverlay {
  type: 'success' | 'already_checked_in' | 'error' | 'pending' | 'rejected' | 'wrong_event'
  memberName?: string
  eventTitle?: string
  pointsAwarded?: number
  message?: string
  registrationId?: string
}

// ── Module-level constants ────────────────────────────────────────────────────

const BACKOFF_MS = [0, 500, 1000, 2000] // index = attempt number (1-based); index 0 unused
const MAX_ATTEMPTS = 3
const OVERLAY_DURATION_MS = 3000

// ── Module-level helper component ─────────────────────────────────────────────
const CornerBrackets = ({ detecting }: { detecting: boolean }) => (
  <svg
    viewBox="0 0 240 240"
    className="absolute inset-0 w-full h-full"
    fill="none"
    strokeWidth="3"
    strokeLinecap="round"
    style={{
      stroke: detecting ? '#21C45D' : 'rgba(255,255,255,0.9)',
      filter: detecting ? 'drop-shadow(0 0 8px rgba(33,196,93,0.85))' : 'none',
      transition: 'stroke 0.2s ease, filter 0.2s ease',
    }}
  >
    {/* Top-left */}
    <path d="M 0 30 L 0 0 L 30 0" />
    {/* Top-right */}
    <path d="M 210 0 L 240 0 L 240 30" />
    {/* Bottom-left */}
    <path d="M 0 210 L 0 240 L 30 240" />
    {/* Bottom-right */}
    <path d="M 240 210 L 240 240 L 210 240" />
  </svg>
)

// ── Component ─────────────────────────────────────────────────────────────────

export function OrgQRScanner() {
  const navigate = useNavigate()

  // Camera lifecycle — independent of result display
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('starting')
  const [retryAttempt, setRetryAttempt] = useState(1)   // 1–3, shown in spinner
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [isSwitching, setIsSwitching] = useState(false)

  // Mirror defaults to true — most organisers face the member (front camera / mirrored rear)
  const [isMirrored, setIsMirrored] = useState(true)

  // Event context — which event is being scanned at this door
  const [availableEvents, setAvailableEvents] = useState<EventContext[]>([])
  const [eventCtx, setEventCtx] = useState<EventContext | null>(null)
  const [checkedInCount, setCheckedInCount] = useState(0)
  const [loadingCtx, setLoadingCtx] = useState(true)
  const [showEventPicker, setShowEventPicker] = useState(false)

  // Settings panel (mirror + lens controls)
  const [showSettings, setShowSettings] = useState(false)

  // Live clock for the header
  const [now, setNow] = useState(() => new Date())

  // QR detection indicator — true when zxing has a code in frame
  const [isDetecting, setIsDetecting] = useState(false)
  const detectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Result overlay — null = nothing showing, non-null = slide-up sheet visible
  const [overlayEntry, setOverlayEntry] = useState<{ data: ResultOverlay; key: number } | null>(null)
  const overlayKeyCounterRef = useRef(0)

  // Refs
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const videoCallbackRef = useCallback((el: HTMLVideoElement | null) => setVideoEl(el), [])
  const controlsRef = useRef<import('@zxing/browser').IScannerControls | null>(null)
  const isProcessingRef = useRef(false)         // scan lock — prevents duplicate API calls
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cameraAbortRef = useRef(false)
  // Stable ref for stale camera callback closures — synced to eventCtx state via useEffect
  const eventCtxRef = useRef<EventContext | null>(null)

  // ── Camera helpers ────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    if (videoEl?.srcObject) {
      const stream = videoEl.srcObject as MediaStream
      stream.getTracks().forEach((t) => t.stop())
      videoEl.srcObject = null
    }
  }, [videoEl])

  // ── Event context helpers ─────────────────────────────────────────────────────────

  const selectEvent = useCallback(async (event: EventContext) => {
    setEventCtx(event)
    setShowEventPicker(false)
    const { supabase } = await import('../../../lib/supabase')
    const { count } = await supabase
      .from('event_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('checked_in', true)
    setCheckedInCount(count ?? 0)
  }, [])

  const initCamera = async (el: HTMLVideoElement, deviceId?: string): Promise<void> => {
    const { BrowserQRCodeReader } = await import('@zxing/browser')
    const { DecodeHintType } = await import('@zxing/library')

    // Race camera init against a 10-second timeout
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Camera start timed out')), 10_000)
    )

    const start = async () => {
      const allDevices = await BrowserQRCodeReader.listVideoInputDevices()
      if (allDevices.length === 0) throw new Error('No camera devices found.')
      setDevices(allDevices)

      const activeId = deviceId ?? selectedDeviceId ?? allDevices[0].deviceId
      if (!selectedDeviceId) setSelectedDeviceId(allDevices[0].deviceId)

      // TRY_HARDER runs more decode passes per frame — helps on soft/low-res feeds
      const hints = new Map<import('@zxing/library').DecodeHintType, unknown>()
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new BrowserQRCodeReader(hints)

      // Request the highest resolution the camera supports.
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        frameRate: { ideal: 30, min: 15 },
      }
      if (activeId) {
        videoConstraints.deviceId = { exact: activeId }
      } else {
        videoConstraints.facingMode = { ideal: 'environment' }
      }

      const controls = await reader.decodeFromConstraints(
        { video: videoConstraints },
        el,
        (res) => {
          if (res) {
            setIsDetecting(true)
            if (detectingTimerRef.current) clearTimeout(detectingTimerRef.current)
            detectingTimerRef.current = setTimeout(() => {
              setIsDetecting(false)
              detectingTimerRef.current = null
            }, 600)
            void handleScannedToken(res.getText())
          }
        }
      )
      controlsRef.current = controls

      const stream = el.srcObject as MediaStream | null
      const track = stream?.getVideoTracks?.()[0]
      if (track) {
        track.contentHint = 'motion'
        try {
          const capabilities = track.getCapabilities?.() as Record<string, unknown> | undefined
          const advanced: Record<string, unknown> = {}
          const focusModes = capabilities?.focusMode as string[] | undefined
          if (focusModes?.includes('continuous')) advanced.focusMode = 'continuous'
          if (Object.keys(advanced).length > 0) {
            await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints)
          }
        } catch {
          // Best-effort only. Some browsers reject advanced constraints.
        }
      }
    }

    await Promise.race([start(), timeout])
  }

  const startCameraWithRetry = async (el: HTMLVideoElement, deviceId?: string) => {
    cameraAbortRef.current = false
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (cameraAbortRef.current) return
      setRetryAttempt(attempt)
      setCameraStatus('starting')

      if (attempt > 1) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]))
      }

      try {
        await initCamera(el, deviceId)
        setCameraStatus('active')
        return
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
          setCameraStatus('permission_denied')
          return
        }
        if (attempt === MAX_ATTEMPTS) {
          setCameraStatus('error')
          return
        }
      }
    }
  }

  const dismissOverlay = () => {
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current)
      overlayTimerRef.current = null
    }
    setOverlayEntry(null)
    isProcessingRef.current = false
  }

  const showOverlay = (next: ResultOverlay) => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    overlayKeyCounterRef.current += 1
    setOverlayEntry({ data: next, key: overlayKeyCounterRef.current })
    if (next.type !== 'pending') {
      overlayTimerRef.current = setTimeout(dismissOverlay, OVERLAY_DURATION_MS)
    }
  }

  const handleScannedToken = async (token: string) => {
    if (isProcessingRef.current) return

    if (!/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(token)) {
      showOverlay({ type: 'error', message: 'Invalid QR format.' })
      return
    }

    const { supabase } = await import('../../../lib/supabase')
    const { useAuthStore } = await import('../../../stores/useAuthStore')
    const user = useAuthStore.getState().user

    if (!user) {
      showOverlay({ type: 'error', message: 'Session expired. Please sign in again.' })
      return
    }

    isProcessingRef.current = true

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      let accessToken = sessionData.session?.access_token

      if (!accessToken) {
        showOverlay({ type: 'error', message: 'Session expired. Please sign in again.' })
        isProcessingRef.current = false
        return
      }

      const expiresAt = sessionData.session?.expires_at
      if (!expiresAt || expiresAt - Math.floor(Date.now() / 1000) < 300) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        if (refreshed.session?.access_token) {
          accessToken = refreshed.session.access_token
        }
      }

      supabase.functions.setAuth(accessToken)

      const { data, error } = await supabase.functions.invoke<{
        success: boolean
        pending?: boolean
        registration_id?: string
        member_name?: string
        points_awarded?: number
        event_title?: string
        already_checked_in?: boolean
        error?: string
      }>('award-points-on-scan', {
        body: { token },
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (error) {
        let errorMessage = 'Scan failed. Try again.'
        try {
          const body = await (error as unknown as { context: Response }).context.json() as { error?: string; message?: string }
          if (body?.error) errorMessage = body.error
          else if (body?.message) errorMessage = body.message
        } catch { /* non-JSON body — keep generic message */ }
        showOverlay({ type: 'error', message: errorMessage })
        return
      }

      if (data?.pending && data.registration_id) {
        showOverlay({
          type: 'pending',
          memberName: data.member_name ?? 'Member',
          eventTitle: data.event_title ?? '',
          registrationId: data.registration_id,
        })
        return
      }

      if (data?.already_checked_in) {
        showOverlay({ type: 'already_checked_in', memberName: data.member_name ?? 'Member' })
        return
      }

      if (data?.error === 'token_expired' || data?.error === 'invalid_token') {
        showOverlay({ type: 'error', message: 'Invalid or expired QR code.' })
        return
      }

      if (!data?.success) {
        showOverlay({ type: 'error', message: data?.error ?? 'Scan failed. Try again.' })
        return
      }

      // Detect wrong-event scan — edge function awarded for a different event than selected
      const currentEventCtx = eventCtxRef.current
      if (currentEventCtx && data.event_title && data.event_title !== currentEventCtx.title) {
        showOverlay({
          type: 'wrong_event',
          memberName: data.member_name ?? 'Member',
          eventTitle: data.event_title,
        })
        return
      }

      showOverlay({
        type: 'success',
        memberName: data.member_name ?? 'Member',
        eventTitle: data.event_title ?? '',
        pointsAwarded: data.points_awarded ?? 0,
      })
      setCheckedInCount((n) => n + 1)
    } catch {
      showOverlay({ type: 'error', message: 'Scan failed. Try again.' })
    }
  }

  const handleDoorAction = async (registrationId: string, action: 'approve' | 'reject') => {
    const { supabase } = await import('../../../lib/supabase')
    try {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean
        rejected?: boolean
        already_approved?: boolean
        member_name?: string
        points_awarded?: number
        event_title?: string
        error?: string
      }>('approve-at-door', { body: { registration_id: registrationId, action } })

      if (error || !data?.success) {
        showOverlay({ type: 'error', message: data?.error ?? 'Action failed. Try again.' })
        return
      }

      if (action === 'reject' || data.rejected) {
        showOverlay({ type: 'rejected', memberName: data.member_name ?? 'Member' })
        return
      }

      if (data.already_approved) {
        showOverlay({ type: 'already_checked_in', memberName: data.member_name ?? 'Member' })
        return
      }

      showOverlay({
        type: 'success',
        memberName: data.member_name ?? 'Member',
        eventTitle: data.event_title ?? '',
        pointsAwarded: data.points_awarded ?? 0,
      })
      setCheckedInCount((n) => n + 1)
    } catch (e) {
      showOverlay({
        type: 'error',
        message: e instanceof Error ? e.message : 'Action failed. Try again.',
      })
    }
  }

  // ── Camera switching helpers ──────────────────────────────────────────────────────────────

  const switchCamera = useCallback(async (nextDeviceId: string) => {
    if (isSwitching || nextDeviceId === selectedDeviceId || !videoEl) return
    setIsSwitching(true)
    setSelectedDeviceId(nextDeviceId)
    stopCamera()
    await startCameraWithRetry(videoEl, nextDeviceId)
    setIsSwitching(false)
  }, [isSwitching, selectedDeviceId, videoEl, stopCamera]) // eslint-disable-line react-hooks/exhaustive-deps

  const cycleCamera = useCallback(() => {
    if (devices.length < 2) return
    const currentIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId)
    const nextIndex = (currentIndex + 1) % devices.length
    void switchCamera(devices[nextIndex].deviceId)
  }, [devices, selectedDeviceId, switchCamera])

  // Start camera when video element mounts
  useEffect(() => {
    if (!videoEl) return
    void startCameraWithRetry(videoEl)
    return () => {
      cameraAbortRef.current = true
      stopCamera()
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
      if (detectingTimerRef.current) clearTimeout(detectingTimerRef.current)
    }
  }, [videoEl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep eventCtxRef in sync so stale camera-callback closures always read the current event
  useEffect(() => {
    eventCtxRef.current = eventCtx
  }, [eventCtx])

  // Live clock — tick every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch organizer's upcoming non-external events on mount
  useEffect(() => {
    const fetchEventContext = async () => {
      const { supabase } = await import('../../../lib/supabase')
      const { useAuthStore } = await import('../../../stores/useAuthStore')
      const user = useAuthStore.getState().user
      if (!user?.chapter_id) {
        setLoadingCtx(false)
        return
      }
      // Only show events that started in the last 12h or haven't started yet —
      // avoids stale entries when the status field isn't auto-updated.
      // Exclude external events — no QR check-in for those.
      const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, title, event_date')
        .eq('chapter_id', user.chapter_id)
        .eq('is_external', false)
        .gte('event_date', cutoff)
        .order('event_date', { ascending: true })
        .limit(10)
      const events = (eventsData ?? []) as EventContext[]
      setAvailableEvents(events)
      if (events.length === 1) {
        await selectEvent(events[0])
        setLoadingCtx(false)
      } else if (events.length > 1) {
        setShowEventPicker(true)
        setLoadingCtx(false)
      } else {
        setLoadingCtx(false)
      }
    }
    void fetchEventContext()
  }, [selectEvent])

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden">

      {/* Live camera feed */}
      <video
        ref={videoCallbackRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: 'contrast(1.15) brightness(1.05)',
          transform: isMirrored ? 'scaleX(-1)' : undefined,
        }}
        playsInline
        muted
      />

      {/* Vignette */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* ── Starting / error states ─────────────────────────────────────────── */}
      <AnimatePresence>
        {cameraStatus === 'starting' && (
          <motion.div
            key="starting"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
          >
            <div className="w-10 h-10 rounded-full border-2 border-white border-t-transparent animate-spin" />
            <p className="text-white text-md3-body-md font-medium">
              Starting camera…{retryAttempt > 1 ? ` (attempt ${retryAttempt}/3)` : ''}
            </p>
          </motion.div>
        )}

        {cameraStatus === 'permission_denied' && (
          <motion.div
            key="permission_denied"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center px-8"
          >
            <div className="bg-white rounded-2xl p-6 text-center w-full max-w-xs">
              <div className="w-12 h-12 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-3">
                <CloseCircleOutline className="w-6 h-6" color="#EF4444" />
              </div>
              <p className="text-md3-body-md font-bold text-slate-900 mb-1">Camera access denied</p>
              <p className="text-md3-label-md text-slate-500">Enable camera access in your browser settings and reload the page.</p>
            </div>
          </motion.div>
        )}

        {cameraStatus === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center px-8"
          >
            <div className="bg-white rounded-2xl p-6 text-center w-full max-w-xs">
              <div className="w-12 h-12 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-3">
                <CloseCircleOutline className="w-6 h-6" color="#EF4444" />
              </div>
              <p className="text-md3-body-md font-bold text-slate-900 mb-1">Camera unavailable</p>
              <p className="text-md3-label-md text-slate-500 mb-4">Check browser permissions and try again.</p>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => { if (videoEl) void startCameraWithRetry(videoEl) }}
                className="w-full py-2.5 bg-blue text-white text-md3-body-md font-bold rounded-xl"
              >
                Try Again
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active scanning UI ───────────────────────────────────────────────── */}
      {cameraStatus === 'active' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
          <div className="relative w-[min(85vw,360px)] h-[min(85vw,360px)]">
            <CornerBrackets detecting={isDetecting} />
          </div>
          <p
            className="text-md3-body-md font-medium tracking-wide transition-colors duration-200"
            style={{ color: isDetecting ? '#21C45D' : 'rgba(255,255,255,0.8)' }}
          >
            {isSwitching ? 'Switching camera…' : isDetecting ? 'QR detected — reading…' : 'Align QR to scan'}
          </p>
        </div>
      )}

      {/* ── Top bar — floating rounded header ────────────────────────────────── */}
      <div className={`absolute top-12 left-4 right-4 z-[110] rounded-3xl grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 transition-all duration-200 ${showEventPicker ? 'bg-white/90 backdrop-blur-xl' : 'bg-white shadow-xl'}`}>
        {/* Back */}
        <motion.button
          type="button"
          aria-label="Go back"
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"
        >
          <ArrowLeftOutline color="#334155" size={20} />
        </motion.button>

        {/* Centre — event name + live date/time (tappable when multiple events available) */}
        <motion.button
          type="button"
          aria-label="Change event"
          whileTap={availableEvents.length > 1 ? { scale: 0.97 } : undefined}
          onClick={() => { if (availableEvents.length > 1) setShowEventPicker(true) }}
          className="text-center min-w-0"
        >
          <div className="flex items-center justify-center gap-1 min-w-0">
            <p className="text-slate-900 font-black text-md3-title-md leading-tight truncate min-w-0">
              {eventCtx?.title ?? (loadingCtx ? '' : 'QR Scanner')}
            </p>
            {availableEvents.length > 1 && (
              <AltArrowDownOutline color="#64748B" size={14} className="shrink-0" />
            )}
          </div>
          <p className="text-slate-500 text-md3-label-md mt-0.5">
            {formatDate.short(now)}
            {' | '}
            {now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
          </p>
        </motion.button>

        {/* Settings icon */}
        <motion.button
          type="button"
          aria-label="Camera settings"
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowSettings((s) => !s)}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0"
        >
          <SettingsOutline color="#334155" size={20} />
        </motion.button>
      </div>

      {/* ── Settings panel backdrop (click-away dismiss) ─────────────────────── */}
      {showSettings && (
        <div
          className="absolute inset-0 z-[114]"
          onClick={() => setShowSettings(false)}
        />
      )}

      {/* ── Settings dropdown ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute top-[7rem] right-4 z-[115] w-56 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
          >
            {/* Mirror toggle */}
            <button
              type="button"
              onClick={() => setIsMirrored((m) => !m)}
              className="w-full flex items-center justify-between px-4 py-3.5 border-b border-slate-100 active:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <FlipHorizontalOutline color="#334155" size={18} />
                <span className="text-slate-900 text-md3-body-md font-medium">Mirror</span>
              </div>
              {/* Toggle switch */}
              <div className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors ${isMirrored ? 'bg-blue' : 'bg-slate-200'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${isMirrored ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </button>

            {/* Lens switcher — only shown when multiple cameras are detected */}
            {devices.length >= 2 && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                disabled={isSwitching}
                onClick={() => { cycleCamera(); setShowSettings(false) }}
                className="w-full flex items-center gap-2.5 px-4 py-3.5 active:bg-slate-50 transition-colors disabled:opacity-40"
              >
                <CameraRotateOutline color="#334155" size={18} />
                <span className="text-slate-900 text-md3-body-md font-medium">
                  {isSwitching ? 'Switching…' : 'Switch Lens'}
                </span>
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom attendee count card ─────────────────────────────────────── */}
      <div className="absolute bottom-6 left-4 right-4 z-[110] pointer-events-none">
        <div className="bg-white rounded-2xl px-5 py-4 flex items-center gap-3 shadow-card">
          <div className="w-9 h-9 rounded-full bg-green/15 flex items-center justify-center shrink-0">
            <CheckCircleOutline color="#21C45D" size={18} />
          </div>
          {loadingCtx ? (
            <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
          ) : (
            <p className="text-slate-900 font-black text-md3-title-md leading-none">
              {checkedInCount} checked in
            </p>
          )}
        </div>
      </div>

      {/* ── Result overlay (slides up, camera stays live behind) ─────────────── */}
      <AnimatePresence>
        {overlayEntry && (
          <motion.div
            key={overlayEntry.key}
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={dismissOverlay}
            className="absolute bottom-0 left-0 right-0 z-[110] px-4 pb-28 cursor-pointer"
          >
            {overlayEntry.data.type === 'success' && (
              <div className="bg-green rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <CheckCircleOutline className="w-5 h-5" color="white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-black text-md3-body-lg truncate">{overlayEntry.data.memberName}</p>
                    <p className="text-white/70 text-md3-label-md truncate">{overlayEntry.data.eventTitle}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <BoltOutline className="w-4 h-4" color="white" />
                    <span className="text-white font-black text-md3-title-lg">+{overlayEntry.data.pointsAwarded}</span>
                  </div>
                </div>
                <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    ref={(el) => {
                      if (!el) return
                      el.style.transition = 'none'
                      el.style.width = '100%'
                      requestAnimationFrame(() => {
                        el.style.transition = `width ${OVERLAY_DURATION_MS}ms linear`
                        el.style.width = '0%'
                      })
                    }}
                  />
                </div>
              </div>
            )}

            {overlayEntry.data.type === 'already_checked_in' && (
              <div className="bg-amber-500 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <InfoCircleOutline className="w-5 h-5" color="white" />
                  </div>
                  <div>
                    <p className="text-white font-black text-md3-body-lg">{overlayEntry.data.memberName}</p>
                    <p className="text-white/80 text-md3-label-md">Already checked in</p>
                  </div>
                </div>
                <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    ref={(el) => {
                      if (!el) return
                      el.style.transition = 'none'
                      el.style.width = '100%'
                      requestAnimationFrame(() => {
                        el.style.transition = `width ${OVERLAY_DURATION_MS}ms linear`
                        el.style.width = '0%'
                      })
                    }}
                  />
                </div>
              </div>
            )}

            {overlayEntry.data.type === 'pending' && overlayEntry.data.registrationId && (
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xl">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                    <ClockCircleOutline className="w-5 h-5" color="#EAB308" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-900 font-black text-md3-body-lg truncate">{overlayEntry.data.memberName}</p>
                    <p className="text-slate-500 text-md3-label-md truncate">{overlayEntry.data.eventTitle}</p>
                  </div>
                  <span className="ml-auto shrink-0 bg-yellow-100 text-yellow-700 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
                    Pending
                  </span>
                </div>
                <p className="text-md3-label-md text-slate-500 mb-4 mt-2">
                  This member requires approval to attend. Approve to check them in and award points.
                </p>
                <div className="flex gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDoorAction(overlayEntry.data.registrationId!, 'reject')
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-red/30 bg-red/5 text-red text-md3-body-md font-bold"
                  >
                    <UserCrossOutline className="w-4 h-4" />
                    Reject
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDoorAction(overlayEntry.data.registrationId!, 'approve')
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-green text-white text-md3-body-md font-bold"
                  >
                    <UserCheckOutline className="w-4 h-4" />
                    Approve
                  </motion.button>
                </div>
              </div>
            )}

            {overlayEntry.data.type === 'rejected' && (
              <div className="bg-slate-700 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <UserCrossOutline className="w-5 h-5" color="white" />
                  </div>
                  <div>
                    <p className="text-white font-black text-md3-body-lg">{overlayEntry.data.memberName}</p>
                    <p className="text-white/70 text-md3-label-md">Entry rejected</p>
                  </div>
                </div>
                <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    ref={(el) => {
                      if (!el) return
                      el.style.transition = 'none'
                      el.style.width = '100%'
                      requestAnimationFrame(() => {
                        el.style.transition = `width ${OVERLAY_DURATION_MS}ms linear`
                        el.style.width = '0%'
                      })
                    }}
                  />
                </div>
              </div>
            )}

            {overlayEntry.data.type === 'wrong_event' && (
              <div className="bg-amber-500 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <InfoCircleOutline className="w-5 h-5" color="white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-black text-md3-body-lg truncate">{overlayEntry.data.memberName}</p>
                    <p className="text-white/80 text-md3-label-md">
                      QR is for <span className="font-bold">"{overlayEntry.data.eventTitle}"</span> — wrong event
                    </p>
                  </div>
                </div>
                <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    ref={(el) => {
                      if (!el) return
                      el.style.transition = 'none'
                      el.style.width = '100%'
                      requestAnimationFrame(() => {
                        el.style.transition = `width ${OVERLAY_DURATION_MS}ms linear`
                        el.style.width = '0%'
                      })
                    }}
                  />
                </div>
              </div>
            )}

            {overlayEntry.data.type === 'error' && (
              <div className="bg-red rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <CloseCircleOutline className="w-5 h-5" color="white" />
                  </div>
                  <div>
                    <p className="text-white font-black text-md3-body-lg">Scan Failed</p>
                    <p className="text-white/80 text-md3-label-md">{overlayEntry.data.message}</p>
                  </div>
                </div>
                <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    ref={(el) => {
                      if (!el) return
                      el.style.transition = 'none'
                      el.style.width = '100%'
                      requestAnimationFrame(() => {
                        el.style.transition = `width ${OVERLAY_DURATION_MS}ms linear`
                        el.style.width = '0%'
                      })
                    }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Event picker top sheet ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showEventPicker && (
          <>
            <motion.div
              key="picker-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => { if (eventCtx) setShowEventPicker(false) }}
              className="absolute inset-0 z-[104] bg-black/50"
            />
            <motion.div
              key="picker-sheet"
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="absolute top-0 left-0 right-0 z-[105] bg-white rounded-b-3xl max-h-[70vh] flex flex-col"
            >
              {/* Sheet header — clears the floating top bar */}
              <div className="px-5 pt-32 pb-3 shrink-0">
                <p className="font-black text-md3-headline-sm text-slate-900">Select Event</p>
                <p className="text-md3-label-md text-slate-500 mt-0.5">
                  {availableEvents.length} event{availableEvents.length !== 1 ? 's' : ''} at your chapter
                </p>
              </div>
              <div className="h-px bg-slate-100 mx-5 shrink-0" />

              {/* Scrollable list */}
              <div className="flex flex-col gap-2.5 px-4 py-3 overflow-y-auto pb-6">
                {availableEvents.map((ev) => {
                  const isSelected = eventCtx?.id === ev.id
                  const eventDate = ev.event_date ? new Date(ev.event_date) : null
                  const isToday = eventDate
                    ? eventDate.toDateString() === new Date().toDateString()
                    : false

                  return (
                    <motion.button
                      key={ev.id}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => void selectEvent(ev)}
                      className={`w-full text-left flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border transition-colors ${
                        isSelected
                          ? 'bg-blue/10 border-blue/25'
                          : 'bg-slate-50 border-transparent'
                      }`}
                    >
                      {/* Date bubble */}
                      <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 ${isSelected ? 'bg-blue' : 'bg-slate-200'}`}>
                        {eventDate ? (
                          <>
                            <span className={`text-[9px] font-bold uppercase leading-none tracking-wide ${isSelected ? 'text-white/75' : 'text-slate-500'}`}>
                              {eventDate.toLocaleDateString('en-PH', { month: 'short' })}
                            </span>
                            <span className={`text-lg font-black leading-tight ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                              {eventDate.getDate()}
                            </span>
                          </>
                        ) : (
                          <CalendarOutline size={20} color={isSelected ? 'white' : '#64748B'} />
                        )}
                      </div>

                      {/* Event info */}
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-md3-body-md truncate ${isSelected ? 'text-blue' : 'text-slate-900'}`}>
                          {ev.title}
                        </p>
                        <p className="text-md3-label-md text-slate-500 mt-0.5">
                          {isToday ? 'Today' : eventDate ? formatDate.compact(ev.event_date!) : '—'}
                          {eventDate && <> · {eventDate.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}</>}
                        </p>
                      </div>

                      {/* Selection indicator */}
                      {isSelected && (
                        <CheckCircleOutline size={22} color="#1152D4" className="shrink-0" />
                      )}
                    </motion.button>
                  )
                })}
              </div>

              {/* Bottom handle */}
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 shrink-0" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>,
    document.body
  )
}
