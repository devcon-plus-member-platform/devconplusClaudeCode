import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftOutline, CheckCircleOutline, CloseCircleLineDuotone, CloseCircleOutline, RestartOutline, UserCheckOutline, ClipboardListOutline, UserSpeakOutline, UsersGroupRoundedOutline, DownloadOutline, MagniferOutline, SortFromTopToBottomOutline, SortFromBottomToTopOutline, PenOutline, LetterOutline, FilterOutline, AltArrowDownOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { supabase, getBridgeToken } from '../../../lib/supabase'
import { apiFetch } from '../../../lib/api'
import { buildRegistrationApprovedEmail } from '../../../lib/emailTemplates'
import { buildRegistrantMailtoUrl } from '../../../lib/registrantMailto'
import { buildCsv, downloadCsv, slugify, getPhilippineDateStamp } from '../../../lib/csv'

import { useEventsStore } from '../../../stores/useEventsStore'
import { useOrganizerUser } from '../../../stores/useOrgAuthStore'
import { useChaptersStore } from '../../../stores/useChaptersStore'
import { ApprovalCard, type Registration } from '../../../components/ApprovalCard'
import { StatusBadge } from '../../../components/StatusBadge'
import { fadeUp, staggerContainer, cardItem } from '../../../lib/animation'
import SendAnnouncementSheet from '../../../components/SendAnnouncementSheet'
import ConfirmDialog from '../../../components/ConfirmDialog'
import type { EventCapacitySummary, BulkRegistrationResult } from '@devcon-plus/supabase'

// ── Custom form field types ───────────────────────────────────────────────────

type CustomFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'radio'

interface CustomFormField {
  id: string
  label: string
  type: CustomFieldType
  required: boolean
  options: string[]
  allowOther?: boolean
}

// Free-text "Other" answers are stored tagged with this prefix by EventRegister.
const OTHER_PREFIX = '__other__:'
// Render a single stored response value, unwrapping the "Other" prefix into readable text.
function formatResponseValue(v: unknown): string {
  const str = String(v)
  if (str.startsWith(OTHER_PREFIX)) {
    const text = str.slice(OTHER_PREFIX.length).trim()
    return text ? `${text} (Other)` : 'Other'
  }
  return str
}

// Flatten one registrant's stored answer for a field into a single CSV cell.
function formatResponseCell(answer: unknown): string {
  if (answer === undefined || answer === null || answer === '') return ''
  if (Array.isArray(answer)) return answer.map(formatResponseValue).join(', ')
  return formatResponseValue(answer)
}

type RegistrantWithResponses = Registration & {
  form_responses?: Record<string, unknown> | null
}

// ── Registrant Detail View ────────────────────────────────────────────────────

interface RegistrantDetailViewProps {
  registration: RegistrantWithResponses
  formSchema: CustomFormField[]
  eventTitle: string
  onClose: () => void
  onApprove: (id: string) => Promise<boolean>
  onReject: (id: string) => Promise<boolean>
  onRevert: (id: string) => Promise<boolean>
  onCheckIn: (id: string) => Promise<boolean>
  buildMailto: (reg: RegistrantWithResponses) => string | null
}

function RegistrantDetailView({
  registration,
  formSchema,
  eventTitle,
  onClose,
  onApprove,
  onReject,
  onRevert,
  onCheckIn,
  buildMailto,
}: RegistrantDetailViewProps) {
  const [localReg, setLocalReg] = useState(registration)

  const initials = localReg.member_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const firstName = localReg.member_name.split(' ')[0]
  const lastInitial = localReg.member_name.split(' ')[1]?.[0]
  const shortName = lastInitial ? `${firstName} ${lastInitial}.` : firstName

  const formattedDate = new Date(localReg.registered_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Render the card whenever the event HAS questions — an event with questions
  // and a registrant with no answers must look different from an event that
  // never asked anything. Hiding the section made lost answers invisible.
  const hasQuestions = formSchema.length > 0
  const noResponsesRecorded = hasQuestions && !localReg.form_responses
  const answeredCount = formSchema.filter(f => {
    const v = localReg.form_responses?.[f.id]
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  }).length

  const handleApproveClick = async () => {
    const ok = await onApprove(localReg.id)
    if (ok) setLocalReg(prev => ({ ...prev, status: 'approved' as const }))
  }
  const handleRejectClick = async () => {
    const ok = await onReject(localReg.id)
    if (ok) setLocalReg(prev => ({ ...prev, status: 'rejected' as const }))
  }
  const handleRevertClick = async () => {
    const ok = await onRevert(localReg.id)
    if (ok) setLocalReg(prev => ({ ...prev, status: 'pending' as const }))
  }
  const handleCheckInClick = async () => {
    const ok = await onCheckIn(localReg.id)
    if (ok) setLocalReg(prev => ({ ...prev, checked_in: true }))
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-slate-50 flex flex-col"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      {/* Header */}
      <div className="bg-[#1152d4] pt-14 pb-4 px-4 flex items-center gap-3 shrink-0">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
        >
          <ArrowLeftOutline color="white" size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight truncate">
            {shortName}
          </h1>
          <p className="text-white/70 text-[13px] font-proxima truncate leading-none mt-0.5">
            {eventTitle}
          </p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Avatar hero */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-full bg-blue/10 flex items-center justify-center text-blue text-2xl font-black">
            {initials}
          </div>
          <div>
            <p className="text-[24px] font-bold text-slate-900">{localReg.member_name}</p>
            <p className="text-[12px] text-slate-400 mt-0.5">{localReg.member_email}</p>
            {localReg.school_or_company && (
              <p className="text-[12px] text-slate-400">{localReg.school_or_company}</p>
            )}
          </div>
          <StatusBadge status={localReg.status} />
        </div>

        {/* Registration info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Registered</p>
            <p className="text-[14px] text-slate-800">{formattedDate}</p>
          </div>
          {localReg.checked_in && (
            <>
              <div className="border-t border-slate-100" />
              <p className="text-[12px] text-green font-semibold flex items-center gap-1.5">
                <CheckCircleOutline color="#21C45D" size={14} />
                Checked In
              </p>
            </>
          )}
        </div>

        {/* Custom form responses — always fully expanded */}
        {hasQuestions && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[14px] font-bold text-slate-500 flex items-center gap-1.5">
                <ClipboardListOutline color="#94A3B8" size={14} />
                Registration Responses
              </p>
              <span className="bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 text-[10px] font-bold">
                {answeredCount}/{formSchema.length}
              </span>
            </div>
            {noResponsesRecorded && (
              <p className="text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-3">
                No responses recorded — this member registered before these questions
                were added, or before the response-saving fix shipped.
              </p>
            )}
            <div className="space-y-3">
              {formSchema.map((field, i) => {
                const answer = localReg.form_responses?.[field.id]
                const isEmpty =
                  answer === undefined || answer === null || answer === '' ||
                  (Array.isArray(answer) && answer.length === 0)
                return (
                  <div key={field.id}>
                    {i > 0 && <div className="border-t border-slate-100 mb-3" />}
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
                      {field.label}{field.required ? ' *' : ''}
                    </p>
                    <p className="text-[14px]">
                      {isEmpty
                        ? <span className="text-slate-300 italic">No answer</span>
                        : <span className="text-slate-800">{Array.isArray(answer) ? (answer as unknown[]).map(formatResponseValue).join(', ') : formatResponseValue(answer)}</span>
                      }
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="bg-white border-t border-slate-100 px-4 py-3 shrink-0">
        {localReg.status === 'pending' && (
          <div className="flex gap-2">
            <motion.button
              onClick={handleRejectClick}
              className="flex-1 py-3 text-[14px] font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-red/5 hover:border-red hover:text-red transition-colors flex items-center justify-center gap-1.5"
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <CloseCircleLineDuotone color="#EF4444" size={16} />
              Reject
            </motion.button>
            <motion.button
              onClick={handleApproveClick}
              className="flex-1 py-3 text-[14px] font-semibold rounded-xl bg-blue text-white hover:bg-blue-dark transition-colors flex items-center justify-center gap-1.5"
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <CheckCircleOutline color="white" size={16} />
              Approve
            </motion.button>
          </div>
        )}
        {localReg.status === 'approved' && !localReg.checked_in && (
          <motion.button
            onClick={handleCheckInClick}
            className="w-full py-3 text-[14px] font-semibold rounded-xl bg-green/10 text-green border border-green/20 hover:bg-green/20 transition-colors flex items-center justify-center gap-1.5"
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <UserCheckOutline color="#21C45D" size={16} />
            Check In
          </motion.button>
        )}
        {localReg.status === 'approved' && localReg.checked_in && (
          <p className="text-[14px] text-green font-semibold text-center py-3 flex items-center justify-center gap-1.5">
            <CheckCircleOutline color="#21C45D" size={16} />
            Checked In
          </p>
        )}
        {localReg.status === 'rejected' && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-red font-semibold flex items-center gap-1.5">
              <CloseCircleOutline color="#EF4444" size={14} />
              Registration rejected
            </p>
            <motion.button
              onClick={handleRevertClick}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors shrink-0"
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <RestartOutline color="#64748B" size={12} />
              Undo
            </motion.button>
          </div>
        )}
        {(localReg.status === 'approved' || localReg.status === 'rejected') && buildMailto(localReg) && (
          <a
            href={buildMailto(localReg)!}
            className="w-full mt-2 py-2.5 text-[13px] font-semibold rounded-xl border border-slate-200 text-slate-500 hover:border-blue hover:text-blue transition-colors flex items-center justify-center gap-1.5"
          >
            <LetterOutline color="currentColor" size={14} />
            Email Registrant
          </a>
        )}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected'
type MainTab = 'registrants' | 'volunteers'

const FILTER_OPTIONS: { id: FilterStatus; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'pending',  label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

interface VolunteerApplication {
  id: string
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  profiles: { full_name: string | null } | null
}

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export function OrgEventRegistrants() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // This screen is shared verbatim between /organizer/events/:id/registrants
  // and /admin/events/:id/registrants (see AdminEventRegistrants.tsx) — route
  // "Manage Event" to whichever edit surface matches the current session.
  // Organizer edit is its own route; admin edit is a slide-over on the events
  // list, so we hand it the target id via router state instead.
  const isAdminContext = location.pathname.startsWith('/admin')
  const { events, fetchEvents, fetchEventCapacity } = useEventsStore()

  const event = events.find((e) => e.id === id)
  const organizerUser = useOrganizerUser()
  const { getChapterById, fetchChapters } = useChaptersStore()
  const [registrants, setRegistrants] = useState<RegistrantWithResponses[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [loadError, setLoadError]     = useState<string | null>(null)
  const [filter, setFilter]           = useState<FilterStatus>('all')
  /** Mobile only — the status filter collapses into a single pill + menu. */
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [search, setSearch]           = useState('')
  const [sortOrder, setSortOrder]     = useState<'asc' | 'desc'>('desc')
  const [capacitySummary, setCapacitySummary] = useState<EventCapacitySummary | null>(null)
  const [showAnnounce, setShowAnnounce] = useState(false)
  const [mainTab, setMainTab]           = useState<MainTab>('registrants')
  const [volunteers, setVolunteers]     = useState<VolunteerApplication[]>([])
  const [volunteersLoading, setVolunteersLoading] = useState(false)
  const [volunteerSortOrder, setVolunteerSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedRegistrant, setSelectedRegistrant] = useState<RegistrantWithResponses | null>(null)

  // ── Bulk approve / reject ───────────────────────────────────────────────────
  // Select mode is strictly opt-in: until the organizer taps "Select" the list
  // behaves exactly as before, and the action buttons never write — they only
  // open the confirmation dialog.
  const [selectMode, setSelectMode]   = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction]   = useState<'approve' | 'reject' | null>(null)
  const [bulkRunning, setBulkRunning] = useState(false)
  /** > 0 → show the "approved without emails, announce instead?" nudge. */
  const [lastBulkApproved, setLastBulkApproved] = useState(0)

  // Custom form schema comes from the event's custom_form_schema (JSONB array),
  // sourced from the gateway-backed events store — NOT a direct Supabase read.
  // The gateway uses the service role and bypasses RLS, so it returns the schema
  // for HQ events (chapter_id = null) too. The old direct PostgREST read was
  // RLS-gated and returned nothing for null-chapter rows, which silently hid the
  // Registration Responses section on HQ events. This mirrors EventRegister.
  const formSchema: CustomFormField[] = Array.isArray(event?.custom_form_schema)
    ? (event.custom_form_schema as CustomFormField[])
    : []

  // On a hard load of this URL the store may be empty; populate it so the schema
  // (and event title) resolve.
  useEffect(() => {
    if (!event && id) void fetchEvents()
  }, [event, id, fetchEvents])

  useEffect(() => { void fetchChapters() }, [fetchChapters])

  // Fetch registrations with joined member profile data + form_responses
  useEffect(() => {
    if (!id) return
    setIsLoading(true)
    setLoadError(null)
    apiFetch<RegistrantWithResponses[]>(`/api/registrations/event/${id}`)
      .then((data) => {
        // Server returns member_name/email/school_or_company directly; add event_title
        setRegistrants(data.map((r) => ({ ...r, event_title: event?.title ?? '' })))
      })
      .catch((err: unknown) => {
        // Surface the real reason — a chapter-scope rejection (403/404) must not
        // masquerade as an empty "No registrants found" state.
        setLoadError(err instanceof Error ? err.message : 'Could not load registrants.')
      })
      .finally(() => setIsLoading(false))
  }, [id, event?.title])

  const refreshCapacity = async () => {
    if (!id) return
    try {
      setCapacitySummary(await fetchEventCapacity(id))
    } catch {
      // best-effort — the summary badge just stays hidden on failure
    }
  }

  useEffect(() => { void refreshCapacity() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchVolunteers = async () => {
    if (!id) return
    setVolunteersLoading(true)
    const { data } = await supabase
      .from('volunteer_applications')
      .select('id, reason, status, created_at, profiles(full_name)')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
    setVolunteers((data ?? []) as unknown as VolunteerApplication[])
    setVolunteersLoading(false)
  }

  useEffect(() => {
    if (mainTab === 'volunteers') {
      fetchVolunteers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, id])

  const handleApproveVolunteer = async (appId: string) => {
    if (!organizerUser?.id) return
    await apiFetch(`/api/volunteers/${appId}/approve`, { method: 'POST' }).catch(() => null)
    await fetchVolunteers()
  }

  const handleApprove = async (regId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/registrations/${regId}/approve`, { method: 'POST' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed.')
      return false
    }

    setRegistrants((prev) =>
      prev.map((r) => (r.id === regId ? { ...r, status: 'approved' as const } : r))
    )
    // Email notification — stays on edge function path (EmailModule migration separate)
    const reg = registrants.find((r) => r.id === regId)
    if (reg?.member_email && event) {
      const accessToken = getBridgeToken()
      if (accessToken) {
        const eventDate = event.event_date
          ? new Date(event.event_date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
          : 'Date TBA'
        const ticketUrl = `${window.location.origin}/events/${event.slug ?? event.id}/ticket`
        void supabase.functions.invoke('send-email', {
          body: {
            to: reg.member_email,
            subject: `You're approved for ${event.title}!`,
            html: buildRegistrationApprovedEmail({ memberName: reg.member_name, eventTitle: event.title, eventDate, eventLocation: event.location ?? undefined, pointsValue: event.points_value ?? 100, ticketUrl }),
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      }
    }
    void refreshCapacity()
    return true
  }

  const handleReject = async (regId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/registrations/${regId}/reject`, { method: 'POST' })
    } catch { return false }
    setRegistrants((prev) =>
      prev.map((r) => (r.id === regId ? { ...r, status: 'rejected' as const } : r))
    )
    void refreshCapacity()
    return true
  }

  const handleRevert = async (regId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/registrations/${regId}/revert`, { method: 'POST' })
    } catch { return false }
    setRegistrants((prev) =>
      prev.map((r) => (r.id === regId ? { ...r, status: 'pending' as const } : r))
    )
    void refreshCapacity()
    return true
  }

  const handleCheckIn = async (regId: string): Promise<boolean> => {
    if (!organizerUser?.id) return false
    try {
      const result = await apiFetch<{ success: boolean; member_name: string; points_awarded: number }>(
        `/api/registrations/${regId}/manual-checkin`,
        { method: 'POST' },
      )
      setRegistrants((prev) => prev.map((r) => r.id === regId ? { ...r, checked_in: true } : r))
      toast.success(`${result.member_name} checked in — +${result.points_awarded} pts`)
      return true
    } catch { return false }
  }

  const chapterLabel = event?.chapter_id
    ? `${(getChapterById(event.chapter_id)?.name ?? '').trim()} Chapter`
    : 'HQ'

  const getMailtoUrl = (reg: RegistrantWithResponses): string | null => {
    if (!event) return null
    return buildRegistrantMailtoUrl(
      reg,
      {
        title: event.title,
        event_date: event.event_date,
        location: event.location,
        points_value: event.points_value,
        chapterLabel,
      },
      organizerUser?.email,
    )
  }

  const handleManageEvent = () => {
    if (!id) return
    if (isAdminContext) {
      navigate('/admin/events', { state: { openEditEventId: id } })
    } else {
      navigate(`/organizer/events/${id}/edit`)
    }
  }

  const handleExportCsv = () => {
    const baseHeaders = [
      'member_name',
      'member_email',
      'school_or_company',
      'status',
      'checked_in',
      'registered_at',
    ]
    // One column per custom registration question (header = question label).
    // De-dupe labels so headers stay unique and don't collide with base columns.
    const used = new Set(baseHeaders)
    const columns = formSchema.map((field) => {
      const original = field.label || field.id
      let header = original
      let n = 2
      while (used.has(header)) header = `${original} (${n++})`
      used.add(header)
      return { id: field.id, header }
    })
    const headers = [...baseHeaders, ...columns.map((c) => c.header)]
    const rows = filtered.map((r) => {
      const responses = r.form_responses ?? {}
      const row: Record<string, string | number | boolean | null | undefined> = {
        member_name: r.member_name,
        member_email: r.member_email,
        school_or_company: r.school_or_company,
        status: r.status,
        checked_in: r.checked_in ?? false,
        registered_at: r.registered_at,
      }
      for (const col of columns) row[col.header] = formatResponseCell(responses[col.id])
      return row
    })
    const csv = buildCsv(headers, rows)
    const dateStamp = getPhilippineDateStamp()
    const label = event?.title ? `-${slugify(event.title)}` : ''
    const suffix = filter !== 'all' ? `-${filter}` : ''
    downloadCsv(`registrants-${dateStamp}${label}${suffix}.csv`, csv)
  }

  const statusFiltered = filter === 'all' ? registrants : registrants.filter((r) => r.status === filter)
  const query = search.trim().toLowerCase()
  const searched = query
    ? statusFiltered.filter((r) =>
        r.member_name.toLowerCase().includes(query) ||
        r.member_email.toLowerCase().includes(query) ||
        (r.school_or_company ?? '').toLowerCase().includes(query)
      )
    : statusFiltered
  const filtered = [...searched].sort((a, b) => {
    const diff = new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime()
    return sortOrder === 'asc' ? diff : -diff
  })

  const counts = {
    all:      registrants.length,
    pending:  registrants.filter((r) => r.status === 'pending').length,
    approved: registrants.filter((r) => r.status === 'approved').length,
    rejected: registrants.filter((r) => r.status === 'rejected').length,
  }

  // ── Bulk selection ──────────────────────────────────────────────────────────

  // Only 'pending' rows are actionable: approve_registration_with_capacity returns
  // invalid_status for anything else, and bulk reject filters on pending server-side.
  const pendingInView      = filtered.filter((r) => r.status === 'pending')
  const selectedCount      = selectedIds.size
  const allInViewSelected  = pendingInView.length > 0 && pendingInView.every((r) => selectedIds.has(r.id))
  const someInViewSelected = pendingInView.some((r) => selectedIds.has(r.id)) && !allInViewSelected

  const handleToggleSelect = useCallback((regId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(regId)) next.delete(regId)
      else next.add(regId)
      return next
    })
  }, [])

  const toggleSelectAllInView = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of pendingInView) {
        if (allInViewSelected) next.delete(r.id)
        else next.add(r.id)
      }
      return next
    })
  }

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  // The selection may only ever hold ids that still exist AND are still pending.
  // Covers approving one registrant from the detail view while it is selected, a
  // background refetch, and another officer's action landing on the next load.
  useEffect(() => {
    if (selectedIds.size === 0) return
    const pendingIds = new Set(
      registrants.filter((r) => r.status === 'pending').map((r) => r.id)
    )
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((rid) => pendingIds.has(rid)))
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrants])

  // Select mode is registrant-only — Volunteers has its own approve flow.
  useEffect(() => {
    if (mainTab !== 'registrants' && selectMode) exitSelectMode()
  }, [mainTab, selectMode, exitSelectMode])

  // Escape leaves select mode (desktop). Never while a batch is in flight, and
  // never while the filter menu is open — that Escape belongs to the menu.
  useEffect(() => {
    if (!selectMode) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bulkRunning && !filterMenuOpen) exitSelectMode()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectMode, bulkRunning, filterMenuOpen, exitSelectMode])

  // Escape closes the filter menu; it also closes when the panel is left.
  useEffect(() => {
    if (!filterMenuOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filterMenuOpen])

  useEffect(() => {
    if (mainTab !== 'registrants') setFilterMenuOpen(false)
  }, [mainTab])

  /** First few selected names, for the confirmation dialog. */
  const selectedNames = registrants
    .filter((r) => selectedIds.has(r.id))
    .map((r) => r.member_name)
  const namePreview =
    selectedNames.length <= 3
      ? selectedNames.join(', ')
      : `${selectedNames.slice(0, 3).join(', ')} and ${selectedNames.length - 3} more`

  const runBulk = async (action: 'approve' | 'reject') => {
    if (!id || selectedIds.size === 0) return
    setBulkRunning(true)

    // ALWAYS oldest-first, regardless of how the list is sorted on screen.
    // The server approves in the order it receives and stops when the event hits
    // capacity + no_show_buffer, so this order decides who gets the last seats —
    // that has to be first-come-first-served, not "whoever the current sort
    // toggle happens to float to the top". Rejects have no ceiling, so the order
    // is immaterial there; keeping one path avoids the two drifting apart.
    // Selections hidden by the current filter/search are still included — they
    // are still in `registrants`.
    const registrationIds = [...registrants]
      .filter((r) => selectedIds.has(r.id) && r.status === 'pending')
      .sort((a, b) =>
        new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime()
      )
      .map((r) => r.id)

    try {
      const res = await apiFetch<BulkRegistrationResult>(
        `/api/registrations/event/${id}/bulk-${action}`,
        { method: 'POST', body: JSON.stringify({ registrationIds }) },
      )

      // Patch from the authoritative `succeeded` list — never assume the whole
      // selection landed (capacity stop, or a concurrent write beat us to a row).
      const done = new Set(res.succeeded)
      const nextStatus = action === 'approve' ? ('approved' as const) : ('rejected' as const)
      setRegistrants((prev) =>
        prev.map((r) => (done.has(r.id) ? { ...r, status: nextStatus } : r))
      )
      setSelectedIds((prev) => new Set([...prev].filter((rid) => !done.has(rid))))

      const n = res.succeeded.length
      const noun = `registrant${n === 1 ? '' : 's'}`

      if (action === 'approve') {
        if (res.stoppedReason === 'capacity_full') {
          toast.warning(
            `Approved ${n} of ${res.requested} — event is full. ${res.skipped.length} left pending.`,
            { description: 'No approval emails were sent.' },
          )
        } else if (n > 0) {
          toast.success(`${n} ${noun} approved`, {
            description: 'No approval emails were sent — use Announce to notify them.',
            action: { label: 'Announce', onClick: () => setShowAnnounce(true) },
          })
        } else {
          toast.error('Nothing was approved.')
        }
        if (n > 0) setLastBulkApproved(n)
      } else if (n > 0) {
        toast.success(`${n} ${noun} rejected`)
      } else {
        toast.error('Nothing was rejected.')
      }

      if (res.failed.length > 0) {
        toast.error(`${res.failed.length} could not be updated — they may have changed status.`)
      }
      // Clean batch → drop out of select mode. Partial → stay, so the organizer
      // can see what was left behind and retry.
      if (res.failed.length === 0 && res.skipped.length === 0) exitSelectMode()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk action failed.')
    } finally {
      setBulkRunning(false)
      setBulkAction(null)
      void refreshCapacity() // ONCE for the whole batch — not per row
    }
  }

  const sortedVolunteers = [...volunteers].sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return volunteerSortOrder === 'asc' ? diff : -diff
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div
          className="bg-[#1152d4] relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Icons. The event title sits inside the title
              block (not on its own indented row) so it stays aligned with
              "Attendees" and truncates instead of pushing the header taller. */}
          <div className="relative z-10 px-4 pb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
              >
                <ArrowLeftOutline className="w-5 h-5" color="white" />
              </button>
              <div className="min-w-0">
                <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight truncate">
                  Attendees
                </h1>
                <p className="text-white/70 text-[13px] font-proxima truncate leading-none mt-1">
                  {event?.title ?? 'Event'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {mainTab === 'registrants' && filtered.length > 0 && (
                <button
                  onClick={handleExportCsv}
                  className="bg-white/20 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5
                             text-white text-md3-label-md font-bold active:bg-white/30 transition-colors shrink-0"
                >
                  <DownloadOutline className="w-3.5 h-3.5" color="white" />
                  Export
                </button>
              )}
              {event && (
                <button
                  onClick={() => setShowAnnounce(true)}
                  className="bg-white/20 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5
                             text-white text-md3-label-md font-bold active:bg-white/30 transition-colors shrink-0"
                >
                  <UserSpeakOutline className="w-3.5 h-3.5" color="white" />
                  Announce
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <motion.div
        className="p-4"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* Main tab switcher: Registrants | Volunteers, + Manage Event shortcut */}
        <motion.div variants={fadeUp} className="flex items-center justify-between gap-2 mb-4">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl min-w-0">
            {(['registrants', 'volunteers'] as MainTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setMainTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-md3-body-md font-semibold transition-colors capitalize flex items-center gap-1.5 whitespace-nowrap ${
                  mainTab === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'volunteers' && <UsersGroupRoundedOutline className="w-3.5 h-3.5" />}
                {tab === 'registrants' && <ClipboardListOutline className="w-3.5 h-3.5" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          {event && (
            <button
              onClick={handleManageEvent}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-blue/30 text-blue text-md3-body-md font-bold hover:bg-blue/5 transition-colors shrink-0 whitespace-nowrap"
            >
              <PenOutline className="w-3.5 h-3.5" />
              Manage<span className="hidden sm:inline"> Event</span>
            </button>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {mainTab === 'registrants' ? (
            <motion.div
              key="registrants-panel"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* Capacity summary — declared capacity vs. attendees so far, with a % bar */}
              {capacitySummary && (
                <motion.div
                  variants={fadeUp}
                  className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 mb-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-md3-label-md font-bold text-slate-500 flex items-center gap-1.5">
                      <UsersGroupRoundedOutline color="#94A3B8" width={14} height={14} />
                      Capacity
                    </p>
                    <p className="text-md3-body-md font-bold text-slate-900">
                      {capacitySummary.approved_count}
                      {capacitySummary.capacity != null && (
                        <span className="text-slate-400 font-semibold"> / {capacitySummary.capacity}</span>
                      )}
                      {capacitySummary.capacity != null && capacitySummary.no_show_buffer > 0 && (
                        <span className="text-slate-400 font-medium">
                          {' '}({capacitySummary.effective_cap ?? capacitySummary.capacity + capacitySummary.no_show_buffer} w/ buffer)
                        </span>
                      )}
                      <span className="text-slate-400 font-medium"> attendees</span>
                    </p>
                  </div>

                  {capacitySummary.capacity != null && (() => {
                    const capacity = capacitySummary.capacity
                    const buffer = capacitySummary.no_show_buffer
                    const effectiveCap = capacitySummary.effective_cap ?? capacity + buffer
                    const approved = capacitySummary.approved_count

                    // One continuous bar spanning effective_cap (capacity + buffer).
                    // Blue fills 0→capacity as approvals come in — hitting the capacity
                    // mark IS "100%". Only once approved passes capacity does the amber
                    // buffer segment start filling, continuing from that same mark to
                    // the true end of the bar (effective_cap).
                    const capacityMarkPct = effectiveCap > 0 ? (capacity / effectiveCap) * 100 : 100
                    const approvedInCapacity = Math.min(approved, capacity)
                    const approvedInBuffer = Math.max(0, Math.min(approved, effectiveCap) - capacity)
                    const approvedPct = effectiveCap > 0 ? (approvedInCapacity / effectiveCap) * 100 : 0
                    const bufferPct = effectiveCap > 0 ? (approvedInBuffer / effectiveCap) * 100 : 0
                    const isOverCapacity = approved > capacity
                    const percent = Math.round((approved / capacity) * 100)

                    return (
                      <>
                        <div className="relative w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          {buffer > 0 && (
                            <div
                              className="absolute inset-y-0 w-1 rounded-full bg-white z-10"
                              style={{ left: `${capacityMarkPct}%`, transform: 'translateX(-50%)' }}
                            />
                          )}
                          <motion.div
                            className={`absolute inset-y-0 left-0 bg-blue ${isOverCapacity ? '' : 'rounded-r-full'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${approvedPct}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                          />
                          {buffer > 0 && (
                            <motion.div
                              className={`absolute inset-y-0 bg-amber ${isOverCapacity ? 'rounded-r-full' : ''}`}
                              style={{ left: `${capacityMarkPct}%` }}
                              initial={{ width: 0 }}
                              animate={{ width: `${bufferPct}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-md3-label-md text-slate-400">
                            {approvedInCapacity} approved
                            {buffer > 0 && <> · {approvedInBuffer} approved in buffer</>}
                          </p>
                          <p className={`text-md3-label-md font-bold ${percent >= 90 ? 'text-red' : 'text-slate-500'}`}>
                            {percent}%
                          </p>
                        </div>
                      </>
                    )
                  })()}
                </motion.div>
              )}

              {/*
                Durable counterpart to the post-bulk toast. Bulk approvals send no
                email (the send-email edge function caps at 30/user/min and drops
                the rest silently), so nudge the organizer toward one announcement.
              */}
              {lastBulkApproved > 0 && (
                <motion.div
                  variants={fadeUp}
                  className="mb-4 rounded-xl border border-blue/30 bg-blue/5 p-3 flex items-center gap-3"
                >
                  <UserSpeakOutline size={16} color="#1152D4" />
                  <p className="flex-1 text-md3-label-md text-slate-700">
                    {lastBulkApproved} approved without emails. Send one announcement so they all know.
                  </p>
                  <button
                    onClick={() => { setShowAnnounce(true); setLastBulkApproved(0) }}
                    className="text-md3-label-md font-bold text-blue shrink-0"
                  >
                    Announce
                  </button>
                  <button
                    onClick={() => setLastBulkApproved(0)}
                    aria-label="Dismiss the announcement reminder"
                    className="shrink-0"
                  >
                    <CloseCircleOutline size={16} color="#94A3B8" />
                  </button>
                </motion.div>
              )}

              {/* Search by name, email, or school/company */}
              <div className="relative mb-4">
                <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  placeholder="Search by name, email, or school/company…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
                />
              </div>

              {/*
                Status filters + sort/select controls, one fixed-height row.
                On mobile the four statuses collapse into a single pill + menu —
                four chips alongside Sort and Select overflowed at 390px and read
                as a wall of pills. From md up there is room, so the chips show
                inline. White-outlined chip variant per the design system —
                `blue` on the organizer surface, not `primary`.
              */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 min-w-0 flex items-center">
                  {/* Mobile: collapsed status filter */}
                  <div className="relative md:hidden">
                    <button
                      onClick={() => setFilterMenuOpen((open) => !open)}
                      aria-haspopup="listbox"
                      aria-expanded={filterMenuOpen}
                      aria-label={`Filter by status — ${FILTER_OPTIONS.find((o) => o.id === filter)?.label}`}
                      className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 pl-3 pr-2.5 h-[30px] rounded-full border text-[12px] font-proxima transition-colors ${
                        filter === 'all'
                          ? 'bg-white text-slate-500 font-medium border-slate-200'
                          : 'bg-white text-blue font-semibold border-blue'
                      }`}
                    >
                      <FilterOutline size={14} color={filter === 'all' ? '#64748B' : '#1152D4'} />
                      {FILTER_OPTIONS.find((o) => o.id === filter)?.label} ({counts[filter]})
                      <AltArrowDownOutline
                        size={12}
                        color={filter === 'all' ? '#94A3B8' : '#1152D4'}
                        className={`transition-transform ${filterMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    <AnimatePresence>
                      {filterMenuOpen && (
                        <>
                          {/* Click-away catcher — sits under the menu, over the page */}
                          <div
                            aria-hidden="true"
                            className="fixed inset-0 z-40"
                            onClick={() => setFilterMenuOpen(false)}
                          />
                          <motion.div
                            role="listbox"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 top-full mt-2 z-50 w-48 bg-white rounded-2xl border border-slate-200 shadow-card p-1"
                          >
                            {FILTER_OPTIONS.map((opt) => (
                              <button
                                key={opt.id}
                                role="option"
                                aria-selected={filter === opt.id}
                                onClick={() => { setFilter(opt.id); setFilterMenuOpen(false) }}
                                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13px] font-proxima transition-colors ${
                                  filter === opt.id
                                    ? 'bg-blue/5 text-blue font-semibold'
                                    : 'text-slate-700 font-medium hover:bg-slate-50'
                                }`}
                              >
                                {opt.label}
                                <span className="flex items-center gap-2 shrink-0">
                                  <span className={`text-[11px] font-bold ${filter === opt.id ? 'text-blue' : 'text-slate-400'}`}>
                                    {counts[opt.id]}
                                  </span>
                                  {filter === opt.id && <CheckCircleOutline size={14} color="#1152D4" />}
                                </span>
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* md+: the same statuses inline */}
                  <div className="hidden md:flex gap-2 overflow-x-auto no-scrollbar w-full">
                    {FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setFilter(opt.id)}
                        className={`shrink-0 whitespace-nowrap px-3.5 h-[30px] flex items-center rounded-full border text-[12px] font-proxima transition-colors ${
                          filter === opt.id
                            ? 'bg-white text-blue font-semibold border-blue'
                            : 'bg-white text-slate-500 font-medium border-slate-200'
                        }`}
                      >
                        {opt.label} ({counts[opt.id]})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    title={sortOrder === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
                    className="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 h-[30px] rounded-full border border-slate-200 bg-white text-[12px] font-proxima font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    {sortOrder === 'desc' ? (
                      <SortFromTopToBottomOutline className="w-3.5 h-3.5" color="#64748B" />
                    ) : (
                      <SortFromBottomToTopOutline className="w-3.5 h-3.5" color="#64748B" />
                    )}
                    {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
                  </button>
                  {/* `|| selectMode` keeps Cancel reachable if the last pending
                      row is approved (here or by another officer) mid-selection. */}
                  {(counts.pending > 0 || selectMode) && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                      aria-pressed={selectMode}
                      className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 h-[30px] rounded-full border text-[12px] font-proxima font-semibold transition-colors ${
                        selectMode
                          ? 'bg-blue text-white border-blue shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {selectMode ? (
                        <CloseCircleOutline size={14} color="#FFFFFF" />
                      ) : (
                        <CheckCircleOutline size={14} color="#64748B" />
                      )}
                      {selectMode ? 'Cancel' : 'Select'}
                    </motion.button>
                  )}
                </div>
              </div>

              {/* Bulk select-all bar — only in select mode */}
              <AnimatePresence initial={false}>
                {selectMode && (
                  <motion.div
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="flex items-center justify-between gap-3 mb-4 px-3 py-2.5 bg-white rounded-xl border border-blue/30"
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer select-none min-w-0">
                      <input
                        type="checkbox"
                        className="w-4 h-4 shrink-0 accent-[#1152D4] cursor-pointer"
                        checked={allInViewSelected}
                        disabled={pendingInView.length === 0}
                        // Block body required — an implicit return is typed as a
                        // cleanup function under React 19 and fails `tsc -b`.
                        ref={(el) => {
                          if (el) el.indeterminate = someInViewSelected
                        }}
                        onChange={toggleSelectAllInView}
                      />
                      <span className="text-md3-body-md font-semibold text-slate-700 truncate">
                        {pendingInView.length === 0
                          ? 'No pending registrants in this view'
                          : `Select all pending in view (${pendingInView.length})`}
                      </span>
                    </label>
                    {selectedCount > 0 && (
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-md3-label-md font-bold text-blue shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
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
              ) : loadError ? (
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  className="bg-white rounded-2xl border border-red/20 p-12 text-center"
                >
                  <div className="w-14 h-14 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-3">
                    <CloseCircleOutline className="w-7 h-7" color="#EF4444" />
                  </div>
                  <p className="text-md3-body-lg font-bold text-slate-700">Couldn't load registrants</p>
                  <p className="text-md3-body-md text-slate-400 mt-1">{loadError}</p>
                </motion.div>
              ) : (
                <AnimatePresence mode="wait">
                  {filtered.length === 0 ? (
                    <motion.div
                      key="empty"
                      variants={fadeUp}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="bg-white rounded-2xl border border-slate-200 p-12 text-center"
                    >
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <ClipboardListOutline className="w-7 h-7" color="#94A3B8" />
                      </div>
                      <p className="text-md3-body-lg font-bold text-slate-700">No registrants found</p>
                      <p className="text-md3-body-md text-slate-400 mt-1">
                        {query
                          ? `No results for "${search.trim()}".`
                          : filter === 'all' ? 'No one has registered yet.' : `No ${filter} registrations.`}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={filter}
                      className="space-y-3"
                      variants={staggerContainer}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      {filtered.map((reg) => (
                        <motion.div key={reg.id} variants={cardItem}>
                          <ApprovalCard
                            registration={reg}
                            onClick={() => setSelectedRegistrant(reg)}
                            mailtoHref={getMailtoUrl(reg)}
                            selectable={selectMode && reg.status === 'pending'}
                            selected={selectedIds.has(reg.id)}
                            onToggleSelect={handleToggleSelect}
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}

              {/*
                Bulk action bar. `sticky`, not `fixed`: this panel is a motion.div
                running `fadeUp`, and a transformed ancestor re-parents fixed
                positioning. Sticky also scopes itself to whichever scroll
                container is active (organizer mobile / desktop card / admin main)
                with no per-layout offset math. bottom-24 clears the mobile
                floating pill nav; there is no nav on md+.
              */}
              {selectMode && (
                <div className="sticky bottom-24 md:bottom-4 z-40 mt-4">
                  <div className="bg-white/95 backdrop-blur border border-slate-200 shadow-card rounded-2xl p-3 flex items-center gap-2">
                    <p className="text-md3-label-md font-bold text-slate-700 pl-1 shrink-0" aria-live="polite">
                      {selectedCount} selected
                    </p>
                    <div className="flex-1" />
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      disabled={selectedCount === 0 || bulkRunning}
                      onClick={() => setBulkAction('reject')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red/30 text-red text-md3-label-lg font-bold disabled:opacity-40"
                    >
                      <CloseCircleOutline size={14} color="#EF4444" />
                      Reject
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      disabled={selectedCount === 0 || bulkRunning}
                      onClick={() => setBulkAction('approve')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue text-white text-md3-label-lg font-bold disabled:opacity-40"
                    >
                      <CheckCircleOutline size={14} color="#FFFFFF" />
                      Approve
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="volunteers-panel"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {volunteers.length > 0 && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setVolunteerSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    title={volunteerSortOrder === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
                    className="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 h-[30px] rounded-full border border-slate-200 bg-white text-[12px] font-proxima font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    {volunteerSortOrder === 'desc' ? (
                      <SortFromTopToBottomOutline className="w-3.5 h-3.5" color="#64748B" />
                    ) : (
                      <SortFromBottomToTopOutline className="w-3.5 h-3.5" color="#64748B" />
                    )}
                    {volunteerSortOrder === 'desc' ? 'Newest' : 'Oldest'}
                  </button>
                </div>
              )}
              {volunteersLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
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
              ) : volunteers.length === 0 ? (
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="visible"
                  className="bg-white rounded-2xl border border-slate-200 p-12 text-center"
                >
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <UsersGroupRoundedOutline className="w-7 h-7" color="#94A3B8" />
                  </div>
                  <p className="text-md3-body-lg font-bold text-slate-700">No volunteer applications yet.</p>
                  <p className="text-md3-body-md text-slate-400 mt-1">Applications will appear here once submitted.</p>
                </motion.div>
              ) : (
                <motion.div
                  className="space-y-3"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {sortedVolunteers.map((app) => (
                    <motion.div
                      key={app.id}
                      variants={cardItem}
                      className="bg-white rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-md3-body-md font-bold text-slate-900 truncate">
                            {app.profiles?.full_name ?? 'Unknown'}
                          </p>
                          {app.reason && (
                            <p className="text-md3-label-md text-slate-500 mt-1 line-clamp-2">
                              {app.reason}
                            </p>
                          )}
                        </div>
                        <span
                          className={`flex-shrink-0 text-md3-label-md font-semibold rounded-full px-2.5 py-1 ${
                            app.status === 'approved'
                              ? 'bg-green/10 text-green'
                              : app.status === 'rejected'
                              ? 'bg-red/10 text-red'
                              : 'bg-gold/10 text-gold'
                          }`}
                        >
                          {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                        </span>
                      </div>
                      {app.status === 'pending' && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleApproveVolunteer(app.id)}
                          className="mt-3 w-full py-2 bg-green text-white text-md3-label-md font-bold rounded-xl hover:bg-green/90 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <CheckCircleOutline className="w-3.5 h-3.5" />
                          Approve
                        </motion.button>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {event && (
        <SendAnnouncementSheet
          eventId={event.id}
          eventTitle={event.title}
          isOpen={showAnnounce}
          onClose={() => setShowAnnounce(false)}
        />
      )}

      {/*
        Mandatory confirmation before any bulk write. The action-bar buttons only
        set `bulkAction` — there is no path from a single tap to an approval. Past
        25 people the dialog also demands an explicit acknowledgement tick.
      */}
      {bulkAction && (
        <ConfirmDialog
          title={`${bulkAction === 'approve' ? 'Approve' : 'Reject'} ${selectedCount} registrant${selectedCount === 1 ? '' : 's'}?`}
          message={
            bulkAction === 'approve'
              ? `${namePreview} will be approved and get their QR ticket.`
              : `${namePreview} will be marked rejected. You can revert later.`
          }
          acknowledgement={
            selectedCount >= 25
              ? `I understand this ${bulkAction === 'approve' ? 'approves' : 'rejects'} ${selectedCount} people`
              : undefined
          }
          confirmLabel={`${bulkAction === 'approve' ? 'Approve' : 'Reject'} ${selectedCount}`}
          tone={bulkAction === 'approve' ? 'primary' : 'danger'}
          loading={bulkRunning}
          onConfirm={() => void runBulk(bulkAction)}
          onCancel={() => { if (!bulkRunning) setBulkAction(null) }}
        />
      )}

      <AnimatePresence>
        {selectedRegistrant && (
          <RegistrantDetailView
            key={selectedRegistrant.id}
            registration={selectedRegistrant}
            formSchema={formSchema}
            eventTitle={event?.title ?? ''}
            onClose={() => setSelectedRegistrant(null)}
            onApprove={handleApprove}
            onReject={handleReject}
            onRevert={handleRevert}
            onCheckIn={handleCheckIn}
            buildMailto={getMailtoUrl}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
