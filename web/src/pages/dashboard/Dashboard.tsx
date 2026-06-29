import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AltArrowRightOutline, Bag2Outline, CalendarMarkOutline, HandHeartOutline, StarOutline } from 'solar-icon-set'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import { useAuthStore } from '../../stores/useAuthStore'
import { useEventsStore } from '../../stores/useEventsStore'
import { useJobsStore } from '../../stores/useJobsStore'
import { usePointsStore } from '../../stores/usePointsStore'
import { useMissionsStore } from '../../stores/useMissionsStore'
import { supabase } from '../../lib/supabase'
import { useChaptersStore } from '../../stores/useChaptersStore'
import EventCard from '../../components/EventCard'
import FeaturedBadge from '../../components/FeaturedBadge'
import JobCard from '../../components/JobCard'
import VolunteerXpCard from '../../components/VolunteerXpCard'
import {
  SkeletonEventCard,
  SkeletonXPRow,
  SkeletonJobCard,
  SkeletonMissionCard,
} from '../../components/Skeleton'
import { staggerContainer, cardItem, fadeUp } from '../../lib/animation'
import { formatDate, isEventArchived } from '../../lib/dates'

const WELCOME_BANNER = {
  title: 'Welcome to DEVCON+',
  sub:   'DEVCON Philippines · Your Tech Community',
  cta:   'Learn More',
  image: '/photos/devcon-summit-group.jpg',
} as const


export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { events, fetchEvents, isLoading: eventsLoading } = useEventsStore()
  const { jobs, isLoading: jobsLoading, fetchJobs } = useJobsStore()
  const { transactions, loadTotalPoints, loadTransactions, isLoading: pointsLoading } = usePointsStore()
  const { missions, participants, submissions, fetchAll: fetchMissions, startMission, isLoading: missionsLoading } = useMissionsStore()
  const { chapters: allChapters, fetchChapters } = useChaptersStore()
  const [regionChapterIds, setRegionChapterIds] = useState<Set<string>>(new Set())
  const [bannerIdx, setBannerIdx] = useState(0)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isStartingMission, setIsStartingMission] = useState<Record<string, boolean>>({})
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, number>>({})
  const [attendeeDetails, setAttendeeDetails] = useState<Record<string, { avatar_url: string | null; full_name: string }[]>>({})
  const [activeTab, setActiveTab] = useState<'updates' | 'featured'>('updates')

  const bannersLengthRef = useRef(1)

  const scrollYMV      = useMotionValue(0)

  // Slider — measure the viewport width so the track can be translated in px
  // (percentage translate on a flex track is relative to the full track width,
  // not one slide, so we use measured pixels instead).
  const sliderViewportRef = useRef<HTMLDivElement>(null)
  const [slideW, setSlideW] = useState(0)

  useEffect(() => {
    void fetchEvents()
    void fetchJobs()
    void loadTotalPoints()
    void loadTransactions(4) // dashboard only renders the last 4 (see recentTxns)
    void fetchMissions()

    // Fetch approved registration counts and some profiles for all events
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
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void fetchChapters() }, [fetchChapters])

  useEffect(() => {
    const chapterId = user?.chapter_id
    if (!chapterId || allChapters.length === 0) return
    const region = allChapters.find((c) => c.id === chapterId)?.region
    if (!region) return
    setRegionChapterIds(new Set(allChapters.filter((c) => c.region === region).map((c) => c.id)))
  }, [user?.chapter_id, allChapters])

  useEffect(() => {
    const t = setInterval(() => setBannerIdx((i) => (i + 1) % Math.max(bannersLengthRef.current, 1)), 4000)
    return () => clearInterval(t)
  }, [])

  // Track the slider viewport width (and keep it in sync on resize) so the
  // draggable track can snap to exact pixel offsets per slide.
  useEffect(() => {
    const el = sliderViewportRef.current
    if (!el) return
    const update = () => setSlideW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

useEffect(() => {
    const el = document.querySelector('[data-scroll-container]') as HTMLElement
    if (!el) return
    const handler = () => {
      scrollYMV.set(el.scrollTop)
      setIsScrolled(el.scrollTop > 50)
    }
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [scrollYMV])

  const upcomingByDate = events
    .filter((e) => e.status === 'upcoming' && !isEventArchived(e))
    .sort((a, b) => new Date(a.event_date ?? 0).getTime() - new Date(b.event_date ?? 0).getTime())

  // Featured (external) events are surfaced in the banner first — ALL of them,
  // then regular upcoming events fill the remaining slots.
  const featuredUpcoming = upcomingByDate.filter((e) => e.is_external)
  const regularUpcoming = upcomingByDate.filter((e) => !e.is_external)

  const toBanner = (e: typeof upcomingByDate[number]) => ({
    title: e.title,
    sub:   e.location ?? 'DEVCON Philippines',
    date:  e.event_date ? formatDate.compact(e.event_date) : undefined,
    cta:   e.is_external ? 'Learn More' : 'Register Now',
    image: e.cover_image_url ?? '/photos/devcon-certificate-ceremony.jpg',
    isExternal: e.is_external === true,
    onClick: () => navigate(`/events/${e.slug}`),
  })

  const banners = [
    { ...WELCOME_BANNER, onClick: () => navigate('/news/welcome') },
    ...featuredUpcoming.map(toBanner),
    ...regularUpcoming.slice(0, 2).map(toBanner),
  ]

  bannersLengthRef.current = banners.length
  const safeIdx = bannerIdx % Math.max(banners.length, 1)
  const userChapterId = user?.chapter_id ?? null
  const nearbyEvents = events
    .filter((e) => {
      if (e.status !== 'upcoming' || isEventArchived(e)) return false
      if (e.is_chapter_locked && e.chapter_id !== userChapterId) return false
      if (regionChapterIds.size > 0 && e.chapter_id && !regionChapterIds.has(e.chapter_id)) return false
      return true
    })
    .sort((a, b) => {
      const aOwn = a.chapter_id === userChapterId ? 0 : 1
      const bOwn = b.chapter_id === userChapterId ? 0 : 1
      if (aOwn !== bOwn) return aOwn - bOwn
      return new Date(a.event_date ?? 0).getTime() - new Date(b.event_date ?? 0).getTime()
    })
    .slice(0, 3)
  const recentTxns = transactions.slice(0, 4)

  // Only single-winner bounties disappear once claimed; multi-participant missions stay open.
  const unclaimedMissions = missions.filter(m => !(m.completion_mode === 'single_winner' && m.status === 'claimed'))

  const handleStartMission = async (missionId: string, alreadyJoined: boolean) => {
    if (!alreadyJoined) {
      setIsStartingMission(p => ({ ...p, [missionId]: true }))
      try {
        await startMission(missionId, user?.id ?? '')
      } catch { /* already joined or error — navigate anyway */ }
      setIsStartingMission(p => ({ ...p, [missionId]: false }))
    }
    navigate('/rewards', { state: { expandMissionId: missionId } })
  }

  return (
    <div className="relative min-h-screen bg-slate-50">
      <VolunteerXpCard />

      {/* ── Main Content Area ── */}
      <motion.main 
        className="relative z-10 flex flex-col gap-6 px-4 pb-4 md:max-w-4xl md:mx-auto"
        initial={false}
        animate={{
          paddingTop: isScrolled ? 80 : 16 // pt-20 when scrolled for clearance, pt-4 when unscrolled for tight gap
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        
        {/* Quick Actions Wrapper for Scroll Collapse */}
        <motion.div
          animate={{
            maxHeight: isScrolled ? 0 : 200,
            opacity: isScrolled ? 0 : 1,
            marginBottom: isScrolled ? 0 : 0
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <motion.section
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <div className="grid grid-cols-3 gap-3">
              {/* Find Jobs Card */}
              <motion.button
                variants={cardItem}
                onClick={() => navigate('/jobs')}
                className="bg-[rgba(127,8,255,0.15)] border border-[rgba(127,8,255,0.1)] flex flex-col gap-2 items-center justify-center rounded-[16px] shadow-[0px_0px_8px_0px_rgba(27,0,56,0.1)] w-full py-4"
                whileTap={{ scale: 0.95 }}
              >
                <div className="bg-white flex items-center justify-center rounded-full w-[42px] h-[42px] shadow-sm">
                  <Bag2Outline color="rgb(127,8,255)" size={24} />
                </div>
                <span className="font-proxima font-semibold text-slate-900 text-[10px]">Find Jobs</span>
              </motion.button>

              {/* Volunteer Card */}
              <motion.button
                variants={cardItem}
                onClick={() => navigate('/events')}
                className="bg-[rgba(115,178,9,0.15)] border border-[rgba(70,144,17,0.1)] flex flex-col gap-2 items-center justify-center rounded-[16px] shadow-[0px_0px_8px_0px_rgba(25,39,0,0.1)] w-full py-4"
                whileTap={{ scale: 0.95 }}
              >
                <div className="bg-white flex items-center justify-center rounded-full w-[42px] h-[42px] shadow-sm">
                  <HandHeartOutline color="rgb(70,144,17)" size={24} />
                </div>
                <span className="font-proxima font-semibold text-slate-900 text-[10px]">Volunteer</span>
              </motion.button>

              {/* Earn Points Card */}
              <motion.button
                variants={cardItem}
                onClick={() => navigate('/rewards')}
                className="bg-[rgba(234,179,8,0.15)] border border-[rgba(210,173,25,0.1)] flex flex-col gap-2 items-center justify-center rounded-[16px] shadow-[0px_0px_8px_0px_rgba(75,60,0,0.1)] w-full py-4"
                whileTap={{ scale: 0.95 }}
              >
                <div className="bg-white flex items-center justify-center rounded-full w-[42px] h-[42px] shadow-sm">
                  <StarOutline color="#F8C630" size={24} />
                </div>
                <span className="font-proxima font-semibold text-slate-900 text-[10px]">Earn Points</span>
              </motion.button>
            </div>
          </motion.section>
        </motion.div>

        {/* Draggable banner slider */}
        <div>
          <div
            ref={sliderViewportRef}
            className="relative h-[300px] rounded-2xl overflow-hidden bg-primary"
          >
            <motion.div
              className="flex h-full cursor-grab active:cursor-grabbing"
              drag="x"
              dragConstraints={{ left: -(banners.length - 1) * slideW, right: 0 }}
              dragElastic={0.18}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                if (slideW === 0) return
                // Snap to the nearest slide, biased by fling velocity.
                const dragged   = -info.offset.x / slideW
                const velBoost  = -info.velocity.x / (slideW * 4)
                const target    = Math.round(safeIdx + dragged + velBoost)
                setBannerIdx(Math.max(0, Math.min(banners.length - 1, target)))
              }}
              animate={{ x: -safeIdx * slideW }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            >
              {banners.map((b, i) => (
                <div key={i} className="relative w-full shrink-0 h-full">
                  <img
                    src={b.image}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                  />
                  <div className="absolute inset-0 bg-black/50" />

                  {/* Featured badge — top-right of the banner */}
                  {'isExternal' in b && b.isExternal && (
                    <div className="absolute top-5 right-5 z-10">
                      <FeaturedBadge />
                    </div>
                  )}

                  <div className="absolute inset-0 flex flex-col p-[20px] pt-[24px] pb-[18px]">
                    <div className="flex flex-col justify-between items-start flex-1 w-full min-w-0">
                      {/* Text block — limited to the left portion of the card */}
                      <div className="w-full max-w-[55%] min-w-0">
                        <p className="font-proxima font-bold text-md3-headline-sm text-white leading-normal line-clamp-2 break-words">
                          {b.title}
                        </p>
                        <div className="flex items-center gap-1 w-full min-w-0 mt-1">
                          {'date' in b && b.date && (
                            <>
                              <span className="font-proxima text-[#dfdfdf] text-md3-label-md tracking-[0.48px] uppercase shrink-0">
                                {b.date}
                              </span>
                              <span className="w-1 h-1 bg-[#dfdfdf] rounded-full shrink-0" />
                            </>
                          )}
                          <span className="font-proxima text-[#dfdfdf] text-md3-label-md tracking-[0.48px] uppercase truncate min-w-0 flex-1">
                            {b.sub}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); b.onClick() }}
                        className="bg-primary text-white text-md3-label-md font-semibold px-[18px] py-[12px] rounded-full flex items-center justify-center shrink-0 leading-none shadow-sm self-start"
                      >
                        {b.cta}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
          <div className="flex justify-center gap-1.5 mt-2.5">
            {banners.map((_, i) => (
              <motion.button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setBannerIdx(i)}
                animate={{
                  width:           i === safeIdx ? 16 : 6,
                  backgroundColor: i === safeIdx ? 'rgb(var(--color-primary-dark))' : '#CBD5E1',
                }}
                transition={{ duration: 0.25 }}
                className="h-1.5 rounded-full"
              />
            ))}
          </div>
        </div>

        {/* Events For You */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="font-proxima font-bold text-[18px] text-black">
              Events Near You
            </p>
            <button 
              onClick={() => navigate('/events')}
              className="flex gap-1 items-center"
            >
              <p className="font-proxima text-slate-900 text-[12px] tracking-[0.96px] uppercase">
                MORE
              </p>
              <AltArrowRightOutline className="w-3 h-3" color="#64748B" />
            </button>
          </div>
          {eventsLoading && nearbyEvents.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => <SkeletonEventCard key={i} />)}
            </div>
          ) : nearbyEvents.length === 0 ? (
            <motion.div
              className="flex flex-col items-center gap-3 py-8 px-6 rounded-2xl bg-white border border-slate-200 shadow-card text-center"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <CalendarMarkOutline className="w-6 h-6" color="rgb(var(--color-primary))" />
              </div>
              <div>
                <p className="text-md3-body-md font-semibold text-slate-800">Events coming soon</p>
                <p className="text-md3-label-md text-slate-400 mt-0.5 leading-relaxed">
                  Your chapter is planning something. Check back soon or browse all events.
                </p>
              </div>
              <button
                onClick={() => navigate('/events')}
                className="text-md3-label-md font-semibold text-primary"
              >
                Browse all events
              </button>
            </motion.div>
          ) : (
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {nearbyEvents.map((e) => (
                <motion.div key={e.id} variants={cardItem}>
                  <EventCard
                    event={e}
                    compact
                    attendeeCount={attendeeCounts[e.id]}
                    attendees={attendeeDetails[e.id]}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Hot Jobs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="font-proxima font-bold text-[18px] text-black">Jobs</p>
            <button onClick={() => navigate('/jobs')} className="flex gap-1 items-center">
              <p className="font-proxima text-slate-900 text-[12px] tracking-[0.96px] uppercase">MORE</p>
              <AltArrowRightOutline className="w-3 h-3" color="#64748B" />
            </button>
          </div>

          {jobsLoading && jobs.length === 0 ? (
            <div className="flex flex-col gap-3">
              {[1, 2].map((i) => (
                <SkeletonJobCard key={i} />
              ))}
            </div>
          ) : (
            <motion.div
              className="flex flex-col gap-3"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {[
                // All promoted jobs first (priority), then fill with recent non-promoted.
                ...jobs.filter(j => j.is_active && j.is_promoted),
                ...jobs.filter(j => j.is_active && !j.is_promoted).slice(0, 3),
              ].map((job) => (
                <motion.div key={job.id} variants={cardItem}>
                  <JobCard job={job} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Missions */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="font-proxima font-bold text-[18px] text-black">Missions</p>
            <button onClick={() => navigate('/rewards')} className="flex gap-1 items-center">
              <p className="font-proxima text-slate-900 text-[12px] tracking-[0.96px] uppercase">MORE</p>
              <AltArrowRightOutline className="w-3 h-3" color="#64748B" />
            </button>
          </div>

          {missionsLoading && unclaimedMissions.length === 0 ? (
            <div className="flex flex-col gap-3">
              {[1, 2].map((i) => (
                <SkeletonMissionCard key={i} />
              ))}
            </div>
          ) : unclaimedMissions.length === 0 ? (
            <motion.div
              className="flex flex-col items-center gap-3 py-8 px-6 rounded-2xl bg-white border border-slate-200 shadow-card text-center"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-400/10 flex items-center justify-center">
                <StarOutline className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-md3-body-md font-semibold text-slate-800">Missions are coming your way!</p>
                <p className="text-md3-label-md text-slate-400 mt-0.5 leading-relaxed">
                  You've cleared the board! We're "deploying" more challenges soon. 
                  Stay "synchronized" and keep your "cache" ready!
                </p>
              </div>
              <button
                onClick={() => navigate('/events')}
                className="text-md3-label-md font-semibold text-primary"
              >
                Volunteer for events to earn more
              </button>
            </motion.div>
          ) : (
            <motion.div className="flex flex-col gap-3" variants={staggerContainer} initial="hidden" animate="visible">
              {unclaimedMissions.slice(0, 2).map((mission) => {
                const isJoined   = participants.some(p => p.mission_id === mission.id)
                const mySubmission = submissions.find(s => s.mission_id === mission.id)
                const hasWon     = mySubmission?.status === 'approved'

                const difficultyStyle: Record<string, string> = {
                  easy:   'bg-emerald-100 text-emerald-700',
                  medium: 'bg-orange-100 text-amber-600',
                  hard:   'bg-purple-100 text-purple-600',
                }
                const diffCls = difficultyStyle[mission.difficulty ?? 'easy'] ?? difficultyStyle.easy

                return (
                  <motion.div
                    key={mission.id}
                    variants={cardItem}
                    onClick={() => navigate('/rewards', { state: { expandMissionId: mission.id } })}
                    className="w-full bg-white border border-slate-200 rounded-2xl shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] text-left cursor-pointer"
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="px-[18px] py-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-semibold tracking-[0.9px] uppercase px-2 py-0.5 rounded-full ${diffCls}`}
                        >
                          {mission.difficulty?.toUpperCase() ?? 'EASY'}
                        </span>
                        <span className="bg-amber-100 text-amber-700 text-[9px] font-semibold tracking-[0.9px] uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                          <StarOutline className="w-[6px] h-[6px]" color="#F8C630" />
                          {mission.xp_reward} EXP
                        </span>
                      </div>
                      <div className="flex flex-col items-start">
                        <p className="font-proxima font-bold text-[16px] text-black w-full leading-snug">{mission.title}</p>
                        {isJoined && !hasWon && mySubmission?.status === 'pending' && (
                          <p className="font-proxima text-amber-600 text-[12px] py-1">Pending Review</p>
                        )}
                      </div>
                      <div className="pt-1">
                        {hasWon ? (
                          <span className="text-[12px] font-semibold px-[18px] py-[10px] rounded-full inline-block leading-none bg-green/10 text-green">
                            Completed
                          </span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); void handleStartMission(mission.id, isJoined) }}
                            disabled={isStartingMission[mission.id]}
                            className="text-white text-[12px] font-semibold px-[18px] py-[10px] rounded-full inline-block leading-none disabled:opacity-60"
                            style={{ backgroundColor: 'rgb(var(--color-primary))' }}
                          >
                            {isStartingMission[mission.id] ? 'Starting…' : isJoined ? 'Continue' : 'Start Mission'}
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </section>

        {/* Switcher: Updates / Featured */}
        <section className="flex flex-col gap-4">
          <div className="inline-flex self-start items-center gap-2">
            <button
              onClick={() => setActiveTab('updates')}
              className={`flex items-center justify-center px-5 py-1.5 rounded-full transition-all duration-300 ${
                activeTab === 'updates' ? 'bg-primary text-white font-semibold shadow-sm' : 'bg-primary/10 text-primary font-medium'
              }`}
            >
              <span className="font-proxima text-[16px]">
                Updates
              </span>
            </button>
            <button
              onClick={() => setActiveTab('featured')}
              className={`flex items-center justify-center px-5 py-1.5 rounded-full transition-all duration-300 ${
                activeTab === 'featured' ? 'bg-primary text-white font-semibold shadow-sm' : 'bg-primary/10 text-primary font-medium'
              }`}
            >
              <span className="font-proxima text-[16px]">
                Featured
              </span>
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'updates' ? (
              <motion.button
                key="updates"
                onClick={() => navigate('/news/welcome')}
                className="w-full h-[220px] bg-white rounded-2xl shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] overflow-hidden text-left flex flex-col"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                whileTap={{ scale: 0.98 }}
              >
                <img
                  src="/photos/devcon-summit-group.jpg"
                  alt="DEVCON Summit"
                  className="w-full h-[100px] object-cover shrink-0"
                />
                <div className="p-4 flex flex-col flex-1 justify-center gap-1">
                  <p className="font-proxima font-bold text-[18px] text-black leading-tight line-clamp-1">
                    Welcome to DEVCON+ — Your Tech Community Hub
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="font-proxima text-slate-400 text-[10px] uppercase tracking-wider">
                      April 10, 2026
                    </p>
                    <div className="w-1 h-1 bg-slate-300 rounded-full shrink-0" />
                    <p className="font-proxima text-slate-400 text-[10px] uppercase tracking-wider">
                      By DEVCON Philippines
                    </p>
                  </div>
                  <p className="font-proxima text-slate-500 text-[11px] leading-relaxed line-clamp-2 mt-1">
                    Register for chapter events, earn Points+ for every activity, browse exclusive opportunities, and redeem rewards — all in one place. Your gateway to the DEVCON ecosystem is now live.
                  </p>
                </div>
              </motion.button>
            ) : (
              <motion.div
                key="featured"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full bg-white rounded-2xl shadow-card p-8 flex flex-col items-center justify-center text-center border border-dashed border-slate-200"
              >
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <StarOutline className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-bold text-slate-900 mb-1">Featured Articles Coming Soon!</h3>
                <p className="text-md3-body-md text-slate-500 max-w-[240px]">
                  We're still "debugging" the best stories for you. Please stay "tuned" — it's going to be "code-tastic"!
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Points History */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="font-proxima font-bold text-[18px] text-black">
              Points History
            </p>
            <button 
              onClick={() => navigate('/points/history')}
              className="flex gap-1 items-center"
            >
              <p className="font-proxima text-slate-900 text-[12px] tracking-[0.96px] uppercase">
                MORE
              </p>
              <AltArrowRightOutline className="w-3 h-3" color="#64748B" />
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
            {pointsLoading && recentTxns.length === 0 ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonXPRow key={i} border={i < 4} />
                ))}
              </>
            ) : recentTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <p className="text-md3-body-md text-slate-400 font-medium italic">No transactions yet</p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {recentTxns.map((tx, i) => (
                  <motion.div
                    key={tx.id}
                    variants={fadeUp}
                    className={`flex items-center gap-3 px-4 py-3 ${i < recentTxns.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-md3-label-md font-bold ${
                        tx.amount > 0 ? 'bg-green/10 text-green' : 'bg-red/10 text-red'
                      }`}
                    >
                      {tx.amount > 0 ? '+' : '−'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-md3-body-md font-medium text-slate-800 truncate">{tx.description}</p>
                      <p className="text-[10px] text-slate-400">
                        {formatDate.compact(tx.created_at)}
                      </p>
                    </div>
                    <span className={`text-md3-body-md font-bold ${tx.amount > 0 ? 'text-green' : 'text-red'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount} pts
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </section>
      </motion.main>
    </div>
  )
}
