import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Event } from '@devcon-plus/supabase'
import { publicFetch } from '../../lib/api'
import RafflePosterArt, { POSTER_BG, POSTER_DIMS, type PosterOrientation } from '../../components/RafflePosterArt'

/** Track the viewport so the poster can pick an orientation and scale to fit. */
function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  return vp
}

/**
 * Public, full-screen poster page (`/wheel/:eventId/poster`). Renders the same
 * branded raffle artwork as the in-app generator, but picks portrait or landscape
 * to match the viewer's screen and scales it to fill — so one shared link looks
 * right on a phone, a tablet, or a projector.
 */
export default function WheelPosterPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading')
  const vp = useViewport()

  useEffect(() => {
    let active = true
    publicFetch<Event[]>('/api/events')
      .then((data) => {
        if (!active) return
        const match = data.find((e) => e.id === eventId)
        setEvent(match ?? null)
        setStatus(match ? 'ready' : 'notfound')
      })
      .catch(() => {
        if (!active) return
        setStatus('notfound')
      })
    return () => {
      active = false
    }
  }, [eventId])

  useEffect(() => {
    if (event) document.title = `${event.title} — Raffle Poster`
  }, [event])

  // Orientation follows the screen; scale fits the chosen layout inside it.
  const orientation: PosterOrientation = vp.w < vp.h ? 'portrait' : 'landscape'
  const dims = POSTER_DIMS[orientation]
  const scale = Math.min(vp.w / dims.w, vp.h / dims.h) * 0.94

  return (
    <div
      className="flex h-screen w-screen items-center justify-center overflow-hidden"
      style={{ background: '#1E2A56' }}
    >
      {status === 'loading' && (
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white"
          aria-label="Loading poster"
        />
      )}

      {status === 'notfound' && (
        <div className="px-6 text-center text-white">
          <p className="text-md3-title-lg font-black">Poster unavailable</p>
          <p className="mt-2 text-md3-body-md text-white/70">
            This raffle event could not be found, or it is no longer public.
          </p>
        </div>
      )}

      {status === 'ready' && event && (
        <div style={{ width: dims.w * scale, height: dims.h * scale, background: POSTER_BG }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <RafflePosterArt event={event} orientation={orientation} />
          </div>
        </div>
      )}
    </div>
  )
}
