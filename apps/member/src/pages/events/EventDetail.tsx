import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, MapPointOutline, TicketOutline, HeartOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useEventsStore } from '../../stores/useEventsStore'
import { useVolunteerStore } from '../../stores/useVolunteerStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase } from '../../lib/supabase'
import NotFound from '../NotFound'
import { MarkdownContent } from '../../components/MarkdownContent'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { events, registrations } = useEventsStore()
  const { user } = useAuthStore()
  const { loadApplications, getApplicationByEventId } = useVolunteerStore()

  const storeEvent = events.find((e) => e.slug === slug)
  const [localEvent, setLocalEvent] = useState<NonNullable<typeof storeEvent> | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const event = storeEvent ?? localEvent ?? undefined

  // Fetch event directly when not available from the authenticated store
  useEffect(() => {
    if (event || !slug) return
    setLoading(true)
    supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true)
        } else {
          setLocalEvent(data as NonNullable<typeof storeEvent>)
        }
        setLoading(false)
      })
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only load volunteer applications for authenticated users
  useEffect(() => {
    if (user) loadApplications()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const eventId = event?.id
  const reg = registrations.find((r) => r.event_id === eventId)
  const volunteerApp = user && eventId ? getApplicationByEventId(eventId) : undefined

  const isChapterLocked = event?.is_chapter_locked === true && event.chapter_id !== user?.chapter_id

  const [eventChapterName, setEventChapterName] = useState<string | null>(null)
  useEffect(() => {
    if (isChapterLocked && event?.chapter_id) {
      supabase
        .from('chapters')
        .select('name')
        .eq('id', event.chapter_id)
        .single()
        .then(({ data }) => setEventChapterName(data?.name ?? null))
    }
  }, [isChapterLocked, event?.chapter_id])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || (!loading && !event)) return <NotFound />

  if (!event) return null

  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : 'Date TBA'

  const registerPath = `/events/${slug}/register`

  return (
    <motion.div
      className="min-h-screen bg-slate-50"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* Floating back button (Sticky/Fixed) */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 pt-12 pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-white/40 transition-colors shadow-lg pointer-events-auto"
        >
          <ArrowLeftOutline className="w-5 h-5" color="white" />
        </button>
      </div>

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

        {event.description && (
          <div>
            <h2 className="text-md3-body-md font-bold text-slate-900 mb-1">About</h2>
            <MarkdownContent value={event.description} />
          </div>
        )}

        {/* CTA based on auth + registration state */}
        <div className="pt-2 space-y-3">
          {!user ? (
            /* Public / unauthenticated view */
            <button
              onClick={() => navigate(`/sign-up?returnTo=${encodeURIComponent(registerPath)}`)}
              className="w-full bg-primary text-white font-bold py-4 rounded-2xl"
            >
              Create Account & Register
            </button>
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

          {/* Volunteer CTA — only for authenticated members on upcoming events */}
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
        </div>
      </div>
    </motion.div>
  )
}
