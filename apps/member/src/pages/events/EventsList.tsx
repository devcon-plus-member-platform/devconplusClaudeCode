import { useState, useEffect, useDeferredValue, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { UsersGroupRoundedOutline, MapPointOutline, AltArrowRightOutline, TicketOutline, ClockCircleOutline, CalendarMarkOutline, CheckCircleOutline, CloseCircleLineDuotone, FilterLinear, MagniferOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../stores/useAuthStore'
import { useEventsStore } from '../../stores/useEventsStore'
import EventCard from '../../components/EventCard'
import { SkeletonEventCard, SkeletonFeaturedEvent } from '../../components/Skeleton'
import { staggerContainer, cardItem, fadeUp } from '../../lib/animation'
import { isEventArchived } from '../../lib/dates'
import { supabase } from '../../lib/supabase'
import { fuzzySearchFilter } from '../../lib/utils'
import SearchBar from '../../components/SearchBar'
import SearchEmptyState from '../../components/SearchEmptyState'
import type { Event, EventRegistration, Chapter } from '@devcon-plus/supabase'

// Flower-of-life pattern matching Rewards/Dashboard
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

const REGIONS = ['Luzon', 'Visayas', 'Mindanao'] as const

type EventFilter = 'all' | 'near_you' | 'devcon_only' | 'featured'

const EVENT_FILTERS: { id: EventFilter; label: string }[] = [
  { id: 'near_you', label: 'Near You' },
  { id: 'all', label: 'All Events' },
  { id: 'devcon_only', label: 'DEVCON' },
  { id: 'featured', label: 'Featured' },
]

function formatEventDate(iso: string): { month: string; day: string } {
  const d = new Date(iso)
  return {
    month: d.toLocaleDateString('en-PH', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
  }
}

type TicketEntry = { reg: EventRegistration; event: Event }

function getEventLifecycleState(ev: Event): 'in_progress' | 'done' | 'normal' {
  const now = new Date()
  if (isEventArchived(ev, now)) return 'done'
  if (ev.event_date && new Date(ev.event_date) <= now) return 'in_progress'
  return 'normal'
}

export default function EventsList() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { events, registrations, fetchEvents, fetchRegistrations, isLoading } = useEventsStore()
  const [tab, setTab] = useState<'discover' | 'tickets'>('discover')

  const [isSearchVisible, setIsSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Event type filter (chip bar)
  const [eventFilter, setEventFilter] = useState<EventFilter>('near_you')

  // Chapter filter state
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [regionChapterIds, setRegionChapterIds] = useState<Set<string>>(new Set())
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [showChapterSheet, setShowChapterSheet] = useState(false)
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, number>>({})
  const [attendeeDetails, setAttendeeDetails] = useState<Record<string, { avatar_url: string | null; full_name: string }[]>>({})

  useEffect(() => {
    void fetchEvents()
    if (user?.id) void fetchRegistrations(user.id)

    if (!user?.id) return

    supabase
      .from('event_registrations')
      .select('event_id, profiles(avatar_url, full_name)')
      .eq('status', 'approved')
      .order('registered_at', { ascending: false })
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        const details: Record<string, { avatar_url: string | null; full_name: string }[]> = {}

        data?.forEach((row) => {
          if (row.event_id == null) return
          counts[row.event_id] = (counts[row.event_id] ?? 0) + 1

          if (!details[row.event_id]) details[row.event_id] = []
          if (row.profiles && details[row.event_id].length < 1) {
            const p = row.profiles as unknown as { avatar_url: string | null; full_name: string }
            details[row.event_id].push(p)
          }
        })

        setAttendeeCounts(counts)
        setAttendeeDetails(details)
      })

    // Try to fetch real chapters; fall back silently on error
    supabase
      .from('chapters')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) {
          setChapters(data as Chapter[])
        }
      })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const chapterId = user?.chapter_id
    if (!chapterId) return

    void (async () => {
      const { data: ownChapter } = await supabase
        .from('chapters')
        .select('region')
        .eq('id', chapterId)
        .single()
      if (!ownChapter?.region) return

      const { data: siblings } = await supabase
        .from('chapters')
        .select('id')
        .eq('region', ownChapter.region)
      if (siblings) {
        setRegionChapterIds(new Set(siblings.map((c) => c.id)))
      }
    })()
  }, [user?.chapter_id])

  const toggleSearch = () => {
    setIsSearchVisible(!isSearchVisible)
    if (isSearchVisible) {
      setSearchQuery('')
    }
  }

  const trimmedQuery = searchQuery.trim()
  const deferredQuery = useDeferredValue(trimmedQuery)

  // Stage 1: event-type chip filter
  const typeFilteredEvents = useMemo(() => {
    switch (eventFilter) {
      case 'near_you':
        if (regionChapterIds.size > 0) return events.filter((e) => e.chapter_id && regionChapterIds.has(e.chapter_id))
        return user?.chapter_id ? events.filter((e) => e.chapter_id === user.chapter_id) : events
      case 'devcon_only':
        return events.filter((e) => !e.devcon_category || e.devcon_category === 'devcon')
      case 'featured':
        return events.filter((e) => e.is_featured)
      default:
        return events
    }
  }, [events, eventFilter, user?.chapter_id, regionChapterIds])

  // Stage 2: chapter sheet filter stacked on top
  const { chapterFilteredEvents, activeEvents } = useMemo(() => {
    const chapterFilteredEvents = selectedChapterId
      ? typeFilteredEvents.filter((e) => e.chapter_id === selectedChapterId)
      : typeFilteredEvents
    return { chapterFilteredEvents, activeEvents: chapterFilteredEvents.filter((e) => !isEventArchived(e)) }
  }, [typeFilteredEvents, selectedChapterId])

  const { matchingEvents, featuredEvent, displayEvents, showHero } = useMemo(() => {
    const matchingEvents = activeEvents.filter(event =>
      fuzzySearchFilter(deferredQuery, event, ['title', 'description', 'location'])
    )
    const featuredEvent = activeEvents.find((e) => e.is_featured) ?? activeEvents[0]
    const displayEvents = deferredQuery
      ? matchingEvents
      : activeEvents.filter((e) => e.id !== featuredEvent?.id)
    return { matchingEvents, featuredEvent, displayEvents, showHero: !deferredQuery && !!featuredEvent }
  }, [activeEvents, deferredQuery])

  const selectedChapterName = selectedChapterId
    ? (chapters.find((c) => c.id === selectedChapterId)?.name ?? null)
    : 'All Chapters'

  // We use events.find on the FULL list to ensure tickets show even if they are for a different chapter
  const allTickets: TicketEntry[] = useMemo(() => registrations
    .filter((r) => r.status === 'approved' || r.status === 'pending')
    .map((r) => ({ reg: r, event: events.find((e) => e.id === r.event_id) }))
    .filter((item): item is TicketEntry => item.event !== undefined)
    .sort((a, b) => (a.reg.status === 'approved' ? -1 : 1) - (b.reg.status === 'approved' ? -1 : 1)),
  [registrations, events])

  const filteredTickets = useMemo(() => allTickets.filter(item =>
    fuzzySearchFilter(deferredQuery, item.event, ['title', 'description', 'location'])
  ), [allTickets, deferredQuery])

  const ticketCount = allTickets.length

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Glassmorphism Background ── */}
        <div className="absolute inset-0 backdrop-blur-md bg-slate-50/80 pointer-events-auto -z-10" />

        {/* ── Blue Background Container ── */}
        <div 
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[24px]"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Icons */}
          <div className="relative z-10 flex items-center justify-between px-4 pt-6">
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              Events
            </h1>
            
            <div className="flex items-center gap-[8px]">
              {!user && (
                <button
                  onClick={() => navigate('/sign-up')}
                  className="bg-white text-primary font-proxima font-semibold text-[13px] px-4 h-[38px] rounded-full shadow-lg active:opacity-80 transition-opacity"
                >
                  Sign Up
                </button>
              )}
              <button
                onClick={toggleSearch}
                className="bg-white/20 backdrop-blur-md size-[42px] flex items-center justify-center rounded-full border border-white/30 transition-colors active:bg-white/30 shadow-lg"
                aria-label="Search events"
              >
                <MagniferOutline className="w-[18px] h-[18px]" color="white" />
              </button>
              <button
                onClick={() => setShowChapterSheet(true)}
                className="bg-white/20 backdrop-blur-md size-[42px] flex items-center justify-center rounded-full border border-white/30 transition-colors active:bg-white/30 shadow-lg"
                aria-label="Filter events"
              >
                <FilterLinear className="size-[20px]" color="white" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Tabs Wrapper ── */}
        <div className="pt-4 pb-2 px-4 pointer-events-auto">
          <div className="flex gap-[6px] overflow-x-auto no-scrollbar max-w-4xl mx-auto">
            {(['discover', 'tickets'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSearchQuery('') }}
                className={`whitespace-nowrap px-[12px] h-[32px] flex-1 flex items-center justify-center rounded-[128px] text-[14px] font-proxima font-bold transition-all shrink-0 ${
                  tab === t
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {t === 'discover' ? 'Discover' : 'My Tickets'}
                  {t === 'tickets' && ticketCount > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                      tab === 'tickets' ? 'bg-white text-primary' : 'bg-primary/20 text-primary'
                    }`}>
                      {ticketCount}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Event-type filter chip bar (Discover only) ── */}
        {tab === 'discover' && (
          <div className="px-4 pb-2 pointer-events-auto overflow-x-auto no-scrollbar">
            <div className="flex gap-2 w-max">
              {EVENT_FILTERS.map(({ id, label }) => (
                <motion.button
                  key={id}
                  onClick={() => setEventFilter(id)}
                  className={`flex-shrink-0 h-[30px] px-3.5 rounded-full text-[12px] font-proxima font-semibold transition-colors ${
                    eventFilter === id
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-primary/10 text-primary'
                  }`}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        <SearchBar
          isVisible={isSearchVisible}
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
          placeholder={tab === 'discover' ? 'Search events or locations...' : 'Search your tickets...'}
        />
      </header>

      <AnimatePresence mode="wait">
        {/* ── Discover tab ── */}
        {tab === 'discover' && (
          <motion.div
            key="discover"
            className="bg-slate-50 min-h-screen pb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
          <div className="md:max-w-4xl md:mx-auto px-4 pt-4 pb-28">
            {/* Loading skeletons — only when no cached data yet */}
            {isLoading && events.length === 0 && (
              <div className="pt-4 space-y-3">
                <SkeletonFeaturedEvent />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <SkeletonEventCard />
                  <SkeletonEventCard />
                </div>
              </div>
            )}

            {/* Empty state — no events at all */}
            {!isLoading && events.length === 0 && (
              <div className="flex flex-col items-center justify-center px-4 pt-20 pb-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <CalendarMarkOutline className="w-8 h-8" color="#0b46a3" />
                </div>
                <h3 className="text-md3-body-lg font-bold text-slate-900 mb-1">Events coming soon</h3>
                <p className="text-md3-body-md text-slate-500 text-center">
                  Your chapter's next events will appear here. Check back shortly!
                </p>
              </div>
            )}

            {!isLoading && deferredQuery && matchingEvents.length === 0 && (
              <SearchEmptyState
                headline="No events found"
                body="Try adjusting your search query or chapter filter."
                className="pt-20 pb-8"
              />
            )}

            {/* Empty state — filter combination yields nothing */}
            {!isLoading && !deferredQuery && events.length > 0 && chapterFilteredEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center px-4 pt-20 pb-8">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <CalendarMarkOutline className="w-8 h-8" color="#0b46a3" />
                </div>
                <h3 className="text-md3-body-lg font-bold text-slate-900 mb-1">
                  {eventFilter === 'near_you' && 'No upcoming events nearby'}
                  {eventFilter === 'devcon_only' && 'No DEVCON events right now'}
                  {eventFilter === 'featured' && 'No featured events'}
                  {eventFilter === 'all' && `No events in ${selectedChapterName}`}
                </h3>
                <p className="text-md3-body-md text-slate-500 text-center mb-5">
                  {eventFilter === 'near_you'
                    ? "Your chapter has no upcoming events. Check back soon!"
                    : eventFilter !== 'all'
                    ? 'Try a different filter or check back later.'
                    : 'This chapter has no upcoming events. Try a different chapter.'}
                </p>
                <button
                  onClick={() => { setEventFilter('all'); setSelectedChapterId(null) }}
                  className="bg-primary text-white font-semibold text-md3-body-md px-6 py-2.5 rounded-xl"
                >
                  Show All Events
                </button>
              </div>
            )}

            {/* Featured hero card */}
            {showHero && (
              <div className="pt-4 pb-2">
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                >
                  <EventCard 
                    event={featuredEvent} 
                    className="h-[300px]" 
                    attendeeCount={attendeeCounts[featuredEvent.id]} 
                    attendees={attendeeDetails[featuredEvent.id]}
                  />
                </motion.div>
              </div>
            )}

            {/* Event list — staggered */}
            {displayEvents.length > 0 && (
              <motion.div
                key={`discover-grid-${deferredQuery}`}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {displayEvents.map((event) => {
                  const dateParts = event.event_date ? formatEventDate(event.event_date) : null
                  const isArchived = isEventArchived(event)
                  return (
                    <motion.button
                      key={event.id}
                      variants={cardItem}
                      onClick={() => navigate(`/events/${event.slug}`)}
                      className={`w-full bg-white border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] rounded-[16px] p-3 flex items-center gap-4 text-left ${
                        isArchived ? 'opacity-60 grayscale' : ''
                      }`}
                      whileTap={{ scale: 0.98 }}
                    >
                      {/* Left Side: Image or Date Placeholder */}
                      <div className="size-[72px] bg-slate-100 rounded-[12px] overflow-hidden shrink-0 relative">
                        {event.cover_image_url ? (
                          <>
                            <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
                            {/* Date Overlay for Images */}
                            {dateParts && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                                <span className="text-[10px] font-bold leading-none text-white/90 uppercase drop-shadow-sm">
                                  {dateParts.month}
                                </span>
                                <span className="text-md3-title-lg font-black leading-tight text-white drop-shadow-md">
                                  {dateParts.day}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10">
                            {dateParts ? (
                              <>
                                <span className="text-[10px] font-bold leading-none text-primary/60 uppercase">
                                  {dateParts.month}
                                </span>
                                <span className="text-md3-headline-sm font-black leading-tight text-primary">
                                  {dateParts.day}
                                </span>
                              </>
                            ) : (
                              <ClockCircleOutline className="size-8 text-primary/40" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Side: Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <p className="font-proxima font-bold text-[14px] text-slate-900 leading-tight truncate">
                            {event.title}
                          </p>
                          <AltArrowRightOutline className="w-3.5 h-3.5 shrink-0 text-slate-300 mt-0.5" />
                        </div>

                        {/* Date Text */}
                        <p className="text-[11px] text-slate-500 mb-0.5">
                          {event.event_date ? new Date(event.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No date set'}
                        </p>

                        {/* Location */}
                        {event.location && (
                          <p className="text-[11px] text-slate-400 truncate mb-1.5 flex items-center gap-1">
                            <MapPointOutline className="w-2.5 h-2.5" color="#94A3B8" />
                            {event.location}
                          </p>
                        )}

                        <div className="flex items-center gap-2">
                          <span className="backdrop-blur-[16px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase leading-[13.5px] bg-primary/10 text-primary px-2 py-0.5 rounded-[100px]">
                            +{event.points_value} pts
                          </span>
                          {attendeeCounts[event.id] && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                              <UsersGroupRoundedOutline className="w-3 h-3" color="#64748B" />
                              {attendeeCounts[event.id]}
                            </span>
                          )}
                          {isArchived && (
                            <span className="backdrop-blur-[16px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase leading-[13.5px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-[100px]">
                              Past
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </motion.div>
            )}
          </div>
          </motion.div>
        )}

        {/* ── My Tickets tab ── */}
        {tab === 'tickets' && (
          <motion.div
            key="tickets"
            className="bg-slate-50 min-h-screen pb-24"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
          <div className="md:max-w-4xl md:mx-auto px-4 pt-4 pb-28">
            {allTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 pt-24">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <TicketOutline className="w-8 h-8" color="#0b46a3" />
                </div>
                <h3 className="text-md3-body-lg font-bold text-slate-900 mb-1">No tickets yet</h3>
                <p className="text-md3-body-md text-slate-500 text-center mb-5">
                  Register for an event to get your QR ticket here.
                </p>
                <button
                  onClick={() => setTab('discover')}
                  className="bg-primary text-white font-semibold text-md3-body-md px-6 py-2.5 rounded-xl"
                >
                  Browse Events
                </button>
              </div>
            ) : deferredQuery && filteredTickets.length === 0 ? (
              <SearchEmptyState
                headline="No tickets found"
                body="Try adjusting your search query."
                className="pt-20 pb-8"
              />
            ) : (
              <motion.div
                key={`tickets-grid-${deferredQuery}`}
                className="pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {filteredTickets.map(({ reg, event: ev }) => {
                  const isApproved = reg.status === 'approved'
                  const destination = isApproved
                    ? `/events/${ev.slug}/ticket`
                    : `/events/${ev.slug}/pending`
                  // Checked-in ticket is always "Done" regardless of event date
                  const lifecycle = reg.checked_in ? 'done' : getEventLifecycleState(ev)
                  const isExpired = lifecycle === 'done'
                  const dateParts = ev.event_date ? formatEventDate(ev.event_date) : null

                  return (
                    <motion.button
                      key={reg.id}
                      variants={cardItem}
                      onClick={isExpired ? undefined : () => navigate(destination)}
                      whileTap={isExpired ? undefined : { scale: 0.98 }}
                      className={`w-full bg-white border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] rounded-[16px] p-3 flex items-center gap-4 text-left ${
                        isExpired ? 'opacity-50 grayscale cursor-not-allowed' : ''
                      }`}
                    >
                      {/* Left Side: Image or Date Placeholder */}
                      <div className="size-[72px] bg-slate-100 rounded-[12px] overflow-hidden shrink-0 relative">
                        {ev.cover_image_url ? (
                          <>
                            <img src={ev.cover_image_url} alt={ev.title} className="w-full h-full object-cover" />
                            {/* Date Overlay for Images */}
                            {dateParts && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                                <span className="text-[10px] font-bold leading-none text-white/90 uppercase drop-shadow-sm">
                                  {dateParts.month}
                                </span>
                                <span className="text-md3-title-lg font-black leading-tight text-white drop-shadow-md">
                                  {dateParts.day}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10">
                            {dateParts ? (
                              <>
                                <span className="text-[10px] font-bold leading-none text-primary/60 uppercase">
                                  {dateParts.month}
                                </span>
                                <span className="text-md3-headline-sm font-black leading-tight text-primary">
                                  {dateParts.day}
                                </span>
                              </>
                            ) : (
                              <TicketOutline className="size-8 text-primary/40" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right Side: Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <p className="font-proxima font-bold text-[14px] text-slate-900 leading-tight truncate">
                            {ev.title}
                          </p>
                          <AltArrowRightOutline className="w-3.5 h-3.5 shrink-0 text-slate-300 mt-0.5" />
                        </div>

                        {/* Date Text */}
                        <p className="text-[11px] text-slate-500 mb-0.5">
                          {ev.event_date ? new Date(ev.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'No date set'}
                        </p>

                        {/* Location */}
                        {ev.location && (
                          <p className="text-[11px] text-slate-400 truncate mb-1.5 flex items-center gap-1">
                            <MapPointOutline className="w-2.5 h-2.5" color="#94A3B8" />
                            {ev.location}
                          </p>
                        )}

                        <div className="flex items-center gap-1.5">
                          {lifecycle === 'in_progress' ? (
                            <span className="backdrop-blur-[16px] flex items-center gap-1 font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase leading-[13.5px] text-green bg-green/10 px-2 py-0.5 rounded-[100px] shrink-0">
                              <span className="w-1 h-1 rounded-full bg-green animate-ping" />
                              Live
                            </span>
                          ) : isExpired ? (
                            <span className="backdrop-blur-[16px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase leading-[13.5px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-[100px] shrink-0">
                              Expired
                            </span>
                          ) : (
                            <span className={`backdrop-blur-[16px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase leading-[13.5px] px-2 py-0.5 rounded-[100px] whitespace-nowrap ${
                              isApproved ? 'bg-[rgba(208,224,255,0.9)] text-[#0b46a3]' : 'bg-yellow-100/90 text-yellow-700'
                            }`}>
                              {isApproved ? 'Approved' : 'Pending'}
                            </span>
                          )}

                          <span className="backdrop-blur-[16px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase leading-[13.5px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-[100px]">
                            +{ev.points_value} pts
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </motion.div>
            )}
          </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chapter filter bottom sheet ── */}
      <AnimatePresence>
        {showChapterSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/40 z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChapterSheet(false)}
            />
            {/* Sheet */}
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl px-4 pt-4 pb-10"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-md3-body-lg font-bold text-slate-900">Filter by Chapter</h2>
                <button
                  onClick={() => setShowChapterSheet(false)}
                  className="w-8 h-8 rounded-full bg-slate-100/50 backdrop-blur-md border border-slate-200/50 flex items-center justify-center transition-colors active:bg-slate-200"
                >
                  <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
                </button>
              </div>

              {/* All Chapters option */}
              <button
                onClick={() => { setSelectedChapterId(null); setShowChapterSheet(false) }}
                className="w-full flex items-center justify-between py-3 border-b border-slate-100"
              >
                <span className={`text-md3-body-md font-semibold ${selectedChapterId === null ? 'text-primary' : 'text-slate-700'}`}>
                  All Chapters
                </span>
                {selectedChapterId === null && (
                  <CheckCircleOutline className="w-4 h-4" color="#0b46a3" />
                )}
              </button>

              {/* Region groups */}
              {REGIONS.map((region) => {
                const regionChapters = chapters.filter((c) => c.region === region)
                if (regionChapters.length === 0) return null
                return (
                  <div key={region} className="mt-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      {region}
                    </p>
                    {regionChapters.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => { setSelectedChapterId(ch.id); setShowChapterSheet(false) }}
                        className="w-full flex items-center justify-between py-2.5 border-b border-slate-50"
                      >
                        <span className={`text-md3-body-md ${selectedChapterId === ch.id ? 'font-semibold text-primary' : 'text-slate-700'}`}>
                          {ch.name}
                        </span>
                        {selectedChapterId === ch.id && (
                          <CheckCircleOutline className="w-4 h-4" color="#0b46a3" />
                        )}
                      </button>
                    ))}
                  </div>
                )
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
