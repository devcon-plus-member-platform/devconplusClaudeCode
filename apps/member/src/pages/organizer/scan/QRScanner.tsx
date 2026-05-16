import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftOutline, CameraRotateOutline, CheckCircleOutline, InfoCircleOutline, CloseCircleOutline, BoltOutline, ClockCircleOutline, UserCheckOutline, UserCrossOutline } from 'solar-icon-set'

// ── Types ────────────────────────────────────────────────────────────────────

type CameraStatus = 'starting' | 'active' | 'permission_denied' | 'error'

interface ResultOverlay {
  type: 'success' | 'already_checked_in' | 'error' | 'pending' | 'rejected'
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
const CornerBrackets = () => (
  <svg
    viewBox="0 0 240 240"
    className="absolute inset-0 w-full h-full"
    fill="none"
    stroke="white"
    strokeWidth="3"
    strokeLinecap="round"
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

  // CameraOutline lifecycle — independent of result display
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('starting')
  const [retryAttempt, setRetryAttempt] = useState(1)   // 1–3, shown in spinner
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [isSwitching, setIsSwitching] = useState(false)

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

  // ── CameraOutline helpers ────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    if (videoEl?.srcObject) {
      const stream = videoEl.srcObject as MediaStream
      stream.getTracks().forEach((t) => t.stop())
      videoEl.srcObject = null
    }
  }, [videoEl])

  const initCamera = async (el: HTMLVideoElement, deviceId?: string): Promise<void> => {
    const { BrowserQRCodeReader } = await import('@zxing/browser')

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

      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoDevice(
        activeId || allDevices[0].deviceId,
        el,
        (res) => {
          if (res) void handleScannedToken(res.getText())
        }
      )
      controlsRef.current = controls
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
        return // success
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))

        // Permission denied — no retry, immediate terminal state
        if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
          setCameraStatus('permission_denied')
          return
        }

        // Final attempt failed — show error state
        if (attempt === MAX_ATTEMPTS) {
          setCameraStatus('error')
          return
        }
        // Otherwise loop to next attempt
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
    // Replace any existing overlay immediately (cancel its timer first)
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    overlayKeyCounterRef.current += 1   // new key forces AnimatePresence to remount the node
    setOverlayEntry({ data: next, key: overlayKeyCounterRef.current })
    // Pending overlay stays until the organizer taps Approve or Reject
    if (next.type !== 'pending') {
      overlayTimerRef.current = setTimeout(dismissOverlay, OVERLAY_DURATION_MS)
    }
  }

  const handleScannedToken = async (token: string) => {
    // Scan lock — zxing fires this callback many times/second for the same code
    if (isProcessingRef.current) return

    // Validate token format before sending to server (compact JWT: 3 base64url segments)
    if (!/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(token)) {
      showOverlay({ type: 'error', message: 'Invalid QR format.' })
      return
    }

    // Dynamic imports are cached after first load — no repeated network cost
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

      // Proactively force-refresh if token expires within 5 minutes.
      // getSession() reads from localStorage without a network call, so the stored
      // token may be expired if the background auto-refresh timer failed silently.
      const expiresAt = sessionData.session?.expires_at
      if (!expiresAt || expiresAt - Math.floor(Date.now() / 1000) < 300) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        if (refreshed.session?.access_token) {
          accessToken = refreshed.session.access_token
        }
      }

      // Keep the functions client in sync so any retry paths also use the fresh token
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
        // FunctionsHttpError stores the raw Response as error.context (body unread).
        // Read it to surface the actual gateway or function error message.
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
        // Member is pending — show approve/reject overlay (keeps scan lock held)
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

      showOverlay({
        type: 'success',
        memberName: data.member_name ?? 'Member',
        eventTitle: data.event_title ?? '',
        pointsAwarded: data.points_awarded ?? 0,
      })
    } catch {
      showOverlay({
        type: 'error',
        message: 'Scan failed. Try again.',
      })
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
    } catch (e) {
      showOverlay({
        type: 'error',
        message: e instanceof Error ? e.message : 'Action failed. Try again.',
      })
    }
  }

  // ── CameraOutline switching helpers ──────────────────────────────────────────────────

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

  // Start camera when video element mounts (callback ref fires after DOM commit)
  useEffect(() => {
    if (!videoEl) return
    void startCameraWithRetry(videoEl)
    return () => {
      cameraAbortRef.current = true
      stopCamera()
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    }
  }, [videoEl]) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black overflow-hidden">

      {/* Live camera feed */}
      <video
        ref={videoCallbackRef}
        className="absolute inset-0 w-full h-full object-cover"
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
          <div className="relative w-60 h-60">
            <CornerBrackets />
          </div>
          <p className="text-white/80 text-md3-body-md font-medium tracking-wide">
            {isSwitching ? 'Switching camera…' : 'Align QR to scan'}
          </p>
        </div>
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-[110] flex items-center justify-between px-4 pt-14 pb-4">
        <motion.button
          type="button"
          aria-label="Go back"
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-lg"
        >
          <ArrowLeftOutline className="w-5 h-5" color="white" />
        </motion.button>

        {devices.length >= 2 && (
          <motion.button
            type="button"
            aria-label="Switch camera lens"
            whileTap={{ scale: 0.9 }}
            onClick={cycleCamera}
            disabled={isSwitching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/20 backdrop-blur-md border border-white/30 disabled:opacity-40 shadow-lg transition-colors"
          >
            <CameraRotateOutline className="w-4 h-4" color="white" />
            <span className="text-white text-md3-label-md font-medium">Lens</span>
          </motion.button>
        )}
      </div>

      {/* ── iOS info chip ────────────────────────────────────────────────────── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 backdrop-blur rounded-full px-3 py-1.5 pointer-events-none">
        <InfoCircleOutline className="w-3 h-3 shrink-0" color="#FCD34D" />
        <p className="text-amber-200 text-[10px] font-medium whitespace-nowrap">
          For best results, use Chrome on Android
        </p>
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
            className="absolute bottom-0 left-0 right-0 z-[110] px-4 pb-10 cursor-pointer"
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

    </div>,
    document.body
  )
}
