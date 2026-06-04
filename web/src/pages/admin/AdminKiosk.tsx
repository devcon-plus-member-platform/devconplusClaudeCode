import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeftOutline,
  CheckCircleOutline,
  CloseCircleOutline,
  InfoCircleOutline,
  SettingsOutline,
} from 'solar-icon-set'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { supabase, getBridgeToken } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import ComingSoonModal from '../../components/ComingSoonModal'

// ── Types ──────────────────────────────────────────────────────────────────────

type FrameState = 'idle' | 'success' | 'already_checked_in' | 'error'
type CameraStatus = 'starting' | 'active' | 'permission_denied' | 'error'

interface ToastEntry {
  type: 'success' | 'already_checked_in' | 'error'
  memberName?: string
  pointsAwarded?: number
  message?: string
  key: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FRAME_COLOR: Record<FrameState, string> = {
  idle:                'rgba(255,255,255,0.85)',
  success:             '#21C45D',
  already_checked_in:  '#F59E0B',
  error:               '#EF4444',
}

const FRAME_GLOW: Record<FrameState, string> = {
  idle:                'none',
  success:             'drop-shadow(0 0 14px rgba(33,196,93,0.75))',
  already_checked_in:  'drop-shadow(0 0 14px rgba(245,158,11,0.75))',
  error:               'drop-shadow(0 0 14px rgba(239,68,68,0.75))',
}

const TOAST_DURATION_MS = 3000
const FRAME_FLASH_MS    = 1500

// ── Sub-components ─────────────────────────────────────────────────────────────

const CornerBrackets = ({ frameState }: { frameState: FrameState }) => (
  <svg
    viewBox="0 0 240 240"
    className="absolute inset-0 w-full h-full"
    fill="none"
    strokeWidth="3"
    strokeLinecap="round"
    style={{
      stroke:     FRAME_COLOR[frameState],
      filter:     FRAME_GLOW[frameState],
      transition: 'stroke 0.25s ease, filter 0.25s ease',
    }}
  >
    <path d="M 0 40 L 0 0 L 40 0" />
    <path d="M 200 0 L 240 0 L 240 40" />
    <path d="M 0 200 L 0 240 L 40 240" />
    <path d="M 240 200 L 240 240 L 200 240" />
  </svg>
)

// CSS-animated shrink bar — avoids framer-motion for a pure-CSS linear drain
const ProgressBar = ({ durationMs, trackColor }: { durationMs: number; trackColor: string }) => (
  <div className="w-full h-1 rounded-full overflow-hidden mt-3" style={{ backgroundColor: trackColor }}>
    <div
      className="h-full bg-white rounded-full"
      ref={(el) => {
        if (!el) return
        el.style.transition = 'none'
        el.style.width = '100%'
        requestAnimationFrame(() => {
          el.style.transition = `width ${durationMs}ms linear`
          el.style.width = '0%'
        })
      }}
    />
  </div>
)

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminKiosk() {
  const navigate = useNavigate()

  const [now, setNow]                       = useState(new Date())
  const [cameraStatus, setCameraStatus]     = useState<CameraStatus>('starting')
  const [frameState, setFrameState]         = useState<FrameState>('idle')
  const [toast, setToast]                   = useState<ToastEntry | null>(null)
  const [checkedInCount, setCheckedInCount] = useState(0)
  const [activeEventName, setActiveEventName] = useState('')
  const [showSettings, setShowSettings]     = useState(false)

  const videoRef          = useRef<HTMLVideoElement>(null)
  const controlsRef       = useRef<IScannerControls | null>(null)
  const isProcessingRef   = useRef(false)
  const isCameraStarting  = useRef(false)
  const frameTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastKeyRef       = useRef(0)

  // ── Live clock ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Data helpers ───────────────────────────────────────────────────────────

  const fetchDailyCount = async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('point_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'event_attendance')
      .gte('created_at', todayStart.toISOString())
    setCheckedInCount(count ?? 0)
  }

  const fetchActiveEvent = async () => {
    // Prefer an event that is currently ongoing
    const { data: ongoing } = await supabase
      .from('events')
      .select('title, location')
      .eq('status', 'ongoing')
      .order('event_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (ongoing) {
      setActiveEventName(
        ongoing.location ? `${ongoing.title} · ${ongoing.location}` : ongoing.title
      )
      return
    }

    // Fall back to the next upcoming event today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: upcoming } = await supabase
      .from('events')
      .select('title, location')
      .eq('status', 'upcoming')
      .gte('event_date', todayStart.toISOString())
      .order('event_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (upcoming) {
      setActiveEventName(
        upcoming.location ? `${upcoming.title} · ${upcoming.location}` : upcoming.title
      )
    }
  }

  // ── Realtime subscription for attendee counter ─────────────────────────────

  useEffect(() => {
    void fetchDailyCount()
    void fetchActiveEvent()

    const channel = supabase
      .channel('kiosk-attendance-counter')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'point_transactions' },
        (payload) => {
          const row = payload.new as { source?: string }
          if (row.source === 'event_attendance') {
            void fetchDailyCount()
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[kiosk] realtime error', status, err)
        }
      })

    return () => { void supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera helpers ─────────────────────────────────────────────────────────

  const stopCamera = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((t) => t.stop())
      videoRef.current.srcObject = null
    }
  }

  const startCamera = async () => {
    if (controlsRef.current || isProcessingRef.current || isCameraStarting.current || !videoRef.current) return
    isCameraStarting.current = true
    setCameraStatus('starting')
    try {
      const allDevices = await BrowserQRCodeReader.listVideoInputDevices()
      if (!allDevices.length) {
        setCameraStatus('error')
        return
      }
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoDevice(
        allDevices[0].deviceId,
        videoRef.current,
        (res, err) => {
          if (res && !isProcessingRef.current) {
            isProcessingRef.current = true
            stopCamera()
            void handleScanned(res.getText())
          } else if (err && err.name !== 'NotFoundException') {
            // suppress expected "no QR in frame" noise
          }
        }
      )
      controlsRef.current = controls
      setCameraStatus('active')
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
        setCameraStatus('permission_denied')
      } else {
        setCameraStatus('error')
      }
    } finally {
      isCameraStarting.current = false
    }
  }

  // ── Frame flash + toast helpers ────────────────────────────────────────────

  const flashFrame = (state: FrameState) => {
    if (frameTimerRef.current) clearTimeout(frameTimerRef.current)
    setFrameState(state)
    frameTimerRef.current = setTimeout(() => {
      setFrameState('idle')
      frameTimerRef.current = null
    }, FRAME_FLASH_MS)
  }

  const showToast = (entry: Omit<ToastEntry, 'key'>) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastKeyRef.current += 1
    setToast({ ...entry, key: toastKeyRef.current })
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      isProcessingRef.current = false
      void startCamera()
    }, TOAST_DURATION_MS)
  }

  // ── Scan handler ───────────────────────────────────────────────────────────

  const handleScanned = async (token: string) => {
    // Validate compact JWT format before hitting the edge function
    if (!/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(token)) {
      flashFrame('error')
      showToast({ type: 'error', message: 'Invalid QR format.' })
      return
    }

    const { user } = useAuthStore.getState()
    if (!user) {
      showToast({ type: 'error', message: 'Session expired. Please sign in again.' })
      return
    }

    const accessToken = getBridgeToken()
    if (!accessToken) {
      showToast({ type: 'error', message: 'Session expired. Please sign in again.' })
      return
    }

    try {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean
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
        flashFrame('error')
        showToast({ type: 'error', message: 'Scan failed. Try again.' })
        return
      }

      if (data?.already_checked_in) {
        flashFrame('already_checked_in')
        showToast({ type: 'already_checked_in', memberName: data.member_name ?? 'Member' })
        return
      }

      if (!data?.success) {
        flashFrame('error')
        showToast({ type: 'error', message: data?.error ?? 'Scan failed. Try again.' })
        return
      }

      flashFrame('success')
      showToast({
        type: 'success',
        memberName: data.member_name ?? 'Member',
        pointsAwarded: data.points_awarded ?? 0,
      })
    } catch {
      flashFrame('error')
      showToast({ type: 'error', message: 'Scan failed. Try again.' })
    }
  }

  // Mount / unmount
  useEffect(() => {
    void startCamera()
    return () => {
      stopCamera()
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Formatted strings ──────────────────────────────────────────────────────

  const dateStr = now.toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900 flex flex-col select-none font-proxima overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-6 pt-10 pb-4">
        <motion.button
          type="button"
          aria-label="Back to admin"
          whileTap={{ scale: 0.9, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
          onClick={() => navigate('/admin')}
          className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0"
        >
          <ArrowLeftOutline color="white" size={20} />
        </motion.button>

        <div className="flex-1 text-center">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mb-0.5">
            DEVCON+
          </p>
          <h1 className="text-white text-xl font-black uppercase tracking-[0.12em] leading-none">
            Daily Attendance
          </h1>
          <p className="text-white/50 text-sm font-medium mt-1.5 tabular-nums">
            {dateStr}
            <span className="text-white/25 mx-1.5">|</span>
            {timeStr}
          </p>
        </div>

        <motion.button
          type="button"
          aria-label="Kiosk settings"
          whileTap={{ scale: 0.9, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0"
        >
          <SettingsOutline color="rgba(255,255,255,0.6)" size={20} />
        </motion.button>
      </div>

      {/* ── Camera viewport ────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Live feed */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'contrast(1.1) brightness(1.05)' }}
          playsInline
          muted
        />

        {/* Vignette */}
        <div className="absolute inset-0 bg-black/35 pointer-events-none" />

        {/* Camera status states */}
        <AnimatePresence>
          {cameraStatus === 'starting' && (
            <motion.div
              key="starting"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
            >
              <div className="w-10 h-10 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <p className="text-white text-md3-body-md font-medium">Starting camera…</p>
            </motion.div>
          )}

          {cameraStatus === 'permission_denied' && (
            <motion.div
              key="perm"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center px-8"
            >
              <div className="bg-white rounded-2xl p-6 text-center max-w-xs w-full shadow-xl">
                <div className="w-12 h-12 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-3">
                  <CloseCircleOutline color="#EF4444" size={24} />
                </div>
                <p className="text-md3-body-md font-bold text-slate-900 mb-1">Camera access denied</p>
                <p className="text-md3-label-md text-slate-500">
                  Enable camera in browser settings and reload.
                </p>
              </div>
            </motion.div>
          )}

          {cameraStatus === 'error' && (
            <motion.div
              key="cam-error"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center px-8"
            >
              <div className="bg-white rounded-2xl p-6 text-center max-w-xs w-full shadow-xl">
                <div className="w-12 h-12 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-3">
                  <CloseCircleOutline color="#EF4444" size={24} />
                </div>
                <p className="text-md3-body-md font-bold text-slate-900 mb-1">Camera unavailable</p>
                <p className="text-md3-label-md text-slate-500 mb-4">Check permissions and try again.</p>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => void startCamera()}
                  className="w-full py-2.5 bg-blue text-white text-md3-body-md font-bold rounded-xl"
                >
                  Retry
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Corner bracket scan frame — only shown when camera is active */}
        {cameraStatus === 'active' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none">
            <div
              className="relative"
              style={{ width: 'min(68vw, 480px)', height: 'min(68vw, 480px)' }}
            >
              <CornerBrackets frameState={frameState} />
            </div>
            <p
              className="text-md3-body-md font-semibold tracking-wide transition-colors duration-200"
              style={{ color: frameState === 'idle' ? 'rgba(255,255,255,0.65)' : FRAME_COLOR[frameState] }}
            >
              {frameState === 'idle' ? 'Position QR code within frame' : ' '}
            </p>
          </div>
        )}

        {/* Scan result toast — spring up from bottom of camera area */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.key}
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { type: 'spring', stiffness: 420, damping: 32 } }}
              exit={{ y: 80, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
              className="absolute bottom-4 left-4 right-4"
            >
              {toast.type === 'success' && (
                <div className="bg-green rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <CheckCircleOutline color="white" size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-black text-md3-body-lg truncate">{toast.memberName}</p>
                      <p className="text-white/70 text-md3-label-md">Check-in successful</p>
                    </div>
                    {(toast.pointsAwarded ?? 0) > 0 && (
                      <p className="text-white font-black text-md3-title-md shrink-0">
                        +{toast.pointsAwarded} pts
                      </p>
                    )}
                  </div>
                  <ProgressBar durationMs={TOAST_DURATION_MS} trackColor="rgba(255,255,255,0.2)" />
                </div>
              )}

              {toast.type === 'already_checked_in' && (
                <div className="bg-amber-500 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <InfoCircleOutline color="white" size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-black text-md3-body-lg truncate">{toast.memberName}</p>
                      <p className="text-white/80 text-md3-label-md">Already checked in</p>
                    </div>
                  </div>
                  <ProgressBar durationMs={TOAST_DURATION_MS} trackColor="rgba(255,255,255,0.2)" />
                </div>
              )}

              {toast.type === 'error' && (
                <div className="bg-red rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      <CloseCircleOutline color="white" size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-black text-md3-body-lg">Scan Failed</p>
                      <p className="text-white/80 text-md3-label-md truncate">{toast.message}</p>
                    </div>
                  </div>
                  <ProgressBar durationMs={TOAST_DURATION_MS} trackColor="rgba(255,255,255,0.2)" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom status card ──────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white rounded-t-3xl px-6 pt-5 pb-8 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-green/10 flex items-center justify-center shrink-0">
            <CheckCircleOutline color="#21C45D" size={28} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-slate-900 font-black text-3xl tabular-nums leading-none">
                {checkedInCount}
              </span>
              <span className="text-slate-900 font-bold text-lg leading-none">employees</span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">checked in today</p>
          </div>
        </div>

        {activeEventName.length > 0 && (
          <p className="text-slate-400 text-xs font-medium mt-3 truncate">{activeEventName}</p>
        )}
      </div>

      {/* Settings placeholder */}
      {showSettings && (
        <ComingSoonModal
          feature="Kiosk Settings"
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
