import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CloseCircleLineDuotone, CheckCircleOutline, CloseCircleOutline, StarOutline, UserOutline, LinkOutline, DocumentTextOutline, ClockCircleOutline } from 'solar-icon-set'
import { apiFetch } from '../../lib/api'
import { cardItem, slideUp, staggerContainer } from '../../lib/animation'
import type { SolarIcon } from '../../lib/icons'
import ConfirmDialog from '../../components/ConfirmDialog'
import { RejectModal } from './cmsPrimitives'

// ── Types ─────────────────────────────────────────────────────────────────

type SubmissionStatus = 'pending' | 'approved' | 'rejected'

interface SubmissionRow {
  id: string
  mission_id: string
  user_id: string
  pr_link: string | null
  status: SubmissionStatus
  admin_remarks: string | null
  reviewed_at: string | null
  submitted_at: string | null
  mission_title: string
  xp_reward: number
  member_name: string
  member_email: string
  spendable_points: number
  lifetime_points: number
}

interface PointTx {
  id: string
  amount: number
  description: string
  source: string | null
  created_at: string
}

const SUB_STATUS_TABS: { key: SubmissionStatus; label: string }[] = [
  { key: 'pending',  label: 'Pending'  },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

const SUB_STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending:  'bg-gold/10 text-slate-700',
  approved: 'bg-green/10 text-green',
  rejected: 'bg-red/10 text-red',
}

// Icon + tint per status — drives the colored indicator chip on the stats cards.
const SUB_STATUS_ICONS: Record<SubmissionStatus, { Icon: SolarIcon; color: string; bg: string }> = {
  pending:  { Icon: ClockCircleOutline, color: '#F8C630', bg: 'bg-gold/10'  },
  approved: { Icon: CheckCircleOutline, color: '#21C45D', bg: 'bg-green/10' },
  rejected: { Icon: CloseCircleOutline, color: '#EF4444', bg: 'bg-red/10'   },
}

function subInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
}

function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}


// ── Detail Sheet ──────────────────────────────────────────────────────────────

interface DetailSheetProps {
  sub: SubmissionRow
  history: PointTx[]
  historyLoading: boolean
  onClose: () => void
  onApprove: (sub: SubmissionRow) => void
  onReject: (sub: SubmissionRow) => void
  actionLoading: string | null
}

function SubmissionDetailSheet({ sub, history, historyLoading, onClose, onApprove, onReject, actionLoading }: DetailSheetProps) {
  const isProofLink = !!sub.pr_link && sub.pr_link !== 'submitted-for-approval'

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full bg-white rounded-t-3xl shadow-2xl z-10 max-h-[90vh] flex flex-col"
        variants={slideUp} initial="hidden" animate="visible" exit="hidden"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-md3-title-md font-bold text-slate-900">Submission Detail</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100">
            <CloseCircleLineDuotone color="#94A3B8" width={20} height={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5 pb-8">
          {/* Member */}
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
            <div className="w-12 h-12 rounded-full bg-blue flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-[16px] font-proxima">{subInitials(sub.member_name)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-md3-title-md font-bold text-slate-900 truncate">{sub.member_name}</p>
              <p className="text-md3-body-sm text-slate-500 truncate">{sub.member_email}</p>
              <div className="flex items-center gap-1 mt-1">
                <StarOutline color="#F8C630" width={12} height={12} />
                <span className="text-md3-label-sm text-slate-600 font-semibold">{sub.spendable_points.toLocaleString()} pts</span>
                <span className="text-md3-label-sm text-slate-400">spendable</span>
              </div>
            </div>
          </div>

          {/* Mission */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <DocumentTextOutline color="rgb(var(--color-primary))" width={16} height={16} />
              </div>
              <p className="text-md3-body-md font-bold text-slate-900">{sub.mission_title}</p>
            </div>
            <div className="pl-9 flex items-center gap-3">
              <span className="text-md3-label-sm font-bold text-green bg-green/10 px-2 py-0.5 rounded-full">+{sub.xp_reward} pts</span>
              <span className={`text-md3-label-sm font-bold px-2 py-0.5 rounded-full ${SUB_STATUS_COLORS[sub.status]}`}>
                {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
              </span>
            </div>
          </div>

          {/* Proof */}
          <div className="border border-slate-100 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <LinkOutline color="#94A3B8" width={16} height={16} />
              <p className="text-md3-label-md font-semibold text-slate-700">Submitted Proof</p>
            </div>
            {isProofLink ? (
              <a href={sub.pr_link!} target="_blank" rel="noopener noreferrer" className="text-md3-body-sm text-blue hover:underline break-all block">
                {sub.pr_link}
              </a>
            ) : (
              <p className="text-md3-body-sm text-slate-400 italic">Submitted for approval (no link provided)</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex items-start gap-2 text-md3-body-sm text-slate-500">
            <ClockCircleOutline color="#94A3B8" width={14} height={14} />
            <div className="space-y-0.5">
              {sub.submitted_at && <p>Submitted {fmtDateLong(sub.submitted_at)}</p>}
              {sub.reviewed_at && (
                <p>{sub.status === 'approved' ? 'Approved' : 'Rejected'} {fmtDateLong(sub.reviewed_at)}</p>
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
              <StarOutline color="#F8C630" width={16} height={16} />
              <p className="text-md3-label-md font-bold text-slate-700">Recent Point History</p>
            </div>
            {historyLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}
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
                className="flex-1 py-3 flex items-center justify-center gap-2 border border-red/40 text-red rounded-xl text-md3-body-md font-bold disabled:opacity-50 hover:bg-red/10 transition-colors"
              >
                <CloseCircleOutline color="#EF4444" width={20} height={20} />
                Reject
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onApprove(sub)}
                disabled={actionLoading === sub.id}
                className="flex-1 py-3 flex items-center justify-center gap-2 bg-blue text-white rounded-xl text-md3-body-md font-bold disabled:opacity-50 hover:bg-blue-dark transition-colors"
              >
                <CheckCircleOutline color="#FFFFFF" width={20} height={20} />
                {actionLoading === sub.id ? 'Approving…' : 'Approve & Award'}
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Submission Card ───────────────────────────────────────────────────────────

interface SubmissionCardProps {
  sub: SubmissionRow
  onTap: (sub: SubmissionRow) => void
  onApprove: (sub: SubmissionRow) => void
  onReject: (sub: SubmissionRow) => void
  actionLoading: string | null
}

function SubmissionCard({ sub, onTap, onApprove, onReject, actionLoading }: SubmissionCardProps) {
  return (
    <motion.div
      variants={cardItem}
      whileTap={{ scale: 0.97 }}
      onClick={() => onTap(sub)}
      className="bg-white rounded-2xl border border-slate-100 shadow-card p-4 cursor-pointer hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-blue flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-[13px] font-proxima">{subInitials(sub.member_name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-md3-body-md font-bold text-slate-900 truncate">{sub.member_name}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${SUB_STATUS_COLORS[sub.status]}`}>
              {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
            </span>
          </div>
          <p className="text-md3-label-sm text-slate-400 truncate">{sub.member_email}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-md3-label-sm font-semibold text-slate-700 truncate max-w-[180px]">{sub.mission_title}</span>
            <span className="text-[10px] font-bold text-green bg-green/10 px-1.5 py-0.5 rounded-full shrink-0">+{sub.xp_reward} pts</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {sub.status === 'pending'
              ? sub.submitted_at ? `Submitted ${fmtDateShort(sub.submitted_at)}` : 'Submitted'
              : sub.reviewed_at ? `Reviewed ${fmtDateShort(sub.reviewed_at)}` : 'Reviewed'}
          </p>
          {sub.status === 'rejected' && sub.admin_remarks && (
            <p className="text-[10px] text-red/80 mt-1 italic truncate">Rejected: {sub.admin_remarks}</p>
          )}
        </div>
      </div>

      {sub.status === 'pending' && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50 sm:justify-end">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={(e) => { e.stopPropagation(); onReject(sub) }}
            disabled={actionLoading === sub.id}
            className="flex-1 sm:flex-none sm:px-5 py-2 flex items-center justify-center gap-1.5 border border-red/40 text-red rounded-xl text-md3-label-md font-bold disabled:opacity-50 hover:bg-red/10 transition-colors"
          >
            <CloseCircleOutline color="#EF4444" width={14} height={14} />
            Reject
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={(e) => { e.stopPropagation(); onApprove(sub) }}
            disabled={actionLoading === sub.id}
            className="flex-1 sm:flex-none sm:px-5 py-2 flex items-center justify-center gap-1.5 bg-blue text-white rounded-xl text-md3-label-md font-bold disabled:opacity-50 hover:bg-blue-dark transition-colors"
          >
            <CheckCircleOutline color="#FFFFFF" width={14} height={14} />
            {actionLoading === sub.id ? 'Approving…' : 'Approve'}
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

/**
 * Point Submissions review surface (pending / approved / rejected mission
 * submissions). Embedded inside AdminMissions — the parent page owns the
 * outer padding and page header.
 */
export default function PointSubmissionsPanel() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStatus, setActiveStatus] = useState<SubmissionStatus>('pending')
  const [search, setSearch] = useState('')
  const [detailSub, setDetailSub] = useState<SubmissionRow | null>(null)
  const [history, setHistory] = useState<PointTx[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<SubmissionRow | null>(null)
  const [rejectLoading, setRejectLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<SubmissionRow[]>('/api/missions/submissions')
      setSubmissions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const loadHistory = async (userId: string) => {
    setHistoryLoading(true)
    try {
      const data = await apiFetch<PointTx[]>(`/api/points/admin/user/${userId}`)
      setHistory(data)
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const openDetail = (sub: SubmissionRow) => {
    setDetailSub(sub)
    void loadHistory(sub.user_id)
  }

  const closeDetail = () => {
    setDetailSub(null)
    setHistory([])
  }

  const [approveTarget, setApproveTarget] = useState<SubmissionRow | null>(null)

  const handleApprove = async (sub: SubmissionRow) => {
    setActionLoading(sub.id)
    setActionError(null)
    try {
      await apiFetch(`/api/missions/submissions/${sub.id}/approve`, { method: 'POST' })
      setSubmissions((prev) =>
        prev.map((s) => s.id === sub.id ? { ...s, status: 'approved' as SubmissionStatus, reviewed_at: new Date().toISOString() } : s)
      )
      setDetailSub(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectConfirm = async (subId: string, remarks: string) => {
    setRejectLoading(true)
    setActionError(null)
    try {
      await apiFetch(`/api/missions/submissions/${subId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ adminRemarks: remarks }),
      })
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === subId
            ? { ...s, status: 'rejected' as SubmissionStatus, admin_remarks: remarks, reviewed_at: new Date().toISOString() }
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

  const counts: Record<SubmissionStatus, number> = {
    pending:  submissions.filter((s) => s.status === 'pending').length,
    approved: submissions.filter((s) => s.status === 'approved').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
  }

  const filtered = submissions.filter((s) => {
    if (s.status !== activeStatus) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return s.member_name.toLowerCase().includes(q) || s.member_email.toLowerCase().includes(q) || s.mission_title.toLowerCase().includes(q)
  })

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-md3-body-md text-slate-500">Review mission submissions and award or reject points</p>
        <button onClick={() => void load()} className="px-3 py-2 bg-slate-100 text-slate-600 text-md3-label-md font-semibold rounded-xl hover:bg-slate-200 transition-colors shrink-0">
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {SUB_STATUS_TABS.map(({ key, label }) => {
          const { Icon, color, bg } = SUB_STATUS_ICONS[key]
          return (
            <div key={key} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${bg}`}>
                <Icon color={color} width={18} height={18} />
              </div>
              <p className={`text-md3-headline-sm font-black ${loading ? 'text-slate-300' : 'text-slate-900'}`}>
                {loading ? '—' : counts[key]}
              </p>
              <p className="text-md3-label-md text-slate-500 mt-0.5">{label}</p>
            </div>
          )
        })}
      </div>

      {/* Status filter pills + search */}
      <div className="flex gap-2 mb-4">
        {SUB_STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveStatus(key)}
            className={`flex-1 py-2 rounded-xl text-md3-label-md font-bold transition-colors relative ${
              activeStatus === key ? 'bg-blue text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-blue/30'
            }`}
          >
            {label}
            {key === 'pending' && counts.pending > 0 && activeStatus !== 'pending' && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                {counts.pending > 9 ? '9+' : counts.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <UserOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          placeholder="Search by name, email, or mission…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
        />
      </div>

      {(error || actionError) && (
        <p className="text-md3-body-sm text-red bg-red/5 border border-red/20 rounded-xl px-4 py-3 mb-4">{error ?? actionError}</p>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <StarOutline color="#CBD5E1" width={28} height={28} />
            </div>
            <p className="text-md3-body-lg font-bold text-slate-700">
              {search ? 'No results found' : `No ${activeStatus} submissions`}
            </p>
            <p className="text-md3-body-md text-slate-400 mt-1 max-w-xs">
              {search ? 'Try a different name or mission title.' : activeStatus === 'pending' ? 'All submissions have been reviewed.' : `${activeStatus.charAt(0).toUpperCase() + activeStatus.slice(1)} submissions will appear here.`}
            </p>
          </div>
        ) : (
          <motion.div key={activeStatus} variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
            {filtered.map((sub) => (
              <SubmissionCard
                key={sub.id}
                sub={sub}
                onTap={openDetail}
                onApprove={(s) => setApproveTarget(s)}
                onReject={(s) => setRejectTarget(s)}
                actionLoading={actionLoading}
              />
            ))}
            <p className="text-center text-md3-label-sm text-slate-400 pt-2">{filtered.length} submission{filtered.length !== 1 ? 's' : ''}</p>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {detailSub && (
          <SubmissionDetailSheet
            sub={detailSub}
            history={history}
            historyLoading={historyLoading}
            onClose={closeDetail}
            onApprove={(s) => setApproveTarget(s)}
            onReject={(s) => setRejectTarget(s)}
            actionLoading={actionLoading}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rejectTarget && (
          <RejectModal
            sub={rejectTarget}
            onConfirm={handleRejectConfirm}
            onClose={() => setRejectTarget(null)}
            loading={rejectLoading}
          />
        )}
      </AnimatePresence>

      {approveTarget && (
        <ConfirmDialog
          title="Approve & award points?"
          message={`${approveTarget.member_name || 'This member'} will be awarded ${approveTarget.xp_reward} pts for "${approveTarget.mission_title}". This can't be undone.`}
          confirmLabel="Approve & Award"
          tone="primary"
          loading={actionLoading === approveTarget.id}
          onConfirm={() => { void handleApprove(approveTarget).then(() => setApproveTarget(null)) }}
          onCancel={() => setApproveTarget(null)}
        />
      )}
    </div>
  )
}
