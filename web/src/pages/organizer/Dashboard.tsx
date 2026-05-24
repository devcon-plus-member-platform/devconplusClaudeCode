import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircleOutline, BellOutline, AddCircleOutline, HeartOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { ApprovalCard, type Registration } from '../../components/ApprovalCard'
import { VolunteerApprovalCard } from '../../components/VolunteerApprovalCard'
import { useOrganizerUser } from '../../stores/useOrgAuthStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { useEventsStore } from '../../stores/useEventsStore'
import { useOrgVolunteerStore } from '../../stores/useOrgVolunteerStore'
import { supabase } from '../../lib/supabase'
import { fadeUp, staggerContainer, cardItem } from '../../lib/animation'
import logoMark from '../../assets/logos/logo-mark.svg'

type TabId = 'approvals' | 'volunteers'

// Flower-of-life / Clover pattern matching Figma branding
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`
export function OrgDashboard() {
  const user = useOrganizerUser()
  const { user: profile } = useAuthStore()
  const { events, fetchEvents } = useEventsStore()
  const {
    applications: volunteerApps,
    loading: volunteerLoading,
    error: volunteerError,
    approveApplication,
    rejectApplication,
    revertApplication,
    loadApplications: loadVolunteerApps,
  } = useOrgVolunteerStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('approvals')
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [membersCount, setMembersCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const chapterId = profile?.chapter_id ?? null

  useEffect(() => {
    void fetchEvents()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chapterId) {
      setIsLoading(false)
      return
    }

    const loadData = async () => {
      setIsLoading(true)

      // Fetch pending registrations for this chapter's events
      const { data: regData } = await supabase
        .from('event_registrations')
        .select(`
          id,
          status,
          registered_at,
          events!inner(id, title, chapter_id),
          profiles(full_name, email, school_or_company)
        `)
        .eq('status', 'pending')
        .eq('events.chapter_id', chapterId)

      const mapped: Registration[] = (regData ?? []).map((row) => {
        const ev = Array.isArray(row.events) ? row.events[0] : row.events
        const p  = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        const evObj = ev as { id?: string; title?: string } | null
        const pObj  = p  as { full_name?: string; email?: string; school_or_company?: string } | null
        return {
          id:                row.id,
          member_name:       pObj?.full_name ?? 'Unknown',
          member_email:      pObj?.email ?? '',
          school_or_company: pObj?.school_or_company ?? '',
          event_title:       evObj?.title ?? '',
          registered_at:     row.registered_at ?? '',
          status:            row.status as Registration['status'],
        }
      })
      setRegistrations(mapped)

      // Fetch count of members in this chapter
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('chapter_id', chapterId)
      setMembersCount(count ?? 0)

      setIsLoading(false)
    }

    void loadData()
    void loadVolunteerApps(chapterId)
  }, [chapterId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null

  const chapterEvents = events.filter((e) => e.chapter_id === chapterId)
  const pendingRegistrations = registrations.filter((r) => r.status === 'pending')
  const pendingVolunteers = volunteerApps.filter((a) => a.status === 'pending')
  const totalPending = pendingRegistrations.length + pendingVolunteers.length

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Glassmorphism Background ── */}
        <div className="absolute inset-0 bg-transparent pointer-events-auto -z-10" />

        {/* ── Blue Background Container ── */}
        <div 
          className="bg-[#1152d4] relative overflow-hidden z-0 pointer-events-auto pb-[64px]"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Logo + Greeting + Notifications */}
          <div className="relative z-10 flex items-center justify-between px-4 pt-6">
            <div className="flex items-center gap-2">
              <div className="h-[26px] w-[44px] relative">
                <img src={logoMark} alt="DEVCON+" className="absolute inset-0 size-full object-contain" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-white text-[24px] font-bold font-proxima leading-none tracking-[0.4px]">
                  DEVCON
                </h1>
                <p className="text-white text-[14px] font-semibold font-proxima leading-none mt-1">
                  {user.chapter}
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/organizer/notifications')}
              className="relative flex items-center justify-center w-[42px] h-[42px] rounded-full bg-white/20 backdrop-blur-md border border-white/20 active:bg-white/30 transition-colors pointer-events-auto shadow-lg"
            >
              <BellOutline className="w-[20px] h-[20px]" color="white" />
              {totalPending > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#EF4444] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none border border-white/20 shadow-sm">
                  {totalPending > 9 ? '9+' : totalPending}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Stats Card Overlay ── */}
        <div className="relative z-10 flex flex-col px-4 -mt-[40px] pointer-events-none">
          <div className="bg-white rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] border border-slate-400/30 p-[24px] flex flex-col gap-5 pointer-events-auto">
            <div className="flex">
              <span className="font-proxima font-bold bg-[#1152d4] text-white text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full">
                {user.role === 'hq_admin' ? 'HQ Admin' : 'Chapter Officer'}
              </span>
            </div>

            {/* Stats Grid with Dividers */}
            <div className="flex items-center justify-between">
              <div className="flex-1 flex flex-col">
                <span className="font-proxima text-[12px] text-[#6b7280] uppercase tracking-wide">Events</span>
                <span className="font-proxima font-extrabold text-[28px] text-[#464646]">{chapterEvents.length}</span>
              </div>
              
              <div className="w-px h-10 bg-slate-100 mx-4" />
              
              <div className="flex-1 flex flex-col">
                <span className="font-proxima text-[12px] text-[#6b7280] uppercase tracking-wide">Members</span>
                <span className="font-proxima font-extrabold text-[28px] text-[#464646]">{membersCount}</span>
              </div>
              
              <div className="w-px h-10 bg-slate-100 mx-4" />
              
              <div className="flex-1 flex flex-col">
                <span className="font-proxima text-[12px] text-[#6b7280] uppercase tracking-wide">Pending</span>
                <span className="font-proxima font-extrabold text-[28px] text-[#464646]">{totalPending}</span>
              </div>
            </div>

            <motion.button
              onClick={() => navigate('/organizer/events/create')}
              className="font-proxima font-semibold w-full bg-[#1152d4] text-white text-[16px] h-12 rounded-[80px] flex items-center justify-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <AddCircleOutline className="w-5 h-5" color="white" />
              Create Event
            </motion.button>
          </div>
        </div>
      </header>

      <motion.div
        className="p-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={fadeUp} className="bg-[#eef4ff] inline-flex self-start items-center p-1 rounded-full mb-4">
          {(['approvals', 'volunteers'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center justify-center px-5 py-1.5 rounded-full transition-all duration-300 ${
                activeTab === tab 
                  ? 'bg-[#1152d4] text-white shadow-sm' 
                  : 'text-black hover:bg-[#dbeafe]/50'
              }`}
            >
              <span className="font-proxima font-bold text-[16px]">
                {tab === 'approvals'
                  ? `Approvals${pendingRegistrations.length > 0 ? ` (${pendingRegistrations.length})` : ''}`
                  : `Volunteers${pendingVolunteers.length > 0 ? ` (${pendingVolunteers.length})` : ''}`}
              </span>
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {activeTab === 'approvals' && (
            <motion.div
              key="approvals"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-slate-100 rounded w-32" />
                          <div className="h-3 bg-slate-100 rounded w-48" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : pendingRegistrations.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-3">
                    <CheckCircleOutline className="w-7 h-7" color="#21C45D" />
                  </div>
                  <p className="text-md3-body-lg font-bold text-slate-700">All caught up!</p>
                  <p className="text-md3-body-md text-slate-400 mt-1">No pending registrations right now.</p>
                </div>
              ) : (
                <motion.div
                  className="space-y-3"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  <p className="text-md3-body-md text-slate-500 mb-2">
                    {pendingRegistrations.length} registration{pendingRegistrations.length !== 1 ? 's' : ''} awaiting approval
                  </p>
                  {registrations.map((reg) => (
                    <motion.div key={reg.id} variants={cardItem}>
                      <ApprovalCard
                        registration={reg}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'volunteers' && (
            <motion.div
              key="volunteers"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {volunteerError && (
                <div className="bg-red/5 border border-red/20 rounded-xl px-4 py-3 mb-3">
                  <p className="text-md3-label-md text-red">{volunteerError}</p>
                </div>
              )}
              {volunteerLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-slate-100 rounded w-32" />
                          <div className="h-3 bg-slate-100 rounded w-48" />
                          <div className="h-3 bg-slate-100 rounded w-40" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : volunteerApps.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-blue/10 flex items-center justify-center mx-auto mb-3">
                    <HeartOutline className="w-7 h-7" color="#1152D4" />
                  </div>
                  <p className="text-md3-body-lg font-bold text-slate-700">No volunteer applications yet.</p>
                  <p className="text-md3-body-md text-slate-400 mt-1">Applications will appear here when members apply.</p>
                </div>
              ) : (
                <motion.div
                  className="space-y-3"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {pendingVolunteers.length > 0 && (
                    <p className="text-md3-body-md text-slate-500 mb-2">
                      {pendingVolunteers.length} application{pendingVolunteers.length !== 1 ? 's' : ''} awaiting review
                    </p>
                  )}
                  {volunteerApps.map((app) => (
                    <motion.div key={app.id} variants={cardItem}>
                      <VolunteerApprovalCard
                        application={app}
                        onApprove={(id) => void approveApplication(id)}
                        onReject={(id) => void rejectApplication(id)}
                        onRevert={(id) => void revertApplication(id)}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
