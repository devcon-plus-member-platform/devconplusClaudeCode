import { useEffect, useRef, useState, useCallback } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { UsersGroupRoundedOutline, KeyOutline, CalendarOutline, BuildingsOutline, WidgetOutline, LogoutOutline, ShieldCheckOutline, ScannerOutline, ArrowLeftOutline, UserCheckOutline, NotebookOutline } from 'solar-icon-set'
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
  { path: '/admin/upgrades',  label: 'Chapter Management', Icon: ShieldCheckOutline, end: false, superOnly: false },
  { path: '/admin/officer-resources', label: 'Officer Resources', Icon: NotebookOutline, end: false, superOnly: false },
  { path: '/admin/kiosk',     label: 'Kiosk',      Icon: ScannerOutline,        end: false, superOnly: true  },
]

const ADMIN_ROLES = ['super_admin', 'hq_admin'] as const

export default function AdminLayout() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [recoveryKey, setRecoveryKey] = useState(0)
  const lastHiddenRef = useRef(0)

  useEffect(() => {
    if (!user) {
      navigate('/sign-in', { replace: true })
    } else if (!ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number])) {
      navigate('/home', { replace: true })
    }
  }, [user, navigate])

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

  return (
    <div className="flex h-screen bg-slate-100 font-sans p-4 gap-4">
      <ScrollToTop />
      {/* Floating sidebar */}
      <aside className="w-56 shrink-0 bg-blue rounded-2xl shadow-card flex flex-col overflow-hidden">
        <div className="px-5 py-5 border-b border-white/10">
          <img src={logoHorizontal} alt="DEVCON+" className="h-6 w-auto" />
          <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-white/50">
            Admin Panel
          </span>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.filter(item => !item.superOnly || ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number])).map(({ path, label, Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
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
      </aside>

      {/* Main content area — floating card */}
      <main data-scroll-container className="flex-1 bg-white rounded-2xl shadow-card border border-slate-100 overflow-y-auto">
        <Outlet key={recoveryKey} />
      </main>
    </div>
  )
}
