import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftOutline, BoltOutline, PenOutline, UserSpeakOutline, MapPointOutline, ShareOutline, CopyOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { useEventsStore } from '../../../stores/useEventsStore'
import { fadeUp, staggerContainer, cardItem } from '../../../lib/animation'
import SendAnnouncementSheet from '../../../components/SendAnnouncementSheet'
import { MarkdownContent } from '../../../components/MarkdownContent'
import { apiFetch } from '../../../lib/api'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export function OrgEventDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { events, fetchEvents, isLoading } = useEventsStore()
  const [showAnnounce, setShowAnnounce] = useState(false)
  const [shareToast, setShareToast]     = useState(false)
  const [statsTotal, setStatsTotal]       = useState(0)
  const [statsPending, setStatsPending]   = useState(0)
  const [statsCheckedIn, setStatsCheckedIn] = useState(0)

  useEffect(() => {
    if (events.length === 0) void fetchEvents()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return
    // Read stats from the same chapter-scoped backend endpoint the Registrants
    // screen uses, so the two screens can never disagree and the same
    // authorization applies (officers can't see counts they can't manage).
    void (async () => {
      try {
        const data = await apiFetch<Array<{ status: string; checked_in: boolean }>>(
          `/api/registrations/event/${id}`,
        )
        setStatsTotal(data.length)
        setStatsPending(data.filter((r) => r.status === 'pending').length)
        setStatsCheckedIn(data.filter((r) => r.checked_in).length)
      } catch {
        // Not authorized (e.g. officer on an HQ event) or load failure —
        // leave counts at 0; the Registrants screen surfaces the reason.
        setStatsTotal(0)
        setStatsPending(0)
        setStatsCheckedIn(0)
      }
    })()
  }, [id])

  const event = events.find((e) => e.id === id)
  if (!event) {
    // While the store is still loading we don't yet know whether the event exists —
    // show a spinner instead of flashing "Event not found".
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
        ) : (
          <p className="text-slate-400">Event not found.</p>
        )}
      </div>
    )
  }

  const formattedDate = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-PH', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date TBA'

  // Share the public, attendee-facing event page (/events/:slug), never the
  // organizer management URL. `slug` is NOT NULL in the DB, but the generated
  // type is `string | null`, so guard to avoid ever emitting `/events/null`.
  const publicUrl = event.slug ? `${window.location.origin}/events/${event.slug}` : null

  const handleShare = async () => {
    if (!publicUrl) return
    if ('share' in navigator) {
      try {
        await navigator.share({ title: event.title, text: `${event.title} — DEVCON+`, url: publicUrl })
      } catch {
        // user cancelled — do nothing
      }
    } else {
      try {
        await (navigator as Navigator).clipboard.writeText(publicUrl)
        setShareToast(true)
        setTimeout(() => setShareToast(false), 2500)
      } catch {
        // clipboard unavailable
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Floating back + edit buttons (Sticky/Fixed) */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 pt-12 pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-black/40 transition-colors shadow-lg pointer-events-auto"
        >
          <ArrowLeftOutline className="w-5 h-5" color="white" />
        </button>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => void handleShare()}
            className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-black/40 transition-colors shadow-lg"
            aria-label="Share event"
          >
            <ShareOutline className="w-5 h-5" color="white" />
          </button>
          <button
            onClick={() => navigate(`/organizer/events/${id}/edit`)}
            className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-black/40 transition-colors shadow-lg"
            aria-label="Edit event"
          >
            <PenOutline className="w-4 h-4" color="white" />
          </button>
        </div>
      </div>

      {/* Clipboard copy toast */}
      <AnimatePresence>
        {shareToast && (
          <motion.div
            key="share-toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed bottom-28 inset-x-0 mx-auto w-fit z-[100] flex items-center gap-2 bg-slate-900/90 backdrop-blur-md text-white text-[13px] font-proxima font-semibold px-4 py-2.5 rounded-full shadow-xl whitespace-nowrap"
          >
            <CopyOutline color="white" size={14} />
            Link copied to clipboard
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <header 
        className="relative z-50 h-60 bg-slate-200 overflow-hidden"
        style={{ clipPath: 'ellipse(100% 100% at 50% 0%)' }}
      >
        {event.cover_image_url ? (
          <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full bg-[#1152d4]"
            style={{ backgroundImage: PATTERN_BG, backgroundSize: '60px 60px' }}
          />
        )}
      </header>

      <motion.div
        className="p-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Title & Info section (Similar to Member Side) */}
        <motion.div variants={fadeUp} className="mb-6">
          <p className="text-md3-label-md text-slate-400 mb-1">{formattedDate}</p>
          <h1 className="text-md3-title-lg font-bold text-slate-900">{event.title}</h1>
          {event.location && (
            <p className="text-md3-body-md text-slate-500 mt-1 flex items-center gap-1">
              <MapPointOutline className="w-3.5 h-3.5 shrink-0" />
              {event.location}
            </p>
          )}
        </motion.div>

        {/* Stats row */}
        <motion.div variants={staggerContainer} className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Registrations', value: statsTotal,     color: 'text-blue' },
            { label: 'Pending',       value: statsPending,  color: 'text-yellow-500' },
            { label: 'Checked In',    value: statsCheckedIn, color: 'text-green' },
          ].map(({ label, value, color }) => (
            <motion.div
              key={label}
              variants={cardItem}
              className="bg-white rounded-xl border border-slate-200 p-4 text-center"
            >
              <p className={`text-md3-headline-sm font-black ${color}`}>{value}</p>
              <p className="text-md3-label-md text-slate-400 mt-1">{label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Detail card */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-md3-label-md font-semibold text-blue bg-blue/10 px-2.5 py-1 rounded-full flex items-center gap-1">
              <BoltOutline className="w-3 h-3" />
              {event.points_value} XP
            </span>
            {event.requires_approval && (
              <span className="text-md3-label-md font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full">
                Approval Required
              </span>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-md3-label-md font-bold uppercase tracking-wide text-slate-400 mb-2">About</p>
            <MarkdownContent value={event.description ?? ''} />
          </div>
        </motion.div>

        <motion.button
          variants={fadeUp}
          onClick={() => setShowAnnounce(true)}
          className="w-full py-3 mb-3 border border-blue/30 text-blue text-md3-body-md font-bold rounded-xl
                     hover:bg-blue/5 transition-colors flex items-center justify-center gap-2"
          whileTap={{ scale: 0.98 }}
        >
          <UserSpeakOutline className="w-4 h-4" />
          Send Announcement
        </motion.button>

        <motion.button
          variants={fadeUp}
          onClick={() => navigate(`/organizer/events/${event.id}/registrants`)}
          className="w-full py-3 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
          whileTap={{ scale: 0.98 }}
        >
          View Registrants
        </motion.button>
      </motion.div>

      <SendAnnouncementSheet
        eventId={event.id}
        eventTitle={event.title}
        isOpen={showAnnounce}
        onClose={() => setShowAnnounce(false)}
      />

    </div>
  )
}
