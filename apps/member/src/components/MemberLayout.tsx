import { useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { HomeOutline, GiftOutline, QRCodeOutline, CaseOutline, UserOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useAuthStore } from '../stores/useAuthStore'
import { useEventsStore } from '../stores/useEventsStore'
import { useRewardsStore } from '../stores/useRewardsStore'
import { useNotificationsStore } from '../stores/useNotificationsStore'
import { usePointsStore } from '../stores/usePointsStore'
import { useJobsStore } from '../stores/useJobsStore'
import { useNewsStore } from '../stores/useNewsStore'
import { useVolunteerStore } from '../stores/useVolunteerStore'
import { useReferralsStore } from '../stores/useReferralsStore'
import { useMissionsStore } from '../stores/useMissionsStore'
import { supabase, onRealtimeDisconnect } from '../lib/supabase'
import { toast } from 'sonner'

import DesktopGuard from './DesktopGuard'
import ScrollToTop from './ScrollToTop'
import logoHorizontal from '../assets/logos/logo-horizontal.svg'

let hasShownDesktopToast = false

// Routes inside MemberLayout that guests (unauthenticated users) may view.
// Keep this list minimal — only routes whose components handle !user gracefully.
const GUEST_PATHS = ['/events']

export default function MemberLayout() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const subscribeToEventChanges = useEventsStore((s) => s.subscribeToChanges)
  const subscribeToRewardChanges = useRewardsStore((s) => s.subscribeToChanges)
  const subscribeToPointsChanges = usePointsStore((s) => s.subscribeToChanges)
  const fetchEvents = useEventsStore((s) => s.fetchEvents)
  const fetchRegistrations = useEventsStore((s) => s.fetchRegistrations)
  const registrations = useEventsStore((s) => s.registrations)
  const events = useEventsStore((s) => s.events)
  const loadTotalPoints = usePointsStore((s) => s.loadTotalPoints)
  const loadTransactions = usePointsStore((s) => s.loadTransactions)
  const fetchJobs = useJobsStore((s) => s.fetchJobs)
  const fetchNews = useNewsStore((s) => s.fetchNews)
  const fetchRewards = useRewardsStore((s) => s.fetchRewards)
  const loadVolunteerApplications = useVolunteerStore((s) => s.loadApplications)
  const loadReferralData = useReferralsStore((s) => s.loadReferralData)
  const fetchMissions = useMissionsStore((s) => s.fetchAll)
  const subscribeMissions = useMissionsStore((s) => s.subscribeToChanges)
  const { fetchRecent, subscribe: subscribeNotifications } = useNotificationsStore()


  useEffect(() => {
    if (!user && !GUEST_PATHS.includes(location.pathname)) {
      navigate('/sign-in', { replace: true })
    }
  }, [user, navigate, location.pathname])

  // Redirect users who haven't completed the interest quiz yet.
  // interests === null means never been through /interests.
  // interests === [] means they skipped — don't redirect again.
  // Pass the current path as returnTo so the quiz sends them back here after completion.
  useEffect(() => {
    if (user && user.interests === null) {
      navigate('/interests', { replace: true, state: { returnTo: location.pathname } })
    }
  }, [user, navigate, location.pathname])

  useEffect(() => {
    if (hasShownDesktopToast) return
    if (window.matchMedia('(min-width: 768px)').matches) {
      hasShownDesktopToast = true
      toast.info('DEVCON+ is best used on mobile devices.', {
        id: 'desktop-warning',
        duration: 5000,
      })
    }
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Re-establish channels AND refetch data — channels authenticated with
        // the old token must be replaced after a token refresh.
        recoverRef.current?.()
        resubscribeRef.current?.()
      }
    })
    return () => { subscription.unsubscribe() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Unified data + realtime management for the member session.
  const unsubEventsRef = useRef<(() => void) | null>(null)
  const unsubRewardsRef = useRef<(() => void) | null>(null)
  const unsubMissionsRef = useRef<(() => void) | null>(null)
  const unsubPointsRef = useRef<(() => void) | null>(null)
  const unsubNotifsRef = useRef<(() => void) | null>(null)

  // Stable refs so async handlers/event listeners (empty deps or stale closures)
  // always call the current store-aware logic.
  const recoverRef = useRef<(() => void) | null>(null)
  const resubscribeRef = useRef<(() => void) | null>(null)
  // Debounce guard: prevents concurrent recovery runs when visibilitychange,
  // online, and onRealtimeDisconnect all fire within the same "wake-up" burst.
  const lastRecoveryRef = useRef(0)
  // Scheduled follow-up recovery attempts (cleared on next runRecovery or unmount).
  const retryTimersRef = useRef<number[]>([])

  useEffect(() => {
    if (!user) return

    const recover = () => {
      // Primary HTTP fetches — critical for dashboard/events
      void fetchEvents()
      void loadTotalPoints()
      void fetchRegistrations(user.id)
      void fetchNews()
      
      // Secondary fetches — deferred to yield to browser frame
      setTimeout(() => {
        void loadTransactions()
        void fetchJobs()
        void fetchRewards()
        void loadVolunteerApplications()
        void loadReferralData()
        void fetchMissions()
        
        // Fetch recent notifications using the latest store state
        const regs = useEventsStore.getState().registrations
        const evs = useEventsStore.getState().events
        const approvedIds = regs.filter(r => r.status === 'approved').map(r => r.event_id)
        const eventTitles = Object.fromEntries(evs.map(e => [e.id, e.title]))
        if (approvedIds.length > 0) {
          void fetchRecent(approvedIds, eventTitles)
        }
      }, 0)
    }
    recoverRef.current = recover

    const resubscribe = () => {
      // Force reconnect if the socket is truly closed
      const state = supabase.realtime.connectionState()
      if (state === 'closed') {
        supabase.realtime.connect()
      }
      
      // Cleanup existing subscriptions
      unsubEventsRef.current?.()
      unsubRewardsRef.current?.()
      unsubMissionsRef.current?.()
      unsubPointsRef.current?.()
      unsubNotifsRef.current?.()
      
      // Re-establish general subscriptions
      unsubEventsRef.current = subscribeToEventChanges()
      unsubRewardsRef.current = subscribeToRewardChanges()
      unsubMissionsRef.current = subscribeMissions()
      unsubPointsRef.current = subscribeToPointsChanges()
      
      // Re-establish notification subscription using the latest store state
      const regs = useEventsStore.getState().registrations
      const evs = useEventsStore.getState().events
      const approvedIds = regs.filter(r => r.status === 'approved').map(r => r.event_id)
      const eventTitles = Object.fromEntries(evs.map(e => [e.id, e.title]))
      if (approvedIds.length > 0) {
        unsubNotifsRef.current = subscribeNotifications(approvedIds, eventTitles)
      }
    }
    resubscribeRef.current = resubscribe

    // Initial load on mount
    recover()
    resubscribe()

    const runRecovery = () => {
      const now = Date.now()
      if (now - lastRecoveryRef.current < 3000) return
      lastRecoveryRef.current = now
      recover()
      resubscribe()
      // Follow-up attempts in case the first round hits a stale TCP connection.
      // Stores preserve stale data so these retries are invisible to the user.
      retryTimersRef.current.forEach(clearTimeout)
      retryTimersRef.current = [
        window.setTimeout(() => { recover(); resubscribe() }, 5_000),
        window.setTimeout(() => { recover(); resubscribe() }, 15_000),
      ]
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runRecovery()
    }

    const handleOnline = () => runRecovery()

    // Socket-level disconnect handler (heartbeat/network loss)
    const unregisterDisconnect = onRealtimeDisconnect(() => runRecovery())

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    // Polling fallback: refetch + re-subscribe every 90 s (exempt from debounce)
    const pollInterval = setInterval(() => { recover(); resubscribe() }, 90_000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
      unregisterDisconnect()
      clearInterval(pollInterval)
      retryTimersRef.current.forEach(clearTimeout)
      retryTimersRef.current = []
      unsubEventsRef.current?.()
      unsubRewardsRef.current?.()
      unsubMissionsRef.current?.()
      unsubPointsRef.current?.()
      unsubNotifsRef.current?.()
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Specialized effect for notifications that re-runs when registration status
  // changes (e.g. pending -> approved), which happens without a full resubscribe call.
  useEffect(() => {
    if (!user) return
    const approvedIds = registrations.filter(r => r.status === 'approved').map(r => r.event_id)
    if (approvedIds.length === 0) return
    
    const eventTitles = Object.fromEntries(events.map(e => [e.id, e.title]))
    void fetchRecent(approvedIds, eventTitles)
    unsubNotifsRef.current?.()
    unsubNotifsRef.current = subscribeNotifications(approvedIds, eventTitles)
  }, [registrations, events, user]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null

  return (
    <DesktopGuard>
      <ScrollToTop />
      {/* ── MOBILE layout (< md) ── */}
      <div className="flex flex-col h-dvh bg-slate-50 overflow-hidden md:hidden">
        <div ref={scrollRef} data-scroll-container className="flex-1 overflow-y-auto pb-24 no-scrollbar">
          <Outlet />
        </div>

        {/* Floating pill bottom nav — mobile only */}
        <div
          className="fixed bottom-4 left-4 right-4 z-50"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          <div className="flex items-center justify-around bg-white/95 backdrop-blur rounded-2xl shadow-primary border border-slate-100 px-2 py-2">

            <NavLink
              to="/home"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 transition-colors ${isActive ? 'text-primary' : 'text-slate-400'}`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className={`flex flex-col items-center gap-0.5 ${isActive ? 'text-primary' : 'text-slate-400'}`}
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <HomeOutline className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Home</span>
                </motion.div>
              )}
            </NavLink>

            <NavLink
              to="/rewards"
              className={({ isActive }) =>
                `px-3 py-1.5 transition-colors ${isActive ? 'text-primary' : 'text-slate-400'}`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className={`flex flex-col items-center gap-0.5 ${isActive ? 'text-primary' : 'text-slate-400'}`}
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <GiftOutline className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Rewards</span>
                </motion.div>
              )}
            </NavLink>

            {/* Center: Events — elevated hero circle */}
            <NavLink to="/events" className="-mt-6" title="Events">
              {({ isActive }) => (
                <motion.div
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-primary ${
                    isActive ? 'bg-primary-dark' : 'bg-primary'
                  }`}
                  style={{ border: '3px solid white' }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <QRCodeOutline className="w-6 h-6" color="white" />
                </motion.div>
              )}
            </NavLink>

            <NavLink
              to="/jobs"
              className={({ isActive }) =>
                `px-3 py-1.5 transition-colors ${isActive ? 'text-primary' : 'text-slate-400'}`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className={`flex flex-col items-center gap-0.5 ${isActive ? 'text-primary' : 'text-slate-400'}`}
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <CaseOutline className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Jobs</span>
                </motion.div>
              )}
            </NavLink>

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `px-3 py-1.5 transition-colors ${isActive ? 'text-primary' : 'text-slate-400'}`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className={`flex flex-col items-center gap-0.5 ${isActive ? 'text-primary' : 'text-slate-400'}`}
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <UserOutline className="w-5 h-5" />
                  <span className="text-[10px] font-medium">Profile</span>
                </motion.div>
              )}
            </NavLink>

          </div>
        </div>
      </div>

      {/* ── TABLET / DESKTOP layout (md+) ── */}
      <div className="hidden md:flex h-screen bg-slate-100 p-4 gap-4 overflow-hidden">

        {/* Floating sidebar */}
        <aside className="w-48 lg:w-56 shrink-0 bg-primary rounded-2xl shadow-card flex flex-col overflow-hidden">
          {/* Logo */}
          <div className="px-4 py-5 border-b border-white/10">
            <img src={logoHorizontal} alt="DEVCON+" className="h-5 w-auto" />
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-white/50">
              Member
            </span>
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">

            <NavLink
              to="/home"
              end
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-md3-body-md font-medium transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <HomeOutline className="w-4 h-4 shrink-0" />
              Home
            </NavLink>

            <NavLink
              to="/rewards"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-md3-body-md font-medium transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <GiftOutline className="w-4 h-4 shrink-0" />
              Rewards
            </NavLink>

            {/* Events — circle accent */}
            <NavLink
              to="/events"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-md3-body-md font-medium transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-white/30' : 'bg-white/15'
                  }`}>
                    <QRCodeOutline className="w-3.5 h-3.5" color="white" />
                  </div>
                  Events
                </>
              )}
            </NavLink>

            <NavLink
              to="/jobs"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-md3-body-md font-medium transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <CaseOutline className="w-4 h-4 shrink-0" />
              Jobs
            </NavLink>

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-md3-body-md font-medium transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <UserOutline className="w-4 h-4 shrink-0" />
              Profile
            </NavLink>

          </nav>
        </aside>

        {/* Main content card */}
        <main className="flex-1 bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden flex flex-col">
          <div ref={scrollRef} data-scroll-container className="flex-1 overflow-y-auto no-scrollbar">
            <Outlet />
          </div>
        </main>
      </div>

    </DesktopGuard>
  )
}
