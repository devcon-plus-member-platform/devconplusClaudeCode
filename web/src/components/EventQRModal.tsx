import { useCallback, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { toPng } from 'html-to-image'
import { CloseCircleOutline, DownloadOutline, LinkOutline, QRCodeOutline } from 'solar-icon-set'
import { toast } from 'sonner'
import type { Event } from '@devcon-plus/supabase'
import { backdrop } from '../lib/animation'

const PIXEL_RATIO = 3 // upscale on export so print/large-screen QR stays crisp

/** Centered modal entrance (mirrors WheelPoster's popIn). */
const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  exit: { opacity: 0, scale: 0.92, transition: { duration: 0.15 } },
}

interface EventQRModalProps {
  event: Event
  onClose: () => void
}

/**
 * A plain "QR only" modal for an event — no poster branding, just the raffle/
 * registration QR blown up large enough to scan off a projector or from across
 * the room. Offers a high-res PNG download and a copy-link action. The QR encodes
 * the public event page (/events/:slug), where attendees register (which enters
 * them into the raffle wheel pool). Compare WheelPoster, which wraps the same QR
 * in full branded poster artwork.
 */
export default function EventQRModal({ event, onClose }: EventQRModalProps) {
  const [isExporting, setIsExporting] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  const registerUrl = event.slug ? `${window.location.origin}/events/${event.slug}` : ''
  const fileSlug = (event.slug || 'event').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()

  const handleDownload = useCallback(async () => {
    if (!qrRef.current) return
    setIsExporting(true)
    try {
      const dataUrl = await toPng(qrRef.current, {
        pixelRatio: PIXEL_RATIO,
        cacheBust: true,
        backgroundColor: '#FFFFFF',
      })
      const link = document.createElement('a')
      link.download = `devcon-event-qr-${fileSlug}.png`
      link.href = dataUrl
      link.click()
      toast.success('QR code downloaded')
    } catch (err) {
      console.error('[EventQRModal] PNG export failed', err)
      toast.error('Could not generate the QR image')
    } finally {
      setIsExporting(false)
    }
  }, [fileSlug])

  const handleCopyLink = useCallback(async () => {
    if (!registerUrl) return
    try {
      await navigator.clipboard.writeText(registerUrl)
      toast.success('Registration link copied to clipboard')
    } catch {
      // Clipboard API unavailable (insecure context / older browser).
      toast.message('Copy this link', { description: registerUrl })
    }
  }, [registerUrl])

  return (
    <motion.div
      variants={backdrop}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClose}
      className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
    >
      <motion.div
        variants={popIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-md3-title-lg font-black text-slate-900">Event QR code</h2>
            <p className="mt-0.5 text-md3-body-sm text-slate-500">
              Attendees scan this to open “{event.title}” and register.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-xl p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <CloseCircleOutline color="#94A3B8" size={26} />
          </button>
        </div>

        {/* ── QR card (the captured node) ── */}
        <div className="mt-5 flex justify-center">
          <div ref={qrRef} className="flex flex-col items-center rounded-3xl bg-white p-6">
            <QRCodeSVG
              value={registerUrl}
              size={260}
              level="M"
              fgColor="#1E2A56"
              bgColor="#FFFFFF"
              style={{ width: 'min(260px, 62vw)', height: 'auto' }}
            />
            <p className="mt-4 flex items-center gap-1.5 text-md3-body-sm font-bold text-slate-700">
              <QRCodeOutline color="#1E2A56" size={16} />
              Scan to register
            </p>
            <p className="mt-1 max-w-[240px] break-words text-center text-md3-label-md text-slate-400">
              {event.title}
            </p>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 text-md3-title-md font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <LinkOutline color="#334155" size={20} />
            Copy link
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isExporting}
            className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-md3-title-md font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            <DownloadOutline color="#fff" size={20} />
            {isExporting ? 'Generating…' : 'Download PNG'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
