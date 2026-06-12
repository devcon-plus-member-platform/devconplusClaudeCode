import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  StarOutline,
  CheckCircleOutline,
  CloseCircleOutline,
  CloseCircleLineDuotone,
  ArrowLeftOutline,
  UserOutline,
  LinkOutline,
  DocumentTextOutline,
  ClockCircleOutline,
} from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { cardItem, staggerContainer, slideUp, backdrop } from '../../lib/animation'

// ── Types ──────────────────────────────────────────────────────────────────

type SubmissionStatus = 'pending' | 'approved' | 'rejected'

interface SubmissionRow {
  id: string
  mission_id: string
  user_id: string
  pr_link: string
  status: SubmissionStatus
  admin_remarks: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string
  missions: { title: string; xp_reward: number; description: string | null } | null
  profiles: { full_name: string; email: string; spendable_points: number; lifetime_points: number } | null
}

interface PointTransaction {
  id: string
  amount: number
  description: string
  source: string
  created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_TABS: { key: SubmissionStatus; label: string }[] = [
  { key: 'pending',  label: 'Pending'  },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending:  'bg-gold/10 text-slate-700',
  approved: 'bg-green/10 text-green',
  rejected: 'bg-red/10 text-red',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Reject Modal ───────────────────────────────────────────────────────────

interface RejectModalProps {
  submissionId: string
  memberName: string
  missionTitle: string
  onConfirm: (submissionId: string, remarks: string) => Promise<void>
  onClose: () => void
  loading: boolean
}

function RejectModal({ submissionId, memberName, missionTitle, onConfirm, onClose, loading }: RejectModalProps) {
  const [remarks, setRemarks] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!remarks.trim()) return
    void onConfirm(submissionId, remarks.trim())
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        variants={backdrop}
        initial="hidden"
        animate="visible"
        exit="hidden"
      />
      <motion.div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 pb-8 z-10"
        variants={slideUp}
        initial="hidden"
        animate="visible"
        exit="hidden"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-md3-title-md font-bold text-slate-900">Reject Submission</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <CloseCircleLineDuotone className="w-5 h-5" color="#EF4444" />
          </button>
        </div>
        <p className="text-md3-body-md text-slate-600 mb-5">
          Rejecting <span className="font-semibold text-slate-900">{memberName}</span>'s submission for{' '}
          <span className="font-semibold text-slate-900">{missionTitle}</span>. Admin remarks are required.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-md3-label-md font-semibold text-slate-700 block mb-1.5">
              Admin Remarks <span className="text-red">*</span>
            </label>
            <textarea
              ref={textareaRef}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              placeholder="Explain why this submission was rejected…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-red/40 resize-none"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">This will be visible to the member in their notification.</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-slate-200 rounded-xl text-md3-body-md font-semibold text-slate-600"
            >
              Cancel
            </button>
            <motion.button
              type="submit"
              disabled={loading || !remarks.trim()}
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-3 bg-red text-white rounded-xl text-md3-body-md font-bold disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Rejecting…' : 'Reject'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ── Detail Sheet ───────────────────────────────────────────────────────────

interface DetailSheetProps {
  sub: SubmissionRow
  history: PointTransaction[]
  historyLoading: boolean
  onClose: () => void
  onApprove: (sub: SubmissionRow) => void
  onReject: (sub: SubmissionRow) => void
  actionLoading: string | null
}

function DetailSheet({ sub, history, historyLoading, onClose, onApprove, onReject, actionLoading }: DetailSheetProps) {
  const isProofLink = sub.pr_link !== 'submitted-for-approval'

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        className="relative w-full bg-white rounded-t-3xl shadow-2xl z-10 max-h-[90vh] flex flex-col"
        variants={slideUp}
        initial="hidden"
        animate="visible"
        exit="hidden"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-md3-title-md font-bold text-slate-900">Submission Detail</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
            <CloseCircleLineDuotone className="w-5 h-5" color="#94A3B8" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5 pb-8">
          {/* User info */}
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
            <div className="w-12 h-12 rounded-full bg-blue flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-[16px] font-proxima">
                {initials(sub.profiles?.full_name)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-md3-title-md font-bold text-slate-900 truncate">{sub.profiles?.full_name ?? '—'}</p>
              <p className="text-md3-body-sm text-slate-500 truncate">{sub.profiles?.email ?? '—'}</p>
              <div className="flex items-center gap-1 mt-1">
                <StarOutline className="w-3 h-3" color="#F8C630" />
                <span className="text-md3-label-sm text-slate-600 font-semibold">
                  {(sub.profiles?.spendable_points ?? 0).toLocaleString()} pts
                </span>
                <span className="text-md3-label-sm text-slate-400">spendable</span>
              </div>
            </div>
          </div>

          {/* Mission info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <DocumentTextOutline className="w-4 h-4" color="rgb(var(--color-primary))" />
              </div>
              <p className="text-md3-body-md font-bold text-slate-900">{sub.missions?.title ?? '—'}</p>
            </div>
            {sub.missions?.description && (
              <p className="text-md3-body-sm text-slate-500 pl-9 leading-relaxed">{sub.missions.description}</p>
            )}
            <div className="pl-9 flex items-center gap-3">
              <span className="text-md3-label-sm font-bold text-green bg-green/10 px-2 py-0.5 rounded-full">
                +{sub.missions?.xp_reward ?? 0} pts
              </span>
              <span className={`text-md3-label-sm font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[sub.status]}`}>
                {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
              </span>
            </div>
          </div>

          {/* Proof */}
          <div className="border border-slate-100 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <LinkOutline className="w-4 h-4" color="#94A3B8" />
              <p className="text-md3-label-md font-semibold text-slate-700">Submitted Proof</p>
            </div>
            {isProofLink ? (
              <a
                href={sub.pr_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-md3-body-sm text-blue hover:underline break-all block"
              >
                {sub.pr_link}
              </a>
            ) : (
              <p className="text-md3-body-sm text-slate-400 italic">
                Submitted for approval (no link provided)
              </p>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex items-start gap-2 text-md3-body-sm text-slate-500">
            <ClockCircleOutline className="w-3.5 h-3.5 mt-0.5 shrink-0" color="#94A3B8" />
            <div className="space-y-0.5">
              <p>Submitted {fmtDate(sub.submitted_at)}</p>
              {sub.reviewed_at && (
                <p>
                  {sub.status === 'approved' ? 'Approved' : 'Rejected'}{' '}
                  {fmtDate(sub.reviewed_at)}
                </p>
              )}
            </div>
          </div>

          {/* Admin remarks (rejection) */}
          {sub.status === 'rejected' && sub.admin_remarks && (
            <div className="bg-red/5 border border-red/20 rounded-xl p-4">
              <p className="text-md3-label-md font-bold text-red mb-1">Admin Remarks</p>
              <p className="text-md3-body-sm text-slate-700 leading-relaxed">{sub.admin_remarks}</p>
            </div>
          )}

          {/* Point history */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <StarOutline className="w-4 h-4" color="#F8C630" />
              <p className="text-md3-label-md font-bold text-slate-700">Recent Point History</p>
            </div>
            {historyLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="text-md3-body-sm text-slate-400">No transactions yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-md3-body-sm text-slate-700 font-medium truncate">{tx.description}</p>
                      <p className="text-[10px] text-slate-400">{fmtDateShort(tx.created_at)}</p>
                    </div>
                    <span className={`text-md3-label-md font-bold ml-3 shrink-0 ${tx.amount >= 0 ? 'text-green' : 'text-red'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {sub.status === 'pending' && (
            <div className="flex gap-3 pt-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onReject(sub)}
                disabled={actionLoading === sub.id}
                className="flex-1 py-3 flex items-center justify-center gap-2 bg-red/10 text-red rounded-xl text-md3-body-md font-bold disabled:opacity-50 hover:bg-red/20 transition-colors"
              >
                <CloseCircleOutline className="w-5 h-5" color="#EF4444" />
                Reject
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onApprove(sub)}
                disabled={actionLoading === sub.id}
                className="flex-1 py-3 flex items-center justify-center gap-2 bg-green/10 text-green rounded-xl text-md3-body-md font-bold disabled:opacity-50 hover:bg-green/20 transition-colors"
              >
                <CheckCircleOutline className="w-5 h-5" color="#21C45D" />
                {actionLoading === sub.id ? 'Approving…' : 'Approve & Award'}
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Submission Card ────────────────────────────────────────────────────────

interface SubmissionCardProps {
  sub: SubmissionRow
  onTap: (sub: SubmissionRow) => void
  onApprove: (sub: SubmissionRow) => void
  onReject: (sub: SubmissionRow) => void
  actionLoading: string | null
}

function SubmissionCard({ sub, onTap, onApprove, onReject, actionLoading }: SubmissionCardProps) {
  const isProofLink = sub.pr_link !== 'submitted-for-approval'

  return (
    <motion.div
      variants={cardItem}
      whileTap={{ scale: 0.97 }}
      onClick={() => onTap(sub)}
      className="bg-white rounded-2xl border border-slate-100 shadow-card p-4 cursor-pointer active:bg-slate-50 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-blue flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-[13px] font-proxima">
            {initials(sub.profiles?.full_name)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + status */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-md3-body-md font-bold text-slate-900 truncate">
              {sub.profiles?.full_name ?? '—'}
            </p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[sub.status]}`}>
              {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
            </span>
          </div>

          {/* Email */}
          <p className="text-md3-label-sm text-slate-400 truncate">{sub.profiles?.email ?? '—'}</p>

          {/* Mission + points */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-md3-label-sm font-semibold text-slate-700 truncate max-w-[180px]">
              {sub.missions?.title ?? '—'}
            </span>
            <span className="text-[10px] font-bold text-green bg-green/10 px-1.5 py-0.5 rounded-full shrink-0">
              +{sub.missions?.xp_reward ?? 0} pts
            </span>
            {isProofLink && (
              <span className="text-[10px] font-semibold text-blue bg-blue/10 px-1.5 py-0.5 rounded-full shrink-0">
                Link
              </span>
            )}
          </div>

          {/* Date */}
          <p className="text-[10px] text-slate-400 mt-1">
            {sub.status === 'pending'
              ? `Submitted ${fmtDateShort(sub.submitted_at)}`
              : `Reviewed ${sub.reviewed_at ? fmtDateShort(sub.reviewed_at) : '—'}`}
          </p>

          {/* Rejection remarks preview */}
          {sub.status === 'rejected' && sub.admin_remarks && (
            <p className="text-[10px] text-red/80 mt-1 italic truncate">
              Rejected: {sub.admin_remarks}
            </p>
          )}
        </div>
      </div>

      {/* Quick actions for pending */}
      {sub.status === 'pending' && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={(e) => { e.stopPropagation(); onReject(sub) }}
            disabled={actionLoading === sub.id}
            className="flex-1 py-2 flex items-center justify-center gap-1.5 bg-red/10 text-red rounded-xl text-md3-label-md font-bold disabled:opacity-50 hover:bg-red/20 transition-colors"
          >
            <CloseCircleOutline className="w-3.5 h-3.5" color="#EF4444" />
            Reject
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={(e) => { e.stopPropagation(); onApprove(sub) }}
            disabled={actionLoading === sub.id}
            className="flex-1 py-2 flex items-center justify-center gap-1.5 bg-green/10 text-green rounded-xl text-md3-label-md font-bold disabled:opacity-50 hover:bg-green/20 transition-colors"
          >
            <CheckCircleOutline className="w-3.5 h-3.5" color="#21C45D" />
            {actionLoading === sub.id ? 'Approving…' : 'Approve'}
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AdminPointsApproval() {
  const { user } = useAuthStore()

  // Data
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [activeTab, setActiveTab] = useState<SubmissionStatus>('pending')
  const [search, setSearch] = useState('')
  const [detailSub, setDetailSub] = useState<SubmissionRow | null>(null)
  const [history, setHistory] = useState<PointTransaction[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<SubmissionRow | null>(null)
  const [rejectLoading, setRejectLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: dbErr } = await (supabase as any)
      .from('mission_submissions')
      .select(`
        *,
        missions:mission_id (title, xp_reward, description),
        profiles:user_id (full_name, email, spendable_points, lifetime_points)
      `)
      .order('submitted_at', { ascending: false })
      .limit(200)
    if (dbErr) {
      setError(dbErr.message as string)
    } else {
      setSubmissions((data ?? []) as SubmissionRow[])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const loadHistory = async (userId: string) => {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('point_transactions')
      .select('id, amount, description, source, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8)
    setHistory((data ?? []) as PointTransaction[])
    setHistoryLoading(false)
  }

  const openDetail = (sub: SubmissionRow) => {
    setDetailSub(sub)
    void loadHistory(sub.user_id)
  }

  const closeDetail = () => {
    setDetailSub(null)
    setHistory([])
  }

  const notifyUser = async (
    userId: string,
    type: 'points_approved' | 'points_rejected',
    missionTitle: string,
    points: number,
    remarks?: string,
  ) => {
    const title = type === 'points_approved' ? 'Points Approved!' : 'Submission Rejected'
    const message =
      type === 'points_approved'
        ? `Your submission for "${missionTitle}" was approved. +${points} pts have been added to your account.`
        : `Your submission for "${missionTitle}" was rejected. Remarks: ${remarks ?? 'No remarks provided.'}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('user_notifications')
      .insert({ user_id: userId, title, message, type })
  }

  const handleApprove = async (sub: SubmissionRow) => {
    if (!user) return
    setActionLoading(sub.id)
    setActionError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('approve_mission_winner' as never, { sub_id: sub.id } as never)
      if (rpcErr) throw rpcErr
      await notifyUser(
        sub.user_id,
        'points_approved',
        sub.missions?.title ?? 'Mission',
        sub.missions?.xp_reward ?? 0,
      )
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === sub.id
            ? { ...s, status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString() }
            : s
        )
      )
      setDetailSub(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectConfirm = async (submissionId: string, remarks: string) => {
    if (!user) return
    setRejectLoading(true)
    setActionError(null)
    const sub = submissions.find((s) => s.id === submissionId)
    try {
      const { error: rpcErr } = await supabase.rpc('reject_mission_submission' as never, {
        p_submission_id: submissionId,
        p_admin_remarks: remarks,
      } as never)
      if (rpcErr) throw rpcErr
      if (sub) {
        await notifyUser(
          sub.user_id,
          'points_rejected',
          sub.missions?.title ?? 'Mission',
          sub.missions?.xp_reward ?? 0,
          remarks,
        )
      }
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === submissionId
            ? {
                ...s,
                status: 'rejected',
                admin_remarks: remarks,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
              }
            : s
        )
      )
      setRejectTarget(null)
      setDetailSub(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setRejectLoading(false)
    }
  }

  // Derived data
  const filtered = submissions.filter((s) => {
    if (s.status !== activeTab) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      s.profiles?.full_name.toLowerCase().includes(q) ||
      s.profiles?.email.toLowerCase().includes(q) ||
      (s.missions?.title ?? '').toLowerCase().includes(q)
    )
  })

  const counts: Record<SubmissionStatus, number> = {
    pending:  submissions.filter((s) => s.status === 'pending').length,
    approved: submissions.filter((s) => s.status === 'approved').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Page Header ── */}
      <div className="px-4 md:px-8 pt-6 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <StarOutline className="w-5 h-5" color="rgb(var(--color-primary))" />
          </div>
          <div>
            <h1 className="text-md3-headline-sm font-black text-slate-900">Points Approval</h1>
            <p className="text-md3-body-md text-slate-500 mt-0.5">
              Review mission submissions and award points
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          {STATUS_TABS.map(({ key, label }) => (
            <div
              key={key}
              className={`rounded-2xl p-3 text-center border ${
                key === 'pending'
                  ? 'bg-gold/10 border-gold/20'
                  : key === 'approved'
                  ? 'bg-green/10 border-green/20'
                  : 'bg-red/10 border-red/20'
              }`}
            >
              <p className={`text-md3-headline-sm font-black ${
                key === 'pending' ? 'text-slate-900' : key === 'approved' ? 'text-green' : 'text-red'
              }`}>
                {isLoading ? '—' : counts[key]}
              </p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab Bar + Search ── */}
      <div className="px-4 md:px-8 pb-3 space-y-3">
        {/* Tab pills */}
        <div className="flex gap-2">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2 rounded-xl text-md3-label-md font-bold transition-colors relative ${
                activeTab === key
                  ? 'bg-blue text-white shadow-blue'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-blue/30'
              }`}
            >
              {label}
              {key === 'pending' && counts.pending > 0 && activeTab !== 'pending' && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                  {counts.pending > 9 ? '9+' : counts.pending}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <UserOutline
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            color="#94A3B8"
          />
          <input
            type="search"
            placeholder="Search by name, email, or mission…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
      </div>

      {/* ── Error Banner ── */}
      {(error || actionError) && (
        <div className="mx-4 md:mx-8 mb-3 px-4 py-3 bg-red/5 border border-red/20 rounded-xl">
          <p className="text-md3-body-sm text-red">{error ?? actionError}</p>
        </div>
      )}

      {/* ── List ── */}
      <div className="px-4 md:px-8 pb-24">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <StarOutline className="w-7 h-7" color="#CBD5E1" />
            </div>
            <p className="text-md3-body-lg font-bold text-slate-700">
              {search ? 'No results found' : `No ${activeTab} submissions`}
            </p>
            <p className="text-md3-body-md text-slate-400 mt-1 max-w-xs">
              {search
                ? 'Try a different name or mission title.'
                : activeTab === 'pending'
                ? 'All submissions have been reviewed.'
                : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} submissions will appear here.`}
            </p>
          </div>
        ) : (
          <motion.div
            key={activeTab}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {filtered.map((sub) => (
              <SubmissionCard
                key={sub.id}
                sub={sub}
                onTap={openDetail}
                onApprove={handleApprove}
                onReject={(s) => setRejectTarget(s)}
                actionLoading={actionLoading}
              />
            ))}
            <p className="text-center text-md3-label-sm text-slate-400 pt-2">
              {filtered.length} submission{filtered.length !== 1 ? 's' : ''}
            </p>
          </motion.div>
        )}
      </div>

      {/* ── Detail Sheet ── */}
      <AnimatePresence>
        {detailSub && (
          <DetailSheet
            sub={detailSub}
            history={history}
            historyLoading={historyLoading}
            onClose={closeDetail}
            onApprove={handleApprove}
            onReject={(s) => setRejectTarget(s)}
            actionLoading={actionLoading}
          />
        )}
      </AnimatePresence>

      {/* ── Reject Modal ── */}
      <AnimatePresence>
        {rejectTarget && (
          <RejectModal
            submissionId={rejectTarget.id}
            memberName={rejectTarget.profiles?.full_name ?? 'Member'}
            missionTitle={rejectTarget.missions?.title ?? 'Mission'}
            onConfirm={handleRejectConfirm}
            onClose={() => setRejectTarget(null)}
            loading={rejectLoading}
          />
        )}
      </AnimatePresence>

      {/* Scroll-to-top button on mobile when list is long */}
      {filtered.length > 10 && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-4 w-10 h-10 bg-blue text-white rounded-full shadow-blue flex items-center justify-center md:hidden"
          aria-label="Scroll to top"
        >
          <ArrowLeftOutline className="w-4 h-4 rotate-90" color="white" />
        </button>
      )}
    </div>
  )
}
