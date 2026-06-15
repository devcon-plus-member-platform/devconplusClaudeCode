import { useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { HomeOutline, CalendarOutline, ScannerOutline, GiftOutline, UserOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import type { SolarIcon } from '../lib/icons'
import { useAuthStore } from '../stores/useAuthStore'
import { useEventsStore } from '../stores/useEventsStore'
import { useRewardsStore } from '../stores/useRewardsStore'
import { useOrgVolunteerStore } from '../stores/useOrgVolunteerStore'
import { supabase } from '../lib/supabase'
import DesktopGuard from './DesktopGuard'
import ScrollToTop from './ScrollToTop'
import logoHorizontal from '../assets/logos/logo-horizontal.svg'

const LEFT_TABS: { path: string; label: string; Icon: SolarIcon; end: boolean }[] = [
  { path: '/organizer',         label: 'Home',    Icon: HomeOutline, end: true  },
  { path: '/organizer/rewards', label: 'Rewards', Icon: GiftOutline, end: false },
]

const RIGHT_TABS: { path: string; label: string; Icon: SolarIcon; end: boolean }[] = [
  { path: '/organizer/events',  label: 'Events',  Icon: CalendarOutline, end: false },
  { path: '/organizer/profile', label: 'Profile', Icon: UserOutline,         end: false },
]

const ALL_TABS = [
  ...LEFT_TABS,
  { path: '/organizer/scan', label: 'Scan', Icon: ScannerOutline, end: false },
  ...RIGHT_TABS,
]

const ORGANIZER_ROLES = ['chapter_officer', 'hq_admin', 'super_admin'] as const

export default function OrganizerLayout() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const fetchEvents = useEventsStore((s) => s.fetchEvents)
  const fetchAllRewards = useRewardsStore((s) => s.fetchAllRewards)
  const fetchAllRedemptions = useRewardsStore((s) => s.fetchAllRedemptions)
  const loadOrgVolunteerApps = useOrgVolunteerStore((s) => s.loadApplications)

  useEffect(() => {
    if (!user) {
      navigate('/sign-in', { replace: true })
    } else if (!ORGANIZER_ROLES.includes(user.role as typeof ORGANIZER_ROLES[number])) {
      navigate('/home', { replace: true })
    }
  }, [user, navigate])

  // Data management for the organizer session — polling only (no realtime channels;
  // events refresh via recover() on focus / online / 60 s interval).
  const recoverRef = useRef<(() => void) | null>(null)
  const lastRecoveryRef = useRef(0)
  const retryTimersRef = useRef<number[]>([])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Refetch data after sign-in / token refresh. No realtime channels to rebuild.
        recoverRef.current?.()
      }
    })
    return () => { subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    const recover = () => {
      void supabase.auth.getSession()
      void fetchEvents()
      void fetchAllRewards()
      void fetchAllRedemptions()
      if (user?.chapter_id) void loadOrgVolunteerApps(user.chapter_id)
    }
    recoverRef.current = recover

    recover()

    const runRecovery = () => {
      const now = Date.now()
      if (now - lastRecoveryRef.current < 3000) return
      lastRecoveryRef.current = now
      recover()
      retryTimersRef.current.forEach(clearTimeout)
      retryTimersRef.current = [
        window.setTimeout(() => { recover() }, 5_000),
        window.setTimeout(() => { recover() }, 15_000),
      ]
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runRecovery()
    }
    const handleOnline = () => runRecovery()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)
    // Polling keepalive every 60 s — primary freshness mechanism (no realtime channels).
    const pollInterval = setInterval(() => { recover() }, 60_000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
      clearInterval(pollInterval)
      retryTimersRef.current.forEach(clearTimeout)
      retryTimersRef.current = []
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !ORGANIZER_ROLES.includes(user.role as typeof ORGANIZER_ROLES[number])) return null

  return (
    <DesktopGuard>
      <ScrollToTop />
      {/* ── MOBILE layout (< md) ── */}
      <div className="flex flex-col h-dvh bg-slate-50 overflow-hidden md:hidden">
        <div ref={scrollRef} data-scroll-container className="flex-1 overflow-y-auto pb-24">
          <Outlet />
        </div>

        {/* Floating pill bottom nav — Home | Rewards | ●Scan● | Events | Profile */}
        <div className="fixed bottom-4 left-4 right-4 z-50">
          <div className="flex items-center justify-around bg-white/95 backdrop-blur rounded-2xl shadow-card border border-slate-100 px-2 py-2">

            {LEFT_TABS.map(({ path, label, Icon, end }) => (
              <NavLink
                key={path}
                to={path}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                    isActive ? 'text-blue' : 'text-slate-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <div className={`flex flex-col items-center gap-0.5 ${isActive ? 'text-blue' : 'text-slate-400'}`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{label}</span>
                  </div>
                )}
              </NavLink>
            ))}

            {/* Center hero — Scanner */}
            <NavLink to="/organizer/scan" className="-mt-6" title="Scan">
              {({ isActive }) => (
                <motion.div
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-card transition-colors ${
                    isActive ? 'bg-navy' : 'bg-blue'
                  }`}
                  style={{ border: '3px solid white' }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  <ScannerOutline className="w-6 h-6" color="white" />
                </motion.div>
              )}
            </NavLink>

            {RIGHT_TABS.map(({ path, label, Icon, end }) => (
              <NavLink
                key={path}
                to={path}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                    isActive ? 'text-blue' : 'text-slate-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <div className={`flex flex-col items-center gap-0.5 ${isActive ? 'text-blue' : 'text-slate-400'}`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{label}</span>
                  </div>
                )}
              </NavLink>
            ))}

          </div>
        </div>
      </div>

      {/* ── TABLET / DESKTOP layout (md+) ── */}
      <div className="hidden md:flex h-screen bg-slate-100 p-4 gap-4 overflow-hidden">

        {/* Floating sidebar */}
        <aside className="w-48 lg:w-56 shrink-0 bg-blue rounded-2xl shadow-card flex flex-col overflow-hidden">
          {/* Logo — links home */}
          <NavLink
            to="/organizer"
            end
            className="block px-4 py-5 border-b border-white/10 transition-opacity hover:opacity-80"
            aria-label="Go to officer home"
          >
            <img src={logoHorizontal} alt="DEVCON+" className="h-5 w-auto" />
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-white/50">
              Officer
            </span>
          </NavLink>

          {/* Nav items */}
          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {ALL_TABS.map(({ path, label, Icon, end }) => {
              const isScan = path === '/organizer/scan'
              return (
                <NavLink
                  key={path}
                  to={path}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-md3-body-md font-medium transition-colors ${
                      isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isScan ? (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-white/30' : 'bg-white/15'
                        }`}>
                          <Icon className="w-3.5 h-3.5 text-white" />
                        </div>
                      ) : (
                        <Icon className="w-4 h-4 shrink-0" />
                      )}
                      {label}
                    </>
                  )}
                </NavLink>
              )
            })}
          </nav>
        </aside>

        {/* Main content card */}
        <main className="flex-1 bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden flex flex-col">
          <div ref={scrollRef} data-scroll-container className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </DesktopGuard>
  )
}
