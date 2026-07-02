import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleOutline, PenOutline, TrashBinTrashOutline, CheckCircleOutline, CloseCircleOutline } from 'solar-icon-set'
import { apiFetch } from '../../lib/api'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import ConfirmDialog from '../../components/ConfirmDialog'
import { INPUT_CLS, LABEL_CLS, SlideOver, ConfirmDelete, RejectModal, ToggleRow } from './cmsPrimitives'

// ── Missions ─────────────────────────────────────────────────────────────────

type MissionSubmissionType = 'proof_upload' | 'link' | 'self_attest'

const SUBMISSION_TYPE_LABELS: Record<MissionSubmissionType, string> = {
  proof_upload: 'Proof Upload (needs review)',
  link:         'Link (open URL)',
  self_attest:  'Submit for Approval (needs review)',
}

type MissionCompletionMode = 'multi' | 'single_winner'

const COMPLETION_MODE_LABELS: Record<MissionCompletionMode, string> = {
  multi:         'Multi-participant (everyone earns)',
  single_winner: 'Single winner (bounty — locks on first approval)',
}

interface MissionRow {
  id: string
  title: string
  description: string | null
  xp_reward: number
  difficulty: 'easy' | 'medium' | 'hard'
  status: 'available' | 'claimed'
  completion_mode: MissionCompletionMode
  submission_type: MissionSubmissionType
  github_url: string | null
  is_active: boolean
  created_at: string
}

interface MissionSubmissionRow {
  id: string
  mission_id: string
  user_id: string
  pr_link: string | null
  status: 'pending' | 'approved'
  submitted_at: string
  // Flat fields returned by GET /api/missions/queue (see server MissionSubmissionWithDetails)
  mission_title: string
  member_name: string
  member_email: string
}

interface MissionForm {
  title: string
  description: string
  xp_reward: string
  difficulty: 'easy' | 'medium' | 'hard'
  completion_mode: MissionCompletionMode
  submission_type: MissionSubmissionType
  github_url: string
  is_active: boolean
}

const defaultMissionForm = (): MissionForm => ({
  title: '',
  description: '',
  xp_reward: '100',
  difficulty: 'medium',
  completion_mode: 'multi',
  submission_type: 'proof_upload',
  github_url: '',
  is_active: true,
})

const DIFF_COLORS = {
  easy:   'bg-green/10 text-green',
  medium: 'bg-amber-100 text-amber-700',
  hard:   'bg-red/10 text-red',
} as const

export default function AdminMissions() {
  const [subTab, setSubTab] = useState<'manage' | 'queue'>('manage')

  // ── Mission CRUD ──────────────────────────────────────────────────────────
  const [rows, setRows] = useState<MissionRow[]>([])
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<MissionRow | null>(null)
  const [form, setForm] = useState<MissionForm>(defaultMissionForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Review queue ──────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<MissionSubmissionRow[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<MissionSubmissionRow | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null)
  const [approveTarget, setApproveTarget] = useState<MissionSubmissionRow | null>(null)
  const [toggleTarget, setToggleTarget] = useState<MissionRow | null>(null)

  const { pageItems: missionItems, ...missionPagination } = usePagination(rows, 10)
  const { pageItems: queueItems, ...queuePagination } = usePagination(queue, 10)

  const loadMissions = async () => {
    setLoadingMissions(true)
    try {
      const data = await apiFetch<MissionRow[]>('/api/missions/admin')
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load missions')
    } finally {
      setLoadingMissions(false)
    }
  }

  const loadQueue = async () => {
    setLoadingQueue(true)
    try {
      const data = await apiFetch<MissionSubmissionRow[]>('/api/missions/queue')
      setQueue(data)
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Failed to load queue')
    } finally {
      setLoadingQueue(false)
    }
  }

  useEffect(() => { void loadMissions() }, [])
  useEffect(() => { if (subTab === 'queue') void loadQueue() }, [subTab])

  const openCreate = () => {
    setEditingItem(null)
    setForm(defaultMissionForm())
    setSlideOver('create')
  }
  const openEdit = (m: MissionRow) => {
    setEditingItem(m)
    setForm({
      title:           m.title,
      description:     m.description ?? '',
      xp_reward:       String(m.xp_reward),
      difficulty:      m.difficulty,
      completion_mode: m.completion_mode ?? 'multi',
      submission_type: m.submission_type ?? 'proof_upload',
      github_url:      m.github_url ?? '',
      is_active:       m.is_active,
    })
    setSlideOver('edit')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const payload = {
      title:           form.title.trim(),
      description:     form.description.trim() || null,
      xp_reward:       parseInt(form.xp_reward, 10) || 100,
      difficulty:      form.difficulty,
      completion_mode: form.completion_mode,
      submission_type: form.submission_type,
      github_url:      form.github_url.trim() || null,
      is_active:       form.is_active,
    }
    try {
      if (slideOver === 'create') {
        await apiFetch('/api/missions', { method: 'POST', body: JSON.stringify(payload) })
      } else if (editingItem) {
        await apiFetch(`/api/missions/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      setSlideOver(null)
      await loadMissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/missions/${id}`, { method: 'DELETE' })
      setRows((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
    setConfirmDeleteId(null)
  }

  const handleToggleStatus = async (m: MissionRow) => {
    setTogglingStatusId(m.id)
    const nextActive = !m.is_active
    try {
      await apiFetch(`/api/missions/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: nextActive }),
      })
      setRows((prev) => prev.map((r) => (r.id === m.id ? { ...r, is_active: nextActive } : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    } finally {
      setTogglingStatusId(null)
    }
  }

  const handleApprove = async (subId: string) => {
    setApprovingId(subId)
    setApproveError(null)
    try {
      await apiFetch(`/api/missions/submissions/${subId}/approve`, { method: 'POST' })
      setQueue((prev) => prev.filter((s) => s.id !== subId))
      await loadMissions()
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (subId: string, remarks: string) => {
    setRejectingId(subId)
    setApproveError(null)
    try {
      await apiFetch(`/api/missions/submissions/${subId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ adminRemarks: remarks }),
      })
      setQueue((prev) => prev.filter((s) => s.id !== subId))
      setRejectTarget(null)
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setRejectingId(null)
    }
  }

  const f = (key: keyof MissionForm) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }))

  return (
    <div className="p-4 md:p-8 h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Missions</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage bounty missions and review submissions</p>
        </div>
        {subTab === 'manage' && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
          >
            <AddCircleOutline className="w-4 h-4" />
            Add Mission
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {(['manage', 'queue'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-1.5 rounded-full text-md3-body-md font-semibold transition-colors ${
              subTab === t ? 'bg-blue text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {t === 'manage' ? 'Mission Manager' : `Review Queue${queue.length > 0 ? ` (${queue.length})` : ''}`}
          </button>
        ))}
      </div>

      {error && <p className="text-md3-body-md text-red mb-4">{error}</p>}

      {/* Mission Manager */}
      {subTab === 'manage' && (
        loadingMissions ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-md3-body-md text-slate-400 text-center py-12">No missions yet. Add one to get started.</p>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {missionItems.map((m) => (
              <div key={m.id} className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-md3-body-md font-semibold text-slate-900 truncate">{m.title}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${DIFF_COLORS[m.difficulty]}`}>
                      {m.difficulty}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">
                      {(m.submission_type ?? 'proof_upload').replace('_', ' ')}
                    </span>
                    {m.status === 'claimed' && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                        claimed
                      </span>
                    )}
                    <button
                      onClick={() => { if (m.is_active) setToggleTarget(m); else void handleToggleStatus(m) }}
                      disabled={togglingStatusId === m.id}
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full transition-colors disabled:opacity-40 ${m.is_active ? 'bg-green/10 text-green hover:bg-green/20' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                    >
                      {m.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                  <p className="text-md3-label-md text-slate-400 mt-0.5">+{m.xp_reward} XP</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                    <PenOutline className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setConfirmDeleteId(m.id)} className="p-1.5 rounded-lg hover:bg-red/10 text-slate-400 hover:text-red">
                    <TrashBinTrashOutline className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            </div>
            <Pagination controller={missionPagination} itemLabel="mission" className="shrink-0" />
          </div>
        )
      )}

      {/* Review Queue */}
      {subTab === 'queue' && (
        loadingQueue ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : queue.length === 0 ? (
          <p className="text-md3-body-md text-slate-400 text-center py-12">No pending submissions. The queue is clear.</p>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {approveError && <p className="text-md3-body-md text-red mb-2">{approveError}</p>}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            {queueItems.map((sub) => {
              const busy = approvingId === sub.id || rejectingId === sub.id
              return (
              <div key={sub.id} className="bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-card">
                <div className="min-w-0">
                  <p className="text-md3-body-md font-semibold text-slate-900">{sub.member_name || 'Unknown'}</p>
                  <p className="text-md3-label-md text-slate-400">{sub.member_email}</p>
                  <p className="text-md3-label-md text-slate-500 mt-1 font-medium">{sub.mission_title}</p>
                  {!sub.pr_link || sub.pr_link === 'submitted-for-approval' ? (
                    <span className="text-md3-label-md text-slate-400 mt-1 block italic">Submitted for approval</span>
                  ) : (
                    <a
                      href={sub.pr_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-md3-label-md text-blue hover:underline mt-1 block truncate"
                    >
                      {sub.pr_link}
                    </a>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Submitted {new Date(sub.submitted_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50 sm:justify-end">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setRejectTarget(sub)}
                    disabled={busy}
                    className="flex-1 sm:flex-none sm:px-5 py-2 flex items-center justify-center gap-1.5 border border-red/40 text-red rounded-xl text-md3-label-md font-bold disabled:opacity-50 hover:bg-red/10 transition-colors"
                  >
                    <CloseCircleOutline color="#EF4444" width={14} height={14} />
                    {rejectingId === sub.id ? 'Rejecting…' : 'Reject'}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setApproveTarget(sub)}
                    disabled={busy}
                    className="flex-1 sm:flex-none sm:px-5 py-2 flex items-center justify-center gap-1.5 bg-blue text-white rounded-xl text-md3-label-md font-bold disabled:opacity-50 hover:bg-blue-dark transition-colors"
                  >
                    <CheckCircleOutline color="#FFFFFF" width={14} height={14} />
                    {approvingId === sub.id ? 'Approving…' : 'Approve & Award'}
                  </motion.button>
                </div>
              </div>
              )
            })}
            </div>
            <Pagination controller={queuePagination} itemLabel="submission" className="shrink-0" />
          </div>
        )
      )}

      {/* SlideOver: Create / Edit */}
      {slideOver && (
        <SlideOver
          title={slideOver === 'create' ? 'New Mission' : 'Edit Mission'}
          onClose={() => setSlideOver(null)}
          onSubmit={() => void handleSave()}
          saving={saving}
        >
          <div>
            <label className={LABEL_CLS}>Title</label>
            <input className={INPUT_CLS} value={form.title} onChange={f('title')} placeholder="e.g. Build a CLI tool" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Description (Markdown supported)</label>
            <textarea className={INPUT_CLS} rows={5} value={form.description} onChange={f('description')} placeholder="What needs to be done?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>XP Reward</label>
              <input className={INPUT_CLS} type="number" min="1" value={form.xp_reward} onChange={f('xp_reward')} required />
            </div>
            <div>
              <label className={LABEL_CLS}>Difficulty</label>
              <select className={INPUT_CLS} value={form.difficulty} onChange={f('difficulty')}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>Submission Type</label>
            <select className={INPUT_CLS} value={form.submission_type} onChange={f('submission_type')}>
              {(Object.keys(SUBMISSION_TYPE_LABELS) as MissionSubmissionType[]).map((t) => (
                <option key={t} value={t}>{SUBMISSION_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Completion Mode</label>
            <select className={INPUT_CLS} value={form.completion_mode} onChange={f('completion_mode')}>
              {(Object.keys(COMPLETION_MODE_LABELS) as MissionCompletionMode[]).map((m) => (
                <option key={m} value={m}>{COMPLETION_MODE_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>
              {form.submission_type === 'link' ? 'Link URL' : 'GitHub URL'}
            </label>
            <input
              className={INPUT_CLS}
              type="url"
              value={form.github_url}
              onChange={f('github_url')}
              placeholder={form.submission_type === 'link' ? 'https://...' : 'https://github.com/org/repo'}
            />
          </div>
          <ToggleRow label="Active" checked={form.is_active} onChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
        </SlideOver>
      )}

      {confirmDeleteId && (
        <ConfirmDelete
          label="mission"
          onConfirm={() => void handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <AnimatePresence>
        {rejectTarget && (
          <RejectModal
            sub={rejectTarget}
            onConfirm={handleReject}
            onClose={() => setRejectTarget(null)}
            loading={rejectingId === rejectTarget.id}
          />
        )}
      </AnimatePresence>

      {approveTarget && (
        <ConfirmDialog
          title="Approve & award points?"
          message={`${approveTarget.member_name || 'This member'} will be awarded points for "${approveTarget.mission_title}". This can't be undone.`}
          confirmLabel="Approve & Award"
          tone="primary"
          loading={approvingId === approveTarget.id}
          onConfirm={() => { void handleApprove(approveTarget.id).then(() => setApproveTarget(null)) }}
          onCancel={() => setApproveTarget(null)}
        />
      )}

      {toggleTarget && (
        <ConfirmDialog
          title="Deactivate this mission?"
          message={`"${toggleTarget.title}" will be hidden from members until you reactivate it.`}
          confirmLabel="Deactivate"
          tone="danger"
          loading={togglingStatusId === toggleTarget.id}
          onConfirm={() => { void handleToggleStatus(toggleTarget).then(() => setToggleTarget(null)) }}
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  )
}
