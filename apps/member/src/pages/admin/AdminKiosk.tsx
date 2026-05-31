import { useEffect, useRef, useState } from 'react'
import { ScannerOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'

interface CheckInResult {
  memberName: string
  pointsAwarded: number
}

export default function AdminKiosk() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const processingRef = useRef(false)

  const [now, setNow] = useState(new Date())
  const [dailyCount, setDailyCount] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)
  const [countdown, setCountdown] = useState(3)
  const [resumeTick, setResumeTick] = useState(0)

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch today's check-in count from point_transactions
  const fetchDailyCount = async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('point_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'event_attendance')
      .gte('created_at', todayStart.toISOString())
    setDailyCount(count ?? 0)
  }

  const stopScanning = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
  }

  const startCamera = async () => {
    if (controlsRef.current || processingRef.current) return
    try {
      const reader = new BrowserQRCodeReader()
      const allDevices = await BrowserQRCodeReader.listVideoInputDevices()
      if (!allDevices.length) {
        toast.error('No camera detected. Please connect a camera and refresh.', { duration: 8000 })
        return
      }

      const controls = await reader.decodeFromVideoDevice(
        allDevices[0].deviceId,
        videoRef.current!,
        (res, err) => {
          if (res && !processingRef.current) {
            processingRef.current = true
            stopScanning()
            void handleScanned(res.getText())
          } else if (err && err.name !== 'NotFoundException') {
            // suppress NotFoundException — expected when no QR in frame
          }
        }
      )
      controlsRef.current = controls
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera access failed.'
      console.error('[Kiosk] CameraOutline init failed:', e)
      toast.error(`Camera error: ${msg}`, { duration: 6000 })
    }
  }

  const handleScanned = async (token: string) => {
    // Use getState() to avoid stale closure on user
    const currentUser = useAuthStore.getState().user
    if (!currentUser) {
      processingRef.current = false
      void startCamera()
      return
    }

    const { data } = await supabase.functions.invoke<{
      success: boolean
      member_name?: string
      points_awarded?: number
      error?: string
    }>('award-points-on-scan', {
      body: { qr_code_token: token, organizer_id: currentUser.id },
    })

    if (data?.success) {
      setLastResult({
        memberName: data.member_name ?? 'Member',
        pointsAwarded: data.points_awarded ?? 0,
      })
      setDailyCount(c => c + 1)
      setCountdown(3)
      setShowSuccess(true)
    } else {
      const errMsg = data?.error ?? 'QR code could not be processed. Please try again.'
      toast.error(errMsg, { duration: 4000 })
      processingRef.current = false
      void startCamera()
    }
  }

  // Auto-close countdown when success modal is visible
  useEffect(() => {
    if (!showSuccess) return
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(id)
          setShowSuccess(false)
          setResumeTick(t => t + 1) // signal camera resume
          return 3
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [showSuccess])

  // Resume camera whenever resumeTick increments (auto-close path)
  useEffect(() => {
    if (resumeTick === 0) return
    processingRef.current = false
    void startCamera()
  }, [resumeTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss modal manually (tap-to-dismiss path)
  const dismissModal = () => {
    setShowSuccess(false)
    processingRef.current = false
    void startCamera()
  }

  // Mount: fetch count + start camera
  useEffect(() => {
    void fetchDailyCount()
    void startCamera()
    return () => stopScanning()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dateStr = now.toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })

  return (
    <div className="relative w-full h-full bg-slate-900 flex flex-col overflow-hidden select-none">

      {/* Header */}
      <div className="shrink-0 px-8 pt-7 pb-4">
        <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.25em] mb-1">DEVCON+</p>
        <h1 className="text-white text-md3-headline-lg font-black tracking-wide leading-none">DAILY ATTENDANCE</h1>
        <p className="text-white/50 text-md3-body-md mt-2 leading-tight">{dateStr}</p>
        <p className="text-white text-md3-headline-sm font-mono font-semibold mt-0.5 tabular-nums">{timeStr}</p>
      </div>

      {/* CameraOutline viewfinder */}
      <div className="flex-1 flex items-center justify-center px-8 min-h-0 py-2">
        <div className="relative w-full max-w-xl aspect-square bg-black rounded-2xl overflow-hidden shadow-2xl">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />

          {/* Corner-bracket overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-72">
              {/* Top-left */}
              <span className="absolute top-0 left-0 w-9 h-9 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
              {/* Top-right */}
              <span className="absolute top-0 right-0 w-9 h-9 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
              {/* Bottom-left */}
              <span className="absolute bottom-0 left-0 w-9 h-9 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
              {/* Bottom-right */}
              <span className="absolute bottom-0 right-0 w-9 h-9 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
            </div>
          </div>

          {/* Live indicator (top-left) */}
          <div className="absolute top-4 left-4 flex items-center gap-1.5 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-white/70 text-md3-label-md font-semibold tracking-wide">LIVE</span>
          </div>

          {/* Instruction (bottom) */}
          <div className="absolute bottom-5 left-0 right-0 text-center pointer-events-none">
            <p className="text-white/70 text-md3-label-md font-medium tracking-wide">
              Position QR code within frame
            </p>
          </div>
        </div>
      </div>

      {/* Footer — daily count */}
      <div className="shrink-0 px-8 pb-7 pt-3 flex justify-center">
        <div className="inline-flex items-center gap-3 bg-white/[0.07] border border-white/10 rounded-2xl px-7 py-4">
          <ScannerOutline className="w-5 h-5" color="rgba(255,255,255,0.4)" />
          <div className="flex items-baseline gap-2">
            <span className="text-white text-md3-headline-lg font-black tabular-nums leading-none">{dailyCount}</span>
            <span className="text-white/40 text-md3-body-md">checked in today</span>
          </div>
        </div>
      </div>

      {/* Success modal overlay */}
      <AnimatePresence>
        {showSuccess && lastResult && (
          <motion.div
            key="kiosk-success"
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm cursor-pointer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissModal}
          >
            <motion.div
              className="bg-white rounded-3xl p-8 mx-8 max-w-xs w-full text-center shadow-2xl"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, transition: { type: 'spring', damping: 18, stiffness: 260 } }}
              exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.15 } }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Animated green check ring */}
              <div className="w-20 h-20 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-5">
                <motion.div
                  className="w-14 h-14 rounded-full bg-green flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, transition: { type: 'spring', damping: 14, delay: 0.05 } }}
                >
                  <svg
                    className="w-7 h-7 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </motion.div>
              </div>

              <p className="text-md3-label-md font-bold text-slate-400 uppercase tracking-widest mb-1">Check-in Successful</p>
              <p className="text-md3-headline-sm font-black text-slate-900 leading-tight mb-1">{lastResult.memberName}</p>
              {lastResult.pointsAwarded > 0 && (
                <p className="text-md3-body-md font-bold text-green mb-0.5">+{lastResult.pointsAwarded} XP awarded</p>
              )}
              <p className="text-md3-label-md text-slate-400 mb-5">
                {now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>

              {/* 3-second progress bar — key resets animation on each new check-in */}
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2.5">
                <motion.div
                  key={dailyCount}
                  className="h-full bg-green rounded-full origin-left"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 3, ease: 'linear' }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Auto-closing in {countdown}s · Tap anywhere to dismiss
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
