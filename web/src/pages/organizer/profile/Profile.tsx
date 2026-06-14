import { useEffect, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { AltArrowRightOutline, LogoutOutline, UserOutline, CalendarOutline, MapPointOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useOrgAuthStore, useOrganizerUser } from '../../../stores/useOrgAuthStore'
import { useAuthStore } from '../../../stores/useAuthStore'
import { ROLE_DISPLAY_NAMES } from '../../../lib/constants'
import { useEventsStore } from '../../../stores/useEventsStore'
import ComingSoonModal from '../../../components/ComingSoonModal'
import { staggerContainer, cardItem } from '../../../lib/animation'

const MENU_ITEMS: { label: string; icon?: ComponentType<{ className?: string }>; path?: string; modal?: string }[] = [
  { label: 'Edit Profile',          path: '/organizer/profile/edit'           },
  { label: 'Manage Co-Organizers',  modal: 'Manage Co-Organizers' },
  { label: 'Notifications',         path: '/organizer/profile/notifications'  },
  { label: 'Privacy & Security',    path: '/organizer/profile/privacy'        },
  { label: 'Help & Support',        modal: 'Help & Support'                   },
]

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export function OrgProfile() {
  const user = useOrganizerUser()
  const { logout: orgLogout } = useOrgAuthStore()
  const { user: profile, setOrganizerSession } = useAuthStore()
  const { events, fetchEvents } = useEventsStore()
  const navigate = useNavigate()
  const [activeModal, setActiveModal] = useState<string | null>(null)

  useEffect(() => {
    if (events.length === 0) void fetchEvents()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null

  const handleLogout = () => {
    orgLogout()
    setOrganizerSession(false)
    navigate('/sign-in')
  }

  // Events for this chapter, sorted newest first, capped at 5
  const chapterEvents = events
    .filter((e) => e.chapter_id === profile?.chapter_id)
    .sort((a, b) => new Date(b.event_date ?? 0).getTime() - new Date(a.event_date ?? 0).getTime())
    .slice(0, 5)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Blue Background Container ── */}
      <div 
        className="bg-[#1152d4] relative overflow-hidden z-0 pb-[40px] pt-14 text-center"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          <div className="relative z-10">
            <div className="w-32 h-32 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-md3-display-sm font-black text-white mx-auto mb-3 overflow-hidden">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
              ) : (
                user.initials
              )}
            </div>
            <h1 className="text-md3-title-lg font-bold text-white font-proxima tracking-tight">{user.full_name}</h1>
            <p className="text-white/70 text-md3-body-md font-proxima mt-0.5">{user.email}</p>
            
            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center px-4">
              <span className="text-[10px] font-bold bg-white/20 border border-white/20 rounded-full px-3 py-1 text-white uppercase tracking-wider backdrop-blur-sm">
                {user.chapter} Chapter
              </span>
              <span className="text-[10px] font-bold bg-white/20 border border-white/20 rounded-full px-3 py-1 text-white uppercase tracking-wider backdrop-blur-sm">
                {ROLE_DISPLAY_NAMES[user.role] ?? 'Chapter Officer'}
              </span>
            </div>
          </div>
        </div>

      <div className="p-4 space-y-3 pb-24">

        {/* Event History */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-card">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-md3-body-md font-bold text-slate-900">Event History</p>
            <button
              onClick={() => navigate('/organizer/events')}
              className="text-md3-label-md font-semibold text-blue"
            >
              View all
            </button>
          </div>

          {chapterEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-8">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                <CalendarOutline className="w-5 h-5" color="#CBD5E1" />
              </div>
              <p className="text-md3-body-md font-semibold text-slate-500">No events yet</p>
              <p className="text-md3-label-md text-slate-400 mt-0.5">Events you create will appear here.</p>
            </div>
          ) : (
            <motion.div
              className="divide-y divide-slate-50"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {chapterEvents.map((event) => {
                const dateStr = event.event_date
                  ? new Date(event.event_date).toLocaleDateString('en-PH', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })
                  : 'TBA'

                return (
                  <motion.button
                    key={event.id}
                    variants={cardItem}
                    onClick={() => navigate(`/organizer/events/${event.id}`)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
                      <CalendarOutline className="w-5 h-5" color="#1152D4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-md3-body-md font-semibold text-slate-900 leading-tight truncate">
                        {event.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 min-w-0">
                        <p className="text-md3-label-md text-slate-400 shrink-0">{dateStr}</p>
                        {event.location && (
                          <p className="text-md3-label-md text-slate-400 flex items-center gap-0.5 min-w-0">
                            <MapPointOutline className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">{event.location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </div>

        {/* Settings menu */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-card">
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item.label}
              onClick={() => item.path ? navigate(item.path) : setActiveModal(item.modal!)}
              className={`w-full px-4 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors ${
                i < MENU_ITEMS.length - 1 ? 'border-b border-slate-100' : ''
              }`}
            >
              <span className="flex items-center gap-2 text-md3-body-md font-semibold text-slate-900">
                {item.icon && <item.icon className="w-4 h-4 text-slate-400" />}
                {item.label}
              </span>
              <AltArrowRightOutline className="w-4 h-4" color="#CBD5E1" />
            </button>
          ))}
        </div>

        {/* Switch to Member View */}
        <button
          onClick={() => navigate('/home')}
          className="w-full py-3.5 bg-primary/10 text-primary text-md3-body-md font-bold rounded-2xl hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
        >
          <UserOutline className="w-4 h-4" />
          Switch to Member View
        </button>

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          className="w-full py-3.5 bg-red/10 text-red text-md3-body-md font-bold rounded-2xl hover:bg-red/20 transition-colors flex items-center justify-center gap-2"
        >
          <LogoutOutline className="w-4 h-4" />
          Sign Out
        </button>

      </div>

      {activeModal && (
        <ComingSoonModal feature={activeModal} onClose={() => setActiveModal(null)} />
      )}
    </div>
  )
}
