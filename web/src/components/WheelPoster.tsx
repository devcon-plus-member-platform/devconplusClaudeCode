import { useCallback, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { toPng } from 'html-to-image'
import { CloseCircleOutline, DownloadOutline, LinkOutline } from 'solar-icon-set'
import { toast } from 'sonner'
import type { Event } from '@devcon-plus/supabase'
import { backdrop } from '../lib/animation'
import RafflePosterArt, { POSTER_DIMS, type PosterOrientation } from './RafflePosterArt'

const PREVIEW_SCALE = 0.66
const PIXEL_RATIO = 3 // upscale on export so print/large-screen QR stays crisp

/** Centered modal entrance (mirrors WheelPage's popIn). */
const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  exit: { opacity: 0, scale: 0.92, transition: { duration: 0.15 } },
}

interface WheelPosterProps {
  event: Event
  onClose: () => void
}

/**
 * Generates a branded raffle poster for an event. Two ways to use the output:
 *  • Download a high-resolution PNG (vertical or landscape), or
 *  • Copy a public link to a responsive poster page (/wheel/:eventId/poster)
 *    that adapts to whatever screen — phone, tablet, or projector — opens it.
 */
export default function WheelPoster({ event, onClose }: WheelPosterProps) {
  const [orientation, setOrientation] = useState<PosterOrientation>('portrait')
  const [isExporting, setIsExporting] = useState(false)
  const posterRef = useRef<HTMLDivElement>(null)

  const dims = POSTER_DIMS[orientation]
  const publicUrl = `${window.location.origin}/wheel/${event.id}/poster`
  const fileSlug = (event.slug || 'event').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()

  const handleDownload = useCallback(async () => {
    if (!posterRef.current) return
    setIsExporting(true)
    try {
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: PIXEL_RATIO,
        cacheBust: true,
        backgroundColor: '#1E2A56',
      })
      const link = document.createElement('a')
      link.download = `devcon-raffle-poster-${fileSlug}-${orientation}.png`
      link.href = dataUrl
      link.click()
      toast.success('Poster downloaded')
    } catch (err) {
      console.error('[WheelPoster] PNG export failed', err)
      toast.error('Could not generate the poster image')
    } finally {
      setIsExporting(false)
    }
  }, [fileSlug, orientation])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success('Public poster link copied to clipboard')
    } catch {
      // Clipboard API unavailable (insecure context / older browser).
      toast.message('Copy this link', { description: publicUrl })
    }
  }, [publicUrl])

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
        className="my-auto w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-md3-title-lg font-black text-slate-900">Raffle poster</h2>
            <p className="mt-0.5 text-md3-body-sm text-slate-500">
              A QR poster for “{event.title}”. Download it, or share a link that fits any screen.
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

        {/* ── Orientation toggle (affects the PNG; the link auto-fits any screen) ── */}
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(['portrait', 'landscape'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrientation(o)}
              className={`rounded-lg py-2 text-md3-label-lg font-bold transition ${
                orientation === o ? 'bg-primary text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              {o === 'portrait' ? 'Vertical' : 'Landscape'}
            </button>
          ))}
        </div>

        {/* ── Poster preview (the captured node, scaled down via CSS) ── */}
        <div className="mt-5 flex justify-center overflow-auto rounded-2xl bg-slate-100 p-5">
          <div style={{ width: dims.w * PREVIEW_SCALE, height: dims.h * PREVIEW_SCALE }} className="shrink-0">
            <div
              style={{
                width: dims.w,
                height: dims.h,
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: 'top left',
              }}
            >
              {/* posterRef wraps the natural-size artwork html-to-image captures */}
              <div ref={posterRef}>
                <RafflePosterArt event={event} orientation={orientation} />
              </div>
            </div>
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
            Copy public link
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
