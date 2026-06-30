import { useEffect, useRef, useState, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { UsersGroupRoundedOutline, KeyOutline, CalendarOutline, BuildingsOutline, WidgetOutline, LogoutOutline, ShieldCheckOutline, ScannerOutline, ArrowLeftOutline, UserCheckOutline, NotebookOutline, ConfettiOutline, HamburgerMenuOutline, CloseCircleOutline } from 'solar-icon-set'
import { useAuthStore } from '../stores/useAuthStore'
import ScrollToTop from './ScrollToTop'
import logoHorizontal from '../assets/logos/logo-horizontal.svg'

const NAV_ITEMS = [
  { path: '/admin',           label: 'Dashboard', Icon: WidgetOutline, end: true,  superOnly: false },
  { path: '/admin/users',     label: 'Users',      Icon: UsersGroupRoundedOutline,           end: false, superOnly: false },
  { path: '/admin/org-codes', label: 'Org Codes',  Icon: KeyOutline,        end: false, superOnly: false },
  { path: '/admin/chapter-officers', label: 'Chapter Officers', Icon: UserCheckOutline, end: false, superOnly: false },
  { path: '/admin/events',    label: 'Events',     Icon: CalendarOutline,    end: false, superOnly: false },
  { path: '/admin/chapters',  label: 'Chapters',          Icon: BuildingsOutline,   end: false, superOnly: false },
  { path: '/admin/upgrades',  label: 'CMS', Icon: ShieldCheckOutline, end: false, superOnly: false },
  { path: '/admin/officer-resources', label: 'Officer Resources', Icon: NotebookOutline, end: false, superOnly: false },
  { path: '/admin/kiosk',     label: 'Kiosk',      Icon: ScannerOutline,        end: false, superOnly: true  },
]

const ADMIN_ROLES = ['super_admin', 'hq_admin'] as const

export default function AdminLayout() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [recoveryKey, setRecoveryKey] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const lastHiddenRef = useRef(0)

  useEffect(() => {
    if (!user) {
      navigate('/sign-in', { replace: true })
    } else if (!user.username || !user.chapter_id) {
      navigate('/complete-profile', { replace: true })
    } else if (!ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number])) {
      navigate('/home', { replace: true })
    }
  }, [user, navigate])

  // Close the mobile drawer whenever the route changes (e.g. after tapping a nav item).
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  // Recovery: remount child pages to re-fetch data from Supabase.
  // Only fires on visibility change if the tab was away for > 2 minutes —
  // quick tab switches (copy-paste, check another tab) should not cause a full
  // reload and blank loading state.
  const handleRecover = useCallback(() => setRecoveryKey((k) => k + 1), [])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenRef.current = Date.now()
      } else if (document.visibilityState === 'visible') {
        if (Date.now() - lastHiddenRef.current >= 2 * 60 * 1000) {
          handleRecover()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    // Always recover on network restore — connection just came back.
    window.addEventListener('online', handleRecover)
    // No periodic poll: admin pages don't use realtime subscriptions, so
    // polling would just reset scroll position and disrupt editing every few minutes.
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleRecover)
    }
  }, [handleRecover])

  if (!user || !ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number])) return null

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.superOnly || ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number])
  )

  // Shared sidebar content — rendered both in the desktop sidebar and the mobile drawer.
  // `onNavigate` lets the mobile drawer close itself when a link is tapped.
  const renderSidebar = (onNavigate?: () => void) => (
    <>
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between gap-2">
        <div>
          <img src={logoHorizontal} alt="DEVCON+" className="h-6 w-auto" />
          <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-white/50">
            Admin Panel
          </span>
        </div>
        {onNavigate && (
          <button
            onClick={onNavigate}
            aria-label="Close menu"
            className="text-white/70 hover:text-white transition-colors md:hidden"
          >
            <CloseCircleOutline className="w-6 h-6" color="white" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleNavItems.map(({ path, label, Icon, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-md3-body-md font-medium transition-colors ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}

        {/* Public raffle wheel — opens in a new tab (lives outside the admin panel) */}
        <a
          href="/wheel"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-md3-body-md font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ConfettiOutline className="w-4 h-4 shrink-0" />
          Raffle Wheel
        </a>
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-[11px] text-white/90 font-semibold truncate">{user.full_name}</p>
        <p className="text-[10px] text-white/50 truncate">{user.email}</p>
        <button
          onClick={() => navigate('/home')}
          className="mt-3 flex items-center gap-2 text-md3-label-md text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeftOutline className="w-3.5 h-3.5" />
          Back to App
        </button>
        <button
          onClick={() => { void signOut(); navigate('/sign-in') }}
          className="mt-2 flex items-center gap-2 text-md3-label-md text-white/60 hover:text-white transition-colors"
        >
          <LogoutOutline className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-slate-100 font-sans md:p-4 md:gap-4 overflow-hidden">
      <ScrollToTop />

      {/* ── MOBILE top bar (< md) ── */}
      <header className="md:hidden shrink-0 bg-blue flex items-center justify-between px-4 h-14 shadow-card">
        <img src={logoHorizontal} alt="DEVCON+" className="h-5 w-auto" />
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-white hover:bg-white/10 transition-colors"
        >
          <HamburgerMenuOutline className="w-6 h-6" color="white" />
        </button>
      </header>

      {/* ── MOBILE slide-out drawer (< md) ── */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-[80] md:hidden">
            <motion.div
              className="absolute inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              className="absolute top-0 left-0 bottom-0 w-72 max-w-[85%] bg-blue flex flex-col overflow-hidden shadow-card"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            >
              {renderSidebar(() => setDrawerOpen(false))}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── DESKTOP floating sidebar (md+) ── */}
      <aside className="hidden md:flex w-56 shrink-0 bg-blue rounded-2xl shadow-card flex-col overflow-hidden">
        {renderSidebar()}
      </aside>

      {/* Main content area — full-bleed on mobile, floating card on desktop */}
      <main data-scroll-container className="flex-1 bg-white md:rounded-2xl md:shadow-card md:border md:border-slate-100 overflow-y-auto">
        <Outlet key={recoveryKey} />
      </main>
    </div>
  )
}
