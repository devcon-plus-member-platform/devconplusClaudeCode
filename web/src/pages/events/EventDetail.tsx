import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, MapPointOutline, TicketOutline, HeartOutline, CloseCircleOutline, ShareOutline, CopyOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { useEventsStore } from '../../stores/useEventsStore'
// import { useVolunteerStore } from '../../stores/useVolunteerStore' // disabled: volunteer-for-event feature
import { useAuthStore } from '../../stores/useAuthStore'
import { publicFetch } from '../../lib/api'
import { useChaptersStore } from '../../stores/useChaptersStore'
import NotFound from '../NotFound'
import { MarkdownContent } from '../../components/MarkdownContent'
import { slideUp, backdrop } from '../../lib/animation'

const VOLUNTEER_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSczVxZPmHIRPphNJNgbuRVzEC5QTponVzjDPPMmkSxP0cIdrg/viewform?embedded=true'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { events, registrations } = useEventsStore()
  const { user } = useAuthStore()
  const { getChapterById, fetchChapters } = useChaptersStore()
  // const { loadApplications, getApplicationByEventId } = useVolunteerStore() // disabled: volunteer-for-event feature

  const storeEvent = events.find((e) => e.slug === slug)
  const [localEvent, setLocalEvent] = useState<NonNullable<typeof storeEvent> | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [showVolunteerForm, setShowVolunteerForm] = useState(false)

  const event = storeEvent ?? localEvent ?? undefined

  // Fetch event directly when not available from the store (e.g. direct URL access).
  useEffect(() => {
    if (event || !slug) return
    setLoading(true)
    publicFetch<NonNullable<typeof storeEvent>[]>('/api/events')
      .then((data) => {
        const found = data.find((e) => e.slug === slug) ?? null
        if (!found) setNotFound(true)
        else setLocalEvent(found)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Disabled: volunteer-for-event feature — load volunteer applications for authenticated users
  // useEffect(() => {
  //   if (user) loadApplications()
  // }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const eventId = event?.id
  const reg = registrations.find((r) => r.event_id === eventId)
  // const volunteerApp = user && eventId ? getApplicationByEventId(eventId) : undefined // disabled: volunteer-for-event feature

  const isChapterLocked = event?.is_chapter_locked === true && event.chapter_id !== null && event.chapter_id !== user?.chapter_id
  const isExternal = event?.is_external === true

  useEffect(() => { void fetchChapters() }, [fetchChapters])

  const [shareToast, setShareToast] = useState(false)
  const eventChapterName = isChapterLocked && event?.chapter_id
    ? (getChapterById(event.chapter_id)?.name ?? null)
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || (!loading && !event)) return <NotFound />

  if (!event) return null

  const handleShare = async () => {
    const url = window.location.href
    if ('share' in navigator) {
      try {
        await navigator.share({ title: event.title, text: `${event.title} — DEVCON+`, url })
      } catch {
        // user cancelled — do nothing
      }
    } else {
      try {
        await (navigator as Navigator).clipboard.writeText(url)
        setShareToast(true)
        setTimeout(() => setShareToast(false), 2500)
      } catch {
        // clipboard unavailable
      }
    }
  }

  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'Date TBA'

  const registerPath = `/events/${slug}/register`
  const externalUrl = event.external_registration_url ?? ''

  const externalIsTba = externalUrl === 'tba' || externalUrl === ''

  const handleExternalRegistration = () => {
    if (externalIsTba) return
    window.open(externalUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <motion.div
      className="min-h-screen bg-slate-50"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Floating back + share buttons */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 pt-12 pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-white/40 transition-colors shadow-lg pointer-events-auto"
        >
          <ArrowLeftOutline className="w-5 h-5" color="white" />
        </button>
        <button
          onClick={() => void handleShare()}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-white/40 transition-colors shadow-lg pointer-events-auto"
          aria-label="Share event"
        >
          <ShareOutline className="w-5 h-5" color="white" />
        </button>
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
            className="w-full h-full bg-primary"
            style={{ backgroundImage: PATTERN_BG, backgroundSize: '60px 60px' }}
          />
        )}
      </header>

      <div className="p-4 space-y-4">
        <div>
          <p className="text-md3-label-md text-slate-400 mb-1">{dateStr}</p>
          <h1 className="text-md3-title-lg font-bold text-slate-900">{event.title}</h1>
          {event.location && (
            <p className="text-md3-body-md text-slate-500 mt-1 flex items-center gap-1">
              <MapPointOutline className="w-3.5 h-3.5 shrink-0" />
              {event.location}
            </p>
          )}
        </div>

        {!isExternal && (
          <div className="flex gap-3">
            <div className="bg-primary/10 rounded-xl px-3 py-2 flex-1 text-center">
              <p className="text-primary text-md3-label-md font-medium">Points Value</p>
              <p className="text-primary font-bold">+{event.points_value} pts</p>
            </div>
            <div className="bg-slate-100 rounded-xl px-3 py-2 flex-1 text-center">
              <p className="text-slate-500 text-md3-label-md font-medium">Status</p>
              <p className="text-slate-700 font-bold capitalize">{event.status}</p>
            </div>
          </div>
        )}


        {event.description && (
          <div>
            <h2 className="text-md3-body-md font-bold text-slate-900 mb-1">About</h2>
            <MarkdownContent value={event.description} />
          </div>
        )}

        {/* CTA based on auth + registration state */}
        <div className="pt-2 space-y-3">
          {isExternal ? (
            externalIsTba ? (
              <button
                disabled
                className="w-full bg-slate-200 text-slate-400 font-bold py-4 rounded-2xl cursor-not-allowed"
              >
                Registration Coming Soon
              </button>
            ) : (
              <button
                onClick={handleExternalRegistration}
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl"
              >
                Open Registration
              </button>
            )
          ) : !user ? (
            /* Public / unauthenticated view */
            <div className="space-y-2">
              <button
                onClick={() => navigate(`/sign-up?returnTo=${encodeURIComponent(registerPath)}`)}
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl"
              >
                Register for this Event
              </button>
            </div>
          ) : !reg ? (
            isChapterLocked ? (
              <div className="w-full bg-amber-50 border border-amber-200 text-amber-700 font-semibold py-4 rounded-2xl text-center text-md3-body-md">
                This event is exclusive to {eventChapterName ?? "this chapter's"} members
              </div>
            ) : (
              <button
                onClick={() => navigate(registerPath)}
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl"
              >
                Request to Join
              </button>
            )
          ) : reg.status === 'pending' ? (
            <button
              onClick={() => navigate(`/events/${slug}/pending`)}
              className="w-full bg-yellow-400 text-white font-bold py-4 rounded-2xl"
            >
              View Pending Status
            </button>
          ) : reg.status === 'approved' ? (
            <button
              onClick={() => navigate(`/events/${slug}/ticket`)}
              className="w-full bg-green text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
            >
              <TicketOutline className="w-5 h-5" />
              View My Ticket
            </button>
          ) : (
            <div className="w-full bg-red/10 text-red font-semibold py-4 rounded-2xl text-center">
              Registration Rejected
            </div>
          )}

          {/* Disabled: volunteer-for-event feature — restore by uncommenting the block below
          {user && event.status === 'upcoming' && (
            isChapterLocked ? (
              <div className="w-full bg-amber-50 border border-amber-200 text-amber-700 font-semibold py-4 rounded-2xl text-center text-md3-body-md">
                This event is exclusive to {eventChapterName ?? "this chapter's"} members
              </div>
            ) : volunteerApp ? (
              <div className="w-full border border-slate-200 rounded-xl py-3 px-4 flex items-center justify-center gap-2">
                <HeartOutline className="w-4 h-4" color="#94A3B8" />
                <span className="text-md3-body-md font-medium text-slate-500">
                  Volunteer Application:{' '}
                  <span
                    className={
                      volunteerApp.status === 'approved'
                        ? 'text-green font-semibold'
                        : volunteerApp.status === 'rejected'
                          ? 'text-red font-semibold'
                          : 'text-yellow-500 font-semibold'
                    }
                  >
                    {volunteerApp.status.charAt(0).toUpperCase() + volunteerApp.status.slice(1)}
                  </span>
                </span>
              </div>
            ) : (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/events/${slug}/volunteer`)}
                className="w-full border border-primary text-primary font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
              >
                <HeartOutline className="w-5 h-5" />
                Volunteer for this Event
              </motion.button>
            )
          )}
          */}

          {/* Future Volunteer CTA — shown to all visitors */}
          {!isExternal && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowVolunteerForm(true)}
              className="w-full border border-primary text-primary font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
            >
              <HeartOutline color="rgb(var(--color-primary))" size={20} />
              Apply as Future Volunteer
            </motion.button>
          )}
        </div>
      </div>

      {/* Future Volunteer Google Form bottom sheet */}
      <AnimatePresence>
        {showVolunteerForm && (
          <>
            <motion.div
              key="backdrop"
              variants={backdrop}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
              onClick={() => setShowVolunteerForm(false)}
            />
            <motion.div
              key="sheet"
              variants={slideUp}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="fixed bottom-0 left-0 right-0 z-[80] bg-white rounded-t-3xl overflow-hidden"
              style={{ height: '88dvh' }}
            >
              {/* Sheet header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div>
                  <p className="text-md3-label-md font-bold text-slate-900">Apply as Future Volunteer</p>
                  <p className="text-md3-label-sm text-slate-400">DEVCON Philippines</p>
                </div>
                <button
                  onClick={() => setShowVolunteerForm(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  <CloseCircleOutline color="#64748B" size={20} />
                </button>
              </div>

              {/* Embedded Google Form */}
              <iframe
                src={VOLUNTEER_FORM_URL}
                title="Apply as Future Volunteer"
                className="w-full h-full border-0"
                style={{ height: 'calc(88dvh - 57px)' }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
