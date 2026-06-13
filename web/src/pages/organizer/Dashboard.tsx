import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CheckCircleOutline,
  BellOutline,
  AddCircleOutline,
  HeartOutline,
  BookOutline,
  ClipboardListOutline,
  SquareAcademicCapOutline,
  RocketOutline,
  AltArrowRightOutline,
  LinkOutline,
  CalendarOutline,
  CloseCircleOutline,
} from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { ApprovalCard, type Registration } from '../../components/ApprovalCard'
import { VolunteerApprovalCard } from '../../components/VolunteerApprovalCard'
import { useOrganizerUser } from '../../stores/useOrgAuthStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { useEventsStore } from '../../stores/useEventsStore'
import { useOrgVolunteerStore } from '../../stores/useOrgVolunteerStore'
import { supabase } from '../../lib/supabase'
import { fadeUp, staggerContainer, cardItem } from '../../lib/animation'
import { OFFICER_CATEGORY_META } from '../../lib/officerResources'
import logoMark from '../../assets/logos/logo-mark.svg'

type TabId = 'approvals' | 'volunteers'
type ApprovalFilterId = 'all' | 'registrations' | 'missions'

interface PendingMissionSubmission {
  id: string
  mission_id: string
  user_id: string
  mission_title: string
  member_name: string
  submitted_at: string
  pr_link: string
  submission_type: 'self_attest' | 'proof_upload'
  xp_reward: number
}

// Flower-of-life / Clover pattern matching Figma branding
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

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
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilterId>('all')
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [missionSubmissions, setMissionSubmissions] = useState<PendingMissionSubmission[]>([])
  const [membersCount, setMembersCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMission, setSelectedMission] = useState<PendingMissionSubmission | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [showRejectPanel, setShowRejectPanel] = useState(false)
  const [rejectFeedback, setRejectFeedback] = useState('')
  const [rejectFeedbackError, setRejectFeedbackError] = useState(false)

  const chapterId = profile?.chapter_id ?? null

  useEffect(() => {
    const el = document.querySelector('[data-scroll-container]')
    if (!el) return
    const handleScroll = () => {
      const top = el.scrollTop
      setIsScrolled((prev) => {
        if (prev && top < 30) return false
        if (!prev && top > 60) return true
        return prev
      })
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

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

      // Fetch pending mission submissions for this chapter's members.
      // Missions are global, but the review queue is scoped to the submitting
      // member's chapter — a submission only surfaces for that member's chapter officer.
      const { data: missData, error: missError } = await supabase
        .from('mission_submissions')
        .select(`
          id,
          mission_id,
          user_id,
          pr_link,
          status,
          submitted_at,
          missions(id, title, submission_type, xp_reward),
          profiles!inner(full_name, chapter_id)
        `)
        .eq('status', 'pending')
        .eq('profiles.chapter_id', chapterId)

      if (missError) {
        console.error('[OrgDashboard] failed to load pending mission submissions', missError)
      }

      const mappedMissions: PendingMissionSubmission[] = (missData ?? [])
        .map((row) => {
          const m = Array.isArray(row.missions) ? row.missions[0] : row.missions
          const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
          const mObj = m as { id?: string; title?: string; submission_type?: string | null; xp_reward?: number } | null
          const pObj = p as { full_name?: string } | null
          return {
            id:              row.id,
            mission_id:      row.mission_id ?? '',
            user_id:         row.user_id ?? '',
            mission_title:   mObj?.title ?? '',
            member_name:     pObj?.full_name ?? 'Unknown',
            submitted_at:    row.submitted_at ?? '',
            pr_link:         row.pr_link ?? '',
            submission_type: (mObj?.submission_type === 'proof_upload' ? 'proof_upload' : 'self_attest') as 'self_attest' | 'proof_upload',
            xp_reward:       mObj?.xp_reward ?? 0,
          }
        })
        .filter((s) => s.submission_type === 'self_attest' || s.submission_type === 'proof_upload')
      setMissionSubmissions(mappedMissions)

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

  const closeReviewSheet = () => {
    if (actionLoading) return
    setSelectedMission(null)
    setShowRejectPanel(false)
    setRejectFeedback('')
    setRejectFeedbackError(false)
  }

  const handleApproveMission = async (sub: PendingMissionSubmission) => {
    setActionLoading(true)
    const { error } = await supabase.rpc('approve_mission_submission' as never, { sub_id: sub.id } as never)
    if (!error) {
      setMissionSubmissions((prev) => prev.filter((m) => m.id !== sub.id))
      closeReviewSheet()
      toast.success(`Approved — +${sub.xp_reward} XP awarded to ${sub.member_name.split(' ')[0]}`)
    } else {
      toast.error('Could not approve submission. Try again.')
    }
    setActionLoading(false)
  }

  const handleRejectMission = async (sub: PendingMissionSubmission, reason: string) => {
    setActionLoading(true)
    const { error } = await supabase.rpc('reject_mission_submission' as never, {
      sub_id: sub.id,
      p_reason: reason.trim() || null,
    } as never)
    if (!error) {
      setMissionSubmissions((prev) => prev.filter((m) => m.id !== sub.id))
      closeReviewSheet()
      toast.success(`Submission rejected — feedback sent to ${sub.member_name.split(' ')[0]}`)
    } else {
      toast.error('Could not reject submission. Try again.')
    }
    setActionLoading(false)
  }

  const handleConfirmReject = (sub: PendingMissionSubmission) => {
    if (!rejectFeedback.trim()) {
      setRejectFeedbackError(true)
      return
    }
    setRejectFeedbackError(false)
    void handleRejectMission(sub, rejectFeedback)
  }

  if (!user) return null

  const chapterEvents = events.filter((e) => e.chapter_id === chapterId)
  const pendingRegistrations = registrations.filter((r) => r.status === 'pending')
  const pendingVolunteers = volunteerApps.filter((a) => a.status === 'pending')
  const totalPending = pendingRegistrations.length + pendingVolunteers.length + missionSubmissions.length
  const approvalsCount = pendingRegistrations.length + missionSubmissions.length

  const visibleRegistrations =
    approvalFilter === 'missions' ? [] : registrations
  const visibleMissions =
    approvalFilter === 'registrations' ? [] : missionSubmissions
  const approvalsEmpty = visibleRegistrations.length === 0 && visibleMissions.length === 0

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Glassmorphism Background ── */}
        <div className="absolute inset-0 bg-transparent pointer-events-auto -z-10" />

        {/* ── Blue Background Container ── */}
        <motion.div
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto"
          initial={false}
          animate={{ paddingBottom: isScrolled ? 16 : 64 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
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
        </motion.div>

        {/* ── Stats Card Overlay — collapses on scroll ── */}
        <motion.div
          className="relative z-10 flex flex-col overflow-hidden px-4"
          initial={false}
          animate={{
            maxHeight:    isScrolled ? 0   : 300,
            opacity:      isScrolled ? 0   : 1,
            marginTop:    isScrolled ? 0   : -40,
            marginBottom: isScrolled ? 0   : 8,
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          <div className="bg-white rounded-2xl shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] border border-slate-200 p-[24px] flex flex-col gap-5 pointer-events-auto">
            <div className="flex">
              <span className="font-proxima font-bold bg-primary text-white text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full">
                {user.role === 'hq_admin' ? 'HQ Admin' : 'Chapter Officer'}
              </span>
            </div>

            {/* Stats Grid with Dividers */}
            <div className="flex items-center justify-between">
              <div className="flex-1 flex flex-col">
                <span className="font-proxima text-[12px] text-slate-500 uppercase tracking-wide">Events</span>
                <span className="font-proxima font-extrabold text-[28px] text-slate-900">{chapterEvents.length}</span>
              </div>

              <div className="w-px h-10 bg-slate-100 mx-4" />

              <div className="flex-1 flex flex-col">
                <span className="font-proxima text-[12px] text-slate-500 uppercase tracking-wide">Members</span>
                <span className="font-proxima font-extrabold text-[28px] text-slate-900">{membersCount}</span>
              </div>

              <div className="w-px h-10 bg-slate-100 mx-4" />

              <div className="flex-1 flex flex-col">
                <span className="font-proxima text-[12px] text-slate-500 uppercase tracking-wide">To Review</span>
                <span className="font-proxima font-extrabold text-[28px] text-slate-900">{totalPending}</span>
              </div>
            </div>

            <motion.button
              onClick={() => navigate('/organizer/events/create')}
              className="font-proxima font-semibold w-full bg-primary text-white text-[16px] h-12 rounded-full flex items-center justify-center gap-2"
              whileTap={{ scale: 0.95 }}
            >
              <AddCircleOutline className="w-5 h-5" color="white" />
              Create Event
            </motion.button>

          </div>
        </motion.div>
      </header>

      <motion.div
        className="px-4 pb-4"
        initial={false}
        animate={{ paddingTop: isScrolled ? 80 : 16 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* ── Colored action tiles ── */}
        <motion.section variants={fadeUp} className="flex gap-3 mb-4">
          {/* Manage Missions — purple tile */}
          <motion.button
            onClick={() => navigate('/organizer/missions')}
            className="flex-1 bg-[rgba(124,58,237,0.10)] border border-[rgba(124,58,237,0.12)] flex flex-col gap-1.5 items-center justify-center rounded-[16px] shadow-[0px_0px_8px_0px_rgba(40,0,80,0.08)] py-3"
            whileTap={{ scale: 0.95 }}
          >
            <div className="bg-white flex items-center justify-center rounded-full w-[36px] h-[36px] shadow-sm">
              <RocketOutline color="#7C3AED" size={18} />
            </div>
            <span className="font-proxima font-semibold text-slate-900 text-[10px] text-center leading-tight">Manage Missions</span>
          </motion.button>

          {/* Events — blue tile, faded, not tappable */}
          <div className="flex-1 bg-[rgba(17,82,212,0.10)] border border-[rgba(17,82,212,0.12)] flex flex-col gap-1.5 items-center justify-center rounded-[16px] shadow-[0px_0px_8px_0px_rgba(0,16,56,0.08)] py-3 opacity-45 select-none">
            <div className="bg-white flex items-center justify-center rounded-full w-[36px] h-[36px] shadow-sm">
              <CalendarOutline color="#1152D4" size={18} />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-proxima font-semibold text-slate-900 text-[10px] text-center leading-tight">Events</span>
              <span className="bg-slate-200 text-slate-500 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide leading-none">Soon</span>
            </div>
          </div>
        </motion.section>

        {/* ── Resource rows ── */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden mb-4 divide-y divide-slate-100">
          <motion.button
            onClick={() => navigate(`/officer-resources/${OFFICER_CATEGORY_META.resource.slug}`)}
            className="w-full flex items-center gap-3 px-4 h-[52px] active:bg-slate-50 transition-colors text-left"
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-8 h-8 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
              <BookOutline color="#1152D4" size={16} />
            </div>
            <span className="flex-1 font-proxima font-semibold text-slate-900 text-[14px]">Review Resources</span>
            <AltArrowRightOutline color="#CBD5E1" size={16} />
          </motion.button>

          <motion.button
            onClick={() => navigate(`/officer-resources/${OFFICER_CATEGORY_META.seed_funds.slug}`)}
            className="w-full flex items-center gap-3 px-4 h-[52px] active:bg-slate-50 transition-colors text-left"
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-8 h-8 rounded-xl bg-green/10 flex items-center justify-center shrink-0">
              <ClipboardListOutline color="rgb(70,144,17)" size={16} />
            </div>
            <span className="flex-1 font-proxima font-semibold text-slate-900 text-[14px]">Seed Fund Request</span>
            <AltArrowRightOutline color="#CBD5E1" size={16} />
          </motion.button>

          <motion.button
            onClick={() => navigate(`/officer-resources/${OFFICER_CATEGORY_META.training.slug}`)}
            className="w-full flex items-center gap-3 px-4 h-[52px] active:bg-slate-50 transition-colors text-left"
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-8 h-8 rounded-xl bg-[rgba(248,198,48,0.15)] flex items-center justify-center shrink-0">
              <SquareAcademicCapOutline color="#F8C630" size={16} />
            </div>
            <span className="flex-1 font-proxima font-semibold text-slate-900 text-[14px]">Training and Policy</span>
            <AltArrowRightOutline color="#CBD5E1" size={16} />
          </motion.button>
        </motion.div>

        {/* ── Inbox toggle: Approvals | Volunteers — grey-track segmented style ── */}
        <motion.div variants={fadeUp} className="bg-slate-100 flex p-1 rounded-xl mb-4">
          {(['approvals', 'volunteers'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-[14px] font-proxima font-semibold transition-all duration-200 ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              {tab === 'approvals'
                ? `Approvals${approvalsCount > 0 ? ` (${approvalsCount})` : ''}`
                : `Volunteers${pendingVolunteers.length > 0 ? ` (${pendingVolunteers.length})` : ''}`}
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
              {/* Filter pills: All | Registrations | Missions */}
              <div className="flex gap-2 mb-4 overflow-x-auto pb-0.5">
                {(['all', 'registrations', 'missions'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setApprovalFilter(f)}
                    className={`whitespace-nowrap px-4 h-[30px] flex items-center rounded-full text-[12px] font-proxima font-medium transition-colors ${
                      approvalFilter === f
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'bg-white border border-slate-300 text-slate-500'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'registrations' ? 'Registrations' : 'Missions'}
                  </button>
                ))}
              </div>

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
              ) : approvalsEmpty ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-3">
                    <CheckCircleOutline className="w-7 h-7" color="#21C45D" />
                  </div>
                  <p className="text-md3-body-lg font-bold text-slate-700">All caught up!</p>
                  <p className="text-md3-body-md text-slate-400 mt-1">Nothing to review right now.</p>
                </div>
              ) : (
                <motion.div
                  className="space-y-3"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {/* Registration rows */}
                  {visibleRegistrations.map((reg) => (
                    <motion.div key={reg.id} variants={cardItem}>
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="px-2 py-0.5 rounded-full bg-blue/10 text-blue text-[10px] font-semibold">Registration</span>
                      </div>
                      <ApprovalCard registration={reg} />
                    </motion.div>
                  ))}

                  {/* Mission submission rows */}
                  {visibleMissions.map((sub) => (
                    <motion.div key={sub.id} variants={cardItem}>
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="px-2 py-0.5 rounded-full bg-green/10 text-[#21C45D] text-[10px] font-semibold">Mission</span>
                      </div>
                      <motion.button
                        onClick={() => setSelectedMission(sub)}
                        className="w-full bg-white rounded-2xl border border-slate-200 p-4 shadow-card flex items-start gap-3 text-left"
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      >
                        <div className="w-10 h-10 rounded-full bg-green/10 flex items-center justify-center text-[#21C45D] text-md3-body-md font-bold shrink-0">
                          {sub.member_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-md3-body-md font-bold text-slate-900 truncate">{sub.member_name}</p>
                          <p className="text-md3-label-md text-slate-500 truncate">{sub.mission_title}</p>
                          {sub.submission_type === 'proof_upload' && sub.pr_link && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <LinkOutline color="#1152D4" size={10} />
                              <p className="text-[10px] text-blue truncate">{sub.pr_link}</p>
                            </div>
                          )}
                          <p className="text-md3-label-md text-slate-400 mt-1">{timeAgo(sub.submitted_at)}</p>
                        </div>
                        <AltArrowRightOutline color="#CBD5E1" size={16} />
                      </motion.button>
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
      </motion.div>

      {/* Mission Review Sheet */}
      <AnimatePresence>
        {selectedMission && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeReviewSheet}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl overflow-hidden shadow-xl max-w-lg mx-auto flex flex-col max-h-[85vh]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {/* Blue header */}
              <div className="bg-primary shrink-0 flex items-center gap-3 px-4 py-4">
                <motion.button
                  onClick={closeReviewSheet}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20"
                  whileTap={{ scale: 0.9 }}
                >
                  <CloseCircleOutline color="white" size={20} />
                </motion.button>
                <h2 className="flex-1 text-center font-proxima font-bold text-white text-md3-title-md leading-none pr-9">
                  Review Submission
                </h2>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 space-y-4">
                {/* Mission badge */}
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-green/10 text-[#21C45D] text-md3-label-sm font-proxima font-bold">
                  Mission
                </span>

                {/* Member + mission info */}
                <div>
                  <p className="font-proxima font-bold text-slate-900 text-md3-body-lg">{selectedMission.member_name}</p>
                  <p className="text-slate-700 text-md3-body-md mt-0.5">{selectedMission.mission_title}</p>
                  <p className="text-slate-400 text-md3-body-md mt-0.5">
                    Submission type:{' '}
                    {selectedMission.submission_type === 'proof_upload' ? 'Proof Upload' : 'Self Attest'}
                  </p>
                </div>

                {/* Submitted proof — proof_upload only */}
                {selectedMission.submission_type === 'proof_upload' &&
                  selectedMission.pr_link &&
                  (selectedMission.pr_link.startsWith('https://') || selectedMission.pr_link.startsWith('http://')) && (
                  <div>
                    <p className="font-proxima font-semibold text-slate-700 text-md3-body-md mb-2">Submitted proof</p>
                    <a
                      href={selectedMission.pr_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <LinkOutline color="#1152D4" size={16} />
                      <span className="text-blue text-md3-body-md underline break-all flex-1">
                        {selectedMission.pr_link}
                      </span>
                    </a>
                  </div>
                )}

                {/* Reject panel — animated */}
                <AnimatePresence>
                  {showRejectPanel && (
                    <motion.div
                      key="reject-panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="block font-proxima font-semibold text-slate-700 text-md3-body-md mb-2">
                            Feedback for the volunteer
                          </label>
                          <textarea
                            value={rejectFeedback}
                            onChange={(e) => {
                              setRejectFeedback(e.target.value)
                              if (e.target.value.trim()) setRejectFeedbackError(false)
                            }}
                            placeholder="Explain what needs to be fixed..."
                            rows={4}
                            className={`w-full font-proxima text-slate-900 text-md3-body-md bg-white border rounded-xl px-4 py-3 outline-none placeholder:text-slate-300 resize-none ${
                              rejectFeedbackError ? 'border-red' : 'border-slate-200'
                            }`}
                          />
                          {rejectFeedbackError && (
                            <p className="text-red text-md3-label-md mt-1.5 font-medium">
                              Feedback required to reject
                            </p>
                          )}
                        </div>
                        <motion.button
                          onClick={() => handleConfirmReject(selectedMission)}
                          disabled={actionLoading}
                          className="w-full h-12 rounded-full bg-slate-900 text-white font-proxima font-bold text-md3-label-lg disabled:opacity-40 transition-opacity"
                          whileTap={{ scale: 0.97 }}
                        >
                          {actionLoading ? 'Rejecting…' : 'Confirm Rejection'}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer actions */}
              <div className="shrink-0 border-t border-slate-100 px-5 py-4 flex gap-3">
                <motion.button
                  onClick={() => void handleApproveMission(selectedMission)}
                  disabled={actionLoading}
                  className="flex-1 h-12 rounded-full bg-slate-900 text-white font-proxima font-bold text-md3-label-lg disabled:opacity-40"
                  whileTap={{ scale: 0.95 }}
                >
                  Approve
                </motion.button>
                <motion.button
                  onClick={() => {
                    setShowRejectPanel((prev) => !prev)
                    setRejectFeedback('')
                    setRejectFeedbackError(false)
                  }}
                  disabled={actionLoading}
                  className="flex-1 h-12 rounded-full border border-slate-200 text-slate-700 font-proxima font-semibold text-md3-label-lg disabled:opacity-40"
                  whileTap={{ scale: 0.95 }}
                >
                  Reject
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
