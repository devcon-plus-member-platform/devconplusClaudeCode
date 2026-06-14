import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AddCircleOutline, PenOutline, TrashBinTrashOutline, CloseCircleLineDuotone,
  CheckCircleOutline, CloseCircleOutline, StarOutline, UserOutline, LinkOutline,
  DocumentTextOutline, ClockCircleOutline,
} from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import type { Reward, Job, NewsPost, XpTier } from '@devcon-plus/supabase'
import { cardItem, staggerContainer, slideUp, backdrop } from '../../lib/animation'

// ── Types ──────────────────────────────────────────────────────────────────

interface UpgradeRequest {
  id: string
  user_id: string
  organizer_code: string
  chapter_id: string | null
  requested_role: 'chapter_officer' | 'hq_admin'
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
  profiles?: {
    full_name: string
    email: string
    chapter_id: string | null
    chapters?: { name: string } | null
  } | null
  chapters?: { name: string } | null
}

// ── Constants ─────────────────────────────────────────────────────────────

const TABS = ['Upgrade Requests', 'Rewards', 'Jobs', 'Missions', 'Articles', 'XP Tiers'] as const
type Tab = typeof TABS[number]

const ROLE_LABELS: Record<string, string> = {
  chapter_officer: 'Chapter Officer',
  hq_admin: 'HQ Admin',
}

const INPUT_CLS = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue'
const LABEL_CLS = 'text-md3-label-md font-medium text-slate-700 block mb-1'

// ── Shared UI helpers ─────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-10 h-5 rounded-full transition-colors relative overflow-hidden ${checked ? 'bg-blue' : 'bg-slate-200'}`}
    >
      <span
        className={`absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-md3-body-md text-slate-700">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

interface SlideOverProps {
  title: string
  onClose: () => void
  onSubmit: () => void
  saving: boolean
  submitLabel?: string
  children: React.ReactNode
}

function SlideOver({ title, onClose, onSubmit, saving, submitLabel = 'Save', children }: SlideOverProps) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-96 bg-white h-full shadow-2xl overflow-y-auto flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-md3-title-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose}>
            <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
          </button>
        </div>
        <form
          className="flex-1 p-6 space-y-4"
          onSubmit={(e) => { e.preventDefault(); onSubmit() }}
        >
          {children}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ConfirmDelete({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl p-6 w-80 shadow-2xl">
        <p className="text-md3-body-md text-slate-700 mb-1 font-semibold">Delete {label}?</p>
        <p className="text-md3-label-md text-slate-400 mb-5">This action cannot be undone.</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-slate-200 rounded-xl text-md3-body-md text-slate-600 font-semibold hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-red text-white rounded-xl text-md3-body-md font-bold hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab 1: Upgrade Requests ───────────────────────────────────────────────

function UpgradeRequestsTab() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<UpgradeRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    const { data, error: dbErr } = await supabase
      .from('organizer_upgrade_requests')
      .select(`
        *,
        profiles!user_id (full_name, email, chapter_id, chapters:chapter_id(name)),
        chapters:chapter_id (name)
      `)
      .order('created_at', { ascending: false })
    if (dbErr) { setError(dbErr.message) } else { setRequests((data ?? []) as unknown as UpgradeRequest[]) }
    setIsLoading(false)
  }

  useEffect(() => { void load() }, [])

  const handleApprove = async (req: UpgradeRequest) => {
    if (!user) return
    setActionLoading(req.id)
    setError(null)
    try {
      const { error } = await supabase.rpc('approve_organizer_upgrade', {
        p_request_id: req.id,
        p_user_id: req.user_id,
        p_chapter_id: req.chapter_id ?? '',
        p_reviewer_id: user?.id ?? '',
        p_role: req.requested_role,
      })
      if (error) throw error
      setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'approved' } : r))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (req: UpgradeRequest) => {
    if (!user) return
    setActionLoading(req.id)
    setError(null)
    try {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ pending_role: null, pending_chapter_id: null })
        .eq('id', req.user_id)
      if (profileErr) throw profileErr

      const { error: reqErr } = await supabase
        .from('organizer_upgrade_requests')
        .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', req.id)
      if (reqErr) throw reqErr

      setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'rejected' } : r))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Organizer Upgrade Requests</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">
            Review member requests to become chapter officers or HQ admins
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1 bg-primary/10 text-primary text-md3-body-md font-bold rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading requests…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Member</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Current Chapter</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Code</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Requested Role</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900 text-md3-body-md">{req.profiles?.full_name ?? '—'}</p>
                    <p className="text-md3-label-md text-slate-400">{req.profiles?.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">
                    {req.profiles?.chapters?.name ?? 'No chapter'}
                  </td>
                  <td className="px-4 py-3 font-mono text-md3-label-md text-slate-700 font-bold tracking-wider">
                    {req.organizer_code}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                      {ROLE_LABELS[req.requested_role] ?? req.requested_role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      req.status === 'approved' ? 'bg-green/10 text-green' :
                      req.status === 'rejected' ? 'bg-red/10 text-red' :
                      'bg-gold/10 text-slate-700'
                    }`}>
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {req.status === 'pending' && (
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => void handleApprove(req)}
                          disabled={actionLoading === req.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green/10 text-green text-md3-label-md font-bold rounded-lg hover:bg-green/20 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircleOutline className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => void handleReject(req)}
                          disabled={actionLoading === req.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red/10 text-red text-md3-label-md font-bold rounded-lg hover:bg-red/20 disabled:opacity-50 transition-colors"
                        >
                          <CloseCircleOutline className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {requests.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No upgrade requests yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Rewards ────────────────────────────────────────────────────────

interface RewardForm {
  name: string
  points_cost: string
  type: 'digital' | 'physical'
  claim_method: 'onsite' | 'digital_delivery'
  is_active: boolean
  is_coming_soon: boolean
}

const defaultRewardForm = (): RewardForm => ({
  name: '',
  points_cost: '',
  type: 'physical',
  claim_method: 'onsite',
  is_active: true,
  is_coming_soon: true,
})

function RewardsTab() {
  const [rows, setRows] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<Reward | null>(null)
  const [form, setForm] = useState<RewardForm>(defaultRewardForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('rewards')
      .select('*')
      .order('points_cost')
    if (err) setError(err.message)
    else setRows((data ?? []) as Reward[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const openCreate = () => {
    setEditingItem(null)
    setForm(defaultRewardForm())
    setSlideOver('create')
  }

  const openEdit = (r: Reward) => {
    setEditingItem(r)
    setForm({
      name: r.name,
      points_cost: String(r.points_cost),
      type: r.type,
      claim_method: r.claim_method,
      is_active: r.is_active,
      is_coming_soon: r.is_coming_soon,
    })
    setSlideOver('edit')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name.trim(),
      points_cost: parseInt(form.points_cost, 10) || 0,
      type: form.type,
      claim_method: form.claim_method,
      is_active: form.is_active,
      is_coming_soon: form.is_coming_soon,
    }
    try {
      if (slideOver === 'create') {
        const { error: err } = await supabase.from('rewards').insert(payload)
        if (err) throw err
      } else if (editingItem) {
        const { error: err } = await supabase.from('rewards').update(payload).eq('id', editingItem.id)
        if (err) throw err
      }
      setSlideOver(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const { error: redemptionsErr } = await supabase
      .from('reward_redemptions')
      .delete()
      .eq('reward_id', id)
    if (redemptionsErr) { setError(redemptionsErr.message); setConfirmDeleteId(null); return }

    const { error: err } = await supabase.from('rewards').delete().eq('id', id)
    if (err) setError(err.message)
    else setRows((prev) => prev.filter((r) => r.id !== id))
    setConfirmDeleteId(null)
  }

  const f = (key: keyof RewardForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Rewards</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage the rewards catalog</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          Add Reward
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-md3-body-md">Loading…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Points Cost</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Claim Method</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Active</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Coming Soon</th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{r.name}</td>
                  <td className="px-4 py-3 text-slate-700 font-mono text-md3-label-md">{r.points_cost.toLocaleString()} pts</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md capitalize">{r.type}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">{r.claim_method === 'digital_delivery' ? 'Digital Delivery' : 'Onsite'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green/10 text-green' : 'bg-slate-100 text-slate-400'}`}>
                      {r.is_active ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.is_coming_soon ? 'bg-gold/10 text-slate-700' : 'bg-slate-100 text-slate-400'}`}>
                      {r.is_coming_soon ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-blue transition-colors">
                        <PenOutline className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteId(r.id)} className="p-1.5 text-slate-400 hover:text-red transition-colors">
                        <TrashBinTrashOutline className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No rewards yet.</p>
          )}
        </div>
      )}

      {slideOver && (
        <SlideOver
          title={`${slideOver === 'create' ? 'Create' : 'Edit'} Reward`}
          onClose={() => setSlideOver(null)}
          onSubmit={() => void handleSave()}
          saving={saving}
        >
          <div>
            <label className={LABEL_CLS}>Name</label>
            <input className={INPUT_CLS} value={form.name} onChange={f('name')} placeholder="e.g. DEVCON Cap" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Points Cost</label>
            <input className={INPUT_CLS} type="number" min="0" value={form.points_cost} onChange={f('points_cost')} placeholder="e.g. 500" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Type</label>
            <select className={INPUT_CLS} value={form.type} onChange={f('type')}>
              <option value="physical">Physical</option>
              <option value="digital">Digital</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Claim Method</label>
            <select className={INPUT_CLS} value={form.claim_method} onChange={f('claim_method')}>
              <option value="onsite">Onsite</option>
              <option value="digital_delivery">Digital Delivery</option>
            </select>
          </div>
          <ToggleRow label="Active" checked={form.is_active} onChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
          <ToggleRow label="Coming Soon" checked={form.is_coming_soon} onChange={(v) => setForm((p) => ({ ...p, is_coming_soon: v }))} />
        </SlideOver>
      )}

      {confirmDeleteId && (
        <ConfirmDelete
          label="reward"
          onConfirm={() => void handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── Tab 3: Jobs ───────────────────────────────────────────────────────────

interface JobForm {
  title: string
  company: string
  location: string
  work_type: 'remote' | 'onsite' | 'hybrid' | 'full_time' | 'part_time'
  description: string
  apply_url: string
  logo_url: string
  is_promoted: boolean
  is_active: boolean
}

const defaultJobForm = (): JobForm => ({
  title: '',
  company: '',
  location: '',
  work_type: 'remote',
  description: '',
  apply_url: '',
  logo_url: '',
  is_promoted: false,
  is_active: true,
})

function JobsTab() {
  const [rows, setRows] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<Job | null>(null)
  const [form, setForm] = useState<JobForm>(defaultJobForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('jobs')
      .select('*')
      .order('posted_at', { ascending: false })
    if (err) setError(err.message)
    else setRows((data ?? []) as Job[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const openCreate = () => {
    setEditingItem(null)
    setForm(defaultJobForm())
    setSlideOver('create')
  }

  const openEdit = (j: Job) => {
    setEditingItem(j)
    setForm({
      title: j.title,
      company: j.company,
      location: j.location ?? '',
      work_type: j.work_type,
      description: j.description ?? '',
      apply_url: j.apply_url ?? '',
      logo_url: j.logo_url ?? '',
      is_promoted: j.is_promoted,
      is_active: j.is_active,
    })
    setSlideOver('edit')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const payload = {
      title: form.title.trim(),
      company: form.company.trim(),
      location: form.location.trim() || null,
      work_type: form.work_type,
      description: form.description.trim() || null,
      apply_url: form.apply_url.trim() || null,
      logo_url: form.logo_url.trim() || null,
      is_promoted: form.is_promoted,
      is_active: form.is_active,
    }
    try {
      if (slideOver === 'create') {
        const { error: err } = await supabase.from('jobs').insert(payload)
        if (err) throw err
      } else if (editingItem) {
        const { error: err } = await supabase.from('jobs').update(payload).eq('id', editingItem.id)
        if (err) throw err
      }
      setSlideOver(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const { error: err } = await supabase.from('jobs').delete().eq('id', id)
    if (err) setError(err.message)
    else setRows((prev) => prev.filter((j) => j.id !== id))
    setConfirmDeleteId(null)
  }

  const f = (key: keyof JobForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Jobs</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage the jobs board listings</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          Add Job
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-md3-body-md">Loading…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Company</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Location</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Promoted</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Active</th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{j.title}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">{j.company}</td>
                  <td className="px-4 py-3 text-slate-500 text-md3-label-md">{j.location ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md capitalize">{j.work_type.replace('_', ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${j.is_promoted ? 'bg-promoted/10 text-promoted' : 'bg-slate-100 text-slate-400'}`}>
                      {j.is_promoted ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${j.is_active ? 'bg-green/10 text-green' : 'bg-slate-100 text-slate-400'}`}>
                      {j.is_active ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(j)} className="p-1.5 text-slate-400 hover:text-blue transition-colors">
                        <PenOutline className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteId(j.id)} className="p-1.5 text-slate-400 hover:text-red transition-colors">
                        <TrashBinTrashOutline className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No jobs yet.</p>
          )}
        </div>
      )}

      {slideOver && (
        <SlideOver
          title={`${slideOver === 'create' ? 'Create' : 'Edit'} Job`}
          onClose={() => setSlideOver(null)}
          onSubmit={() => void handleSave()}
          saving={saving}
          submitLabel={slideOver === 'create' ? 'Create Job' : 'Save Changes'}
        >
          {/* Logo preview + URL */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            {form.logo_url ? (
              <div className="w-10 h-10 shrink-0">
                <img src={form.logo_url} alt="logo" className="w-full h-full object-contain rounded-lg" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue flex items-center justify-center shrink-0">
                <span className="text-white font-proxima font-bold text-[16px] uppercase">
                  {form.company[0] ?? 'J'}
                </span>
              </div>
            )}
            <p className="text-md3-label-md text-slate-400">Logo preview</p>
          </div>
          <div>
            <label className={LABEL_CLS}>Logo URL</label>
            <input className={INPUT_CLS} value={form.logo_url} onChange={f('logo_url')} placeholder="https://example.com/logo.png" />
            <p className="text-[11px] text-slate-400 mt-1">Leave blank to show the company initial.</p>
          </div>
          <div>
            <label className={LABEL_CLS}>Title</label>
            <input className={INPUT_CLS} value={form.title} onChange={f('title')} placeholder="e.g. Senior Frontend Developer" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Company</label>
            <input className={INPUT_CLS} value={form.company} onChange={f('company')} placeholder="e.g. Accenture Philippines" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Location</label>
            <input className={INPUT_CLS} value={form.location} onChange={f('location')} placeholder="e.g. BGC, Taguig" />
          </div>
          <div>
            <label className={LABEL_CLS}>Work Type</label>
            <select className={INPUT_CLS} value={form.work_type} onChange={f('work_type')}>
              <option value="remote">Remote</option>
              <option value="onsite">Onsite</option>
              <option value="hybrid">Hybrid</option>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Description</label>
            <textarea
              className={`${INPUT_CLS} resize-none`}
              rows={4}
              value={form.description}
              onChange={f('description')}
              placeholder="Job description…"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Apply URL</label>
            <input className={INPUT_CLS} value={form.apply_url} onChange={f('apply_url')} placeholder="https://…" />
          </div>
          <ToggleRow label="Promoted" checked={form.is_promoted} onChange={(v) => setForm((p) => ({ ...p, is_promoted: v }))} />
          <ToggleRow label="Active" checked={form.is_active} onChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
        </SlideOver>
      )}

      {confirmDeleteId && (
        <ConfirmDelete
          label="job"
          onConfirm={() => void handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── Tab 4: Articles ───────────────────────────────────────────────────────

interface ArticleForm {
  title: string
  body: string
  category: 'devcon' | 'tech_community'
  cover_image_url: string
  is_featured: boolean
  is_promoted: boolean
}

const defaultArticleForm = (): ArticleForm => ({
  title: '',
  body: '',
  category: 'devcon',
  cover_image_url: '',
  is_featured: false,
  is_promoted: false,
})

function ArticlesTab() {
  const [rows, setRows] = useState<NewsPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<NewsPost | null>(null)
  const [form, setForm] = useState<ArticleForm>(defaultArticleForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('news_posts')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setRows((data ?? []) as NewsPost[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const openCreate = () => {
    setEditingItem(null)
    setForm(defaultArticleForm())
    setSlideOver('create')
  }

  const openEdit = (n: NewsPost) => {
    setEditingItem(n)
    setForm({
      title: n.title,
      body: n.body ?? '',
      category: n.category,
      cover_image_url: n.cover_image_url ?? '',
      is_featured: n.is_featured,
      is_promoted: n.is_promoted,
    })
    setSlideOver('edit')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      title: form.title.trim(),
      body: form.body.trim() || null,
      category: form.category,
      cover_image_url: form.cover_image_url.trim() || null,
      is_featured: form.is_featured,
      is_promoted: form.is_promoted,
    }
    try {
      if (slideOver === 'create') {
        const { error: err } = await supabase.from('news_posts').insert({ ...payload, author_id: user?.id ?? null })
        if (err) throw err
      } else if (editingItem) {
        const { error: err } = await supabase.from('news_posts').update(payload).eq('id', editingItem.id)
        if (err) throw err
      }
      setSlideOver(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const { error: err } = await supabase.from('news_posts').delete().eq('id', id)
    if (err) setError(err.message)
    else setRows((prev) => prev.filter((n) => n.id !== id))
    setConfirmDeleteId(null)
  }

  const f = (key: keyof ArticleForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Articles</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage news posts and updates</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          Add Article
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-md3-body-md">Loading…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Featured</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Promoted</th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900 max-w-xs truncate">{n.title}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md capitalize">{n.category.replace('_', ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${n.is_featured ? 'bg-blue/10 text-blue' : 'bg-slate-100 text-slate-400'}`}>
                      {n.is_featured ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${n.is_promoted ? 'bg-promoted/10 text-promoted' : 'bg-slate-100 text-slate-400'}`}>
                      {n.is_promoted ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(n)} className="p-1.5 text-slate-400 hover:text-blue transition-colors">
                        <PenOutline className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteId(n.id)} className="p-1.5 text-slate-400 hover:text-red transition-colors">
                        <TrashBinTrashOutline className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No articles yet.</p>
          )}
        </div>
      )}

      {slideOver && (
        <SlideOver
          title={`${slideOver === 'create' ? 'Create' : 'Edit'} Article`}
          onClose={() => setSlideOver(null)}
          onSubmit={() => void handleSave()}
          saving={saving}
        >
          <div>
            <label className={LABEL_CLS}>Title</label>
            <input className={INPUT_CLS} value={form.title} onChange={f('title')} placeholder="Article title" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Category</label>
            <select className={INPUT_CLS} value={form.category} onChange={f('category')}>
              <option value="devcon">DEVCON</option>
              <option value="tech_community">Tech Community</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Cover Image URL</label>
            <input className={INPUT_CLS} value={form.cover_image_url} onChange={f('cover_image_url')} placeholder="https://…" />
          </div>
          <div>
            <label className={LABEL_CLS}>Body</label>
            <textarea
              className={`${INPUT_CLS} resize-none`}
              rows={6}
              value={form.body}
              onChange={f('body')}
              placeholder="Article body…"
            />
          </div>
          <ToggleRow label="Featured" checked={form.is_featured} onChange={(v) => setForm((p) => ({ ...p, is_featured: v }))} />
          <ToggleRow label="Promoted" checked={form.is_promoted} onChange={(v) => setForm((p) => ({ ...p, is_promoted: v }))} />
        </SlideOver>
      )}

      {confirmDeleteId && (
        <ConfirmDelete
          label="article"
          onConfirm={() => void handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── Tab 5: XP Tiers ───────────────────────────────────────────────────────

interface XpTierForm {
  name: string
  label: string
  min_points: string
  max_points: string
  badge_color: string
}

// ── Mission Submission Review — shared types & helpers ────────────────────

type SubmissionStatus = 'pending' | 'approved' | 'rejected'

interface FullSubmissionRow {
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

function memberInitials(name: string | null | undefined) {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function fmtSubDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtSubDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Reject Modal ───────────────────────────────────────────────────────────

interface MissionRejectModalProps {
  submissionId: string
  memberName: string
  missionTitle: string
  onConfirm: (submissionId: string, remarks: string) => Promise<void>
  onClose: () => void
  loading: boolean
}

function MissionRejectModal({ submissionId, memberName, missionTitle, onConfirm, onClose, loading }: MissionRejectModalProps) {
  const [remarks, setRemarks] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!remarks.trim()) return
    void onConfirm(submissionId, remarks.trim())
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} variants={backdrop} initial="hidden" animate="visible" exit="hidden" />
      <motion.div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 pb-8 z-10"
        variants={slideUp} initial="hidden" animate="visible" exit="hidden"
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
              ref={textareaRef} value={remarks} onChange={(e) => setRemarks(e.target.value)}
              rows={4} placeholder="Explain why this submission was rejected…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-red/40 resize-none"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">This will be visible to the member in their notification.</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-slate-200 rounded-xl text-md3-body-md font-semibold text-slate-600">Cancel</button>
            <motion.button
              type="submit" disabled={loading || !remarks.trim()} whileTap={{ scale: 0.95 }}
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

interface MissionDetailSheetProps {
  sub: FullSubmissionRow
  history: PointTransaction[]
  historyLoading: boolean
  onClose: () => void
  onApprove: (sub: FullSubmissionRow) => void
  onReject: (sub: FullSubmissionRow) => void
  actionLoading: string | null
}

function MissionDetailSheet({ sub, history, historyLoading, onClose, onApprove, onReject, actionLoading }: MissionDetailSheetProps) {
  const isProofLink = sub.pr_link !== 'submitted-for-approval'

  return (
    <motion.div className="fixed inset-0 z-40 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
            <CloseCircleLineDuotone className="w-5 h-5" color="#94A3B8" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5 pb-8">
          {/* User info */}
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
            <div className="w-12 h-12 rounded-full bg-blue flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-[16px] font-proxima">{memberInitials(sub.profiles?.full_name)}</span>
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
              <span className={`text-md3-label-sm font-bold px-2 py-0.5 rounded-full ${SUB_STATUS_COLORS[sub.status]}`}>
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
              <a href={sub.pr_link} target="_blank" rel="noopener noreferrer" className="text-md3-body-sm text-blue hover:underline break-all block">
                {sub.pr_link}
              </a>
            ) : (
              <p className="text-md3-body-sm text-slate-400 italic">Submitted for approval (no link provided)</p>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex items-start gap-2 text-md3-body-sm text-slate-500">
            <ClockCircleOutline className="w-3.5 h-3.5 mt-0.5 shrink-0" color="#94A3B8" />
            <div className="space-y-0.5">
              <p>Submitted {fmtSubDate(sub.submitted_at)}</p>
              {sub.reviewed_at && (
                <p>{sub.status === 'approved' ? 'Approved' : 'Rejected'} {fmtSubDate(sub.reviewed_at)}</p>
              )}
            </div>
          </div>

          {/* Admin remarks */}
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
                      <p className="text-[10px] text-slate-400">{fmtSubDateShort(tx.created_at)}</p>
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
                whileTap={{ scale: 0.95 }} onClick={() => onReject(sub)} disabled={actionLoading === sub.id}
                className="flex-1 py-3 flex items-center justify-center gap-2 bg-red/10 text-red rounded-xl text-md3-body-md font-bold disabled:opacity-50 hover:bg-red/20 transition-colors"
              >
                <CloseCircleOutline className="w-5 h-5" color="#EF4444" />
                Reject
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }} onClick={() => onApprove(sub)} disabled={actionLoading === sub.id}
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

interface MissionSubmissionCardProps {
  sub: FullSubmissionRow
  onTap: (sub: FullSubmissionRow) => void
  onApprove: (sub: FullSubmissionRow) => void
  onReject: (sub: FullSubmissionRow) => void
  actionLoading: string | null
}

function MissionSubmissionCard({ sub, onTap, onApprove, onReject, actionLoading }: MissionSubmissionCardProps) {
  const isProofLink = sub.pr_link !== 'submitted-for-approval'

  return (
    <motion.div
      variants={cardItem} whileTap={{ scale: 0.97 }} onClick={() => onTap(sub)}
      className="bg-white rounded-2xl border border-slate-100 shadow-card p-4 cursor-pointer active:bg-slate-50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-blue flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-[13px] font-proxima">{memberInitials(sub.profiles?.full_name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-md3-body-md font-bold text-slate-900 truncate">{sub.profiles?.full_name ?? '—'}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${SUB_STATUS_COLORS[sub.status]}`}>
              {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
            </span>
          </div>
          <p className="text-md3-label-sm text-slate-400 truncate">{sub.profiles?.email ?? '—'}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-md3-label-sm font-semibold text-slate-700 truncate max-w-[180px]">{sub.missions?.title ?? '—'}</span>
            <span className="text-[10px] font-bold text-green bg-green/10 px-1.5 py-0.5 rounded-full shrink-0">+{sub.missions?.xp_reward ?? 0} pts</span>
            {isProofLink && <span className="text-[10px] font-semibold text-blue bg-blue/10 px-1.5 py-0.5 rounded-full shrink-0">Link</span>}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {sub.status === 'pending' ? `Submitted ${fmtSubDateShort(sub.submitted_at)}` : `Reviewed ${sub.reviewed_at ? fmtSubDateShort(sub.reviewed_at) : '—'}`}
          </p>
          {sub.status === 'rejected' && sub.admin_remarks && (
            <p className="text-[10px] text-red/80 mt-1 italic truncate">Rejected: {sub.admin_remarks}</p>
          )}
        </div>
      </div>
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

// ── Tab 4: Missions ───────────────────────────────────────────────────────

type MissionSubmissionType = 'proof_upload' | 'link' | 'submit_for_approval'

const SUBMISSION_TYPE_LABELS: Record<MissionSubmissionType, string> = {
  proof_upload:        'Proof Upload (needs review)',
  link:                'Link (open URL)',
  submit_for_approval: 'Submit for Approval (needs review)',
}

interface MissionRow {
  id: string
  title: string
  description: string | null
  xp_reward: number
  difficulty: 'easy' | 'medium' | 'hard'
  status: 'available' | 'claimed'
  submission_type: MissionSubmissionType
  github_url: string | null
  is_active: boolean
  created_at: string
}

interface MissionForm {
  title: string
  description: string
  xp_reward: string
  difficulty: 'easy' | 'medium' | 'hard'
  submission_type: MissionSubmissionType
  github_url: string
  is_active: boolean
}

const defaultMissionForm = (): MissionForm => ({
  title: '',
  description: '',
  xp_reward: '100',
  difficulty: 'medium',
  submission_type: 'proof_upload',
  github_url: '',
  is_active: true,
})

const DIFF_COLORS = {
  easy:   'bg-green/10 text-green',
  medium: 'bg-amber-100 text-amber-700',
  hard:   'bg-red/10 text-red',
} as const

function MissionsTab() {
  const { user } = useAuthStore()
  const [subTab, setSubTab] = useState<'manage' | 'queue'>('manage')

  // ── Mission CRUD ────────────────────────────────────────────────────────
  const [rows, setRows] = useState<MissionRow[]>([])
  const [loadingMissions, setLoadingMissions] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<MissionRow | null>(null)
  const [form, setForm] = useState<MissionForm>(defaultMissionForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null)

  // ── Submission Review ────────────────────────────────────────────────────
  const [submissions, setSubmissions] = useState<FullSubmissionRow[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [queueTab, setQueueTab] = useState<SubmissionStatus>('pending')
  const [queueSearch, setQueueSearch] = useState('')
  const [detailSub, setDetailSub] = useState<FullSubmissionRow | null>(null)
  const [txHistory, setTxHistory] = useState<PointTransaction[]>([])
  const [txHistoryLoading, setTxHistoryLoading] = useState(false)
  const [queueActionLoading, setQueueActionLoading] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<FullSubmissionRow | null>(null)
  const [rejectLoading, setRejectLoading] = useState(false)
  const [queueError, setQueueError] = useState<string | null>(null)

  const loadMissions = async () => {
    setLoadingMissions(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any)
      .from('missions').select('*').order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setRows((data ?? []) as MissionRow[])
    setLoadingMissions(false)
  }

  const loadSubmissions = useCallback(async () => {
    setLoadingQueue(true)
    setQueueError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any)
      .from('mission_submissions')
      .select(`*, missions:mission_id(title, xp_reward, description), profiles:user_id(full_name, email, spendable_points, lifetime_points)`)
      .order('submitted_at', { ascending: false })
      .limit(200)
    if (err) setQueueError(err.message)
    else setSubmissions((data ?? []) as FullSubmissionRow[])
    setLoadingQueue(false)
  }, [])

  useEffect(() => { void loadMissions() }, [])
  useEffect(() => { if (subTab === 'queue') void loadSubmissions() }, [subTab, loadSubmissions])

  // Mission CRUD handlers
  const openCreate = () => { setEditingItem(null); setForm(defaultMissionForm()); setSlideOver('create') }
  const openEdit = (m: MissionRow) => {
    setEditingItem(m)
    setForm({
      title: m.title, description: m.description ?? '', xp_reward: String(m.xp_reward),
      difficulty: m.difficulty, submission_type: m.submission_type ?? 'proof_upload',
      github_url: m.github_url ?? '', is_active: m.is_active,
    })
    setSlideOver('edit')
  }

  const handleSave = async () => {
    setSaving(true); setError(null)
    const payload = {
      title: form.title.trim(), description: form.description.trim() || null,
      xp_reward: parseInt(form.xp_reward, 10) || 100, difficulty: form.difficulty,
      submission_type: form.submission_type, github_url: form.github_url.trim() || null,
      is_active: form.is_active,
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (slideOver === 'create') { const { error: err } = await (supabase as any).from('missions').insert(payload); if (err) throw err }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else if (editingItem) { const { error: err } = await (supabase as any).from('missions').update(payload).eq('id', editingItem.id); if (err) throw err }
      setSlideOver(null); await loadMissions()
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('missions').delete().eq('id', id)
    if (err) setError(err.message)
    else setRows((prev) => prev.filter((m) => m.id !== id))
    setConfirmDeleteId(null)
  }

  const handleToggleStatus = async (m: MissionRow) => {
    setTogglingStatusId(m.id)
    const nextActive = !m.is_active
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('missions').update({ is_active: nextActive }).eq('id', m.id)
    if (err) setError(err.message)
    else setRows((prev) => prev.map((r) => r.id === m.id ? { ...r, is_active: nextActive } : r))
    setTogglingStatusId(null)
  }

  // Submission review handlers
  const loadTxHistory = async (userId: string) => {
    setTxHistoryLoading(true)
    const { data } = await supabase
      .from('point_transactions').select('id, amount, description, source, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(8)
    setTxHistory((data ?? []) as PointTransaction[])
    setTxHistoryLoading(false)
  }

  const openDetail = (sub: FullSubmissionRow) => { setDetailSub(sub); void loadTxHistory(sub.user_id) }
  const closeDetail = () => { setDetailSub(null); setTxHistory([]) }

  const notifyUser = async (userId: string, type: 'points_approved' | 'points_rejected', missionTitle: string, points: number, remarks?: string) => {
    const title = type === 'points_approved' ? 'Points Approved!' : 'Submission Rejected'
    const message = type === 'points_approved'
      ? `Your submission for "${missionTitle}" was approved. +${points} pts have been added to your account.`
      : `Your submission for "${missionTitle}" was rejected. Remarks: ${remarks ?? 'No remarks provided.'}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('user_notifications').insert({ user_id: userId, title, message, type })
  }

  const handleApproveSubmission = async (sub: FullSubmissionRow) => {
    if (!user) return
    setQueueActionLoading(sub.id); setQueueError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('approve_mission_winner' as never, { sub_id: sub.id } as never)
      if (rpcErr) throw rpcErr
      await notifyUser(sub.user_id, 'points_approved', sub.missions?.title ?? 'Mission', sub.missions?.xp_reward ?? 0)
      setSubmissions((prev) =>
        prev.map((s) => s.id === sub.id ? { ...s, status: 'approved' as SubmissionStatus, reviewed_by: user.id, reviewed_at: new Date().toISOString() } : s)
      )
      setDetailSub(null)
    } catch (err) { setQueueError(err instanceof Error ? err.message : 'Approve failed') }
    finally { setQueueActionLoading(null) }
  }

  const handleRejectConfirm = async (submissionId: string, remarks: string) => {
    if (!user) return
    setRejectLoading(true); setQueueError(null)
    const sub = submissions.find((s) => s.id === submissionId)
    try {
      const { error: rpcErr } = await supabase.rpc('reject_mission_submission' as never, {
        p_submission_id: submissionId, p_admin_remarks: remarks,
      } as never)
      if (rpcErr) throw rpcErr
      if (sub) await notifyUser(sub.user_id, 'points_rejected', sub.missions?.title ?? 'Mission', sub.missions?.xp_reward ?? 0, remarks)
      setSubmissions((prev) =>
        prev.map((s) => s.id === submissionId
          ? { ...s, status: 'rejected' as SubmissionStatus, admin_remarks: remarks, reviewed_by: user.id, reviewed_at: new Date().toISOString() }
          : s
        )
      )
      setRejectTarget(null); setDetailSub(null)
    } catch (err) { setQueueError(err instanceof Error ? err.message : 'Reject failed') }
    finally { setRejectLoading(false) }
  }

  const filteredSubmissions = submissions.filter((s) => {
    if (s.status !== queueTab) return false
    if (!queueSearch.trim()) return true
    const q = queueSearch.toLowerCase()
    return (
      (s.profiles?.full_name ?? '').toLowerCase().includes(q) ||
      (s.profiles?.email ?? '').toLowerCase().includes(q) ||
      (s.missions?.title ?? '').toLowerCase().includes(q)
    )
  })

  const subCounts: Record<SubmissionStatus, number> = {
    pending:  submissions.filter((s) => s.status === 'pending').length,
    approved: submissions.filter((s) => s.status === 'approved').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
  }

  const f = (key: keyof MissionForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }))

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Missions</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage bounty missions and review submissions</p>
        </div>
        {subTab === 'manage' && (
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors">
            <AddCircleOutline className="w-4 h-4" />
            Add Mission
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {(['manage', 'queue'] as const).map((t) => (
          <button
            key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-1.5 rounded-full text-md3-body-md font-semibold transition-colors relative ${
              subTab === t ? 'bg-blue text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {t === 'manage' ? 'Mission Manager' : 'Submission Review'}
            {t === 'queue' && subCounts.pending > 0 && subTab !== 'queue' && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                {subCounts.pending > 9 ? '9+' : subCounts.pending}
              </span>
            )}
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
          <div className="space-y-2">
            {rows.map((m) => (
              <div key={m.id} className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-md3-body-md font-semibold text-slate-900 truncate">{m.title}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${DIFF_COLORS[m.difficulty]}`}>{m.difficulty}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">
                      {(m.submission_type ?? 'proof_upload').replace('_', ' ')}
                    </span>
                    {m.status === 'claimed' && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">claimed</span>
                    )}
                    <button
                      onClick={() => void handleToggleStatus(m)} disabled={togglingStatusId === m.id}
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
        )
      )}

      {/* Submission Review */}
      {subTab === 'queue' && (
        <div>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {SUB_STATUS_TABS.map(({ key, label }) => (
              <div
                key={key}
                className={`rounded-2xl p-3 text-center border ${
                  key === 'pending' ? 'bg-gold/10 border-gold/20' :
                  key === 'approved' ? 'bg-green/10 border-green/20' :
                  'bg-red/10 border-red/20'
                }`}
              >
                <p className={`text-md3-headline-sm font-black ${
                  key === 'pending' ? 'text-slate-900' : key === 'approved' ? 'text-green' : 'text-red'
                }`}>
                  {loadingQueue ? '—' : subCounts[key]}
                </p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Status tabs + search */}
          <div className="space-y-3 mb-4">
            <div className="flex gap-2">
              {SUB_STATUS_TABS.map(({ key, label }) => (
                <button
                  key={key} onClick={() => setQueueTab(key)}
                  className={`flex-1 py-2 rounded-xl text-md3-label-md font-bold transition-colors relative ${
                    queueTab === key ? 'bg-blue text-white shadow-blue' : 'bg-white text-slate-500 border border-slate-200 hover:border-blue/30'
                  }`}
                >
                  {label}
                  {key === 'pending' && subCounts.pending > 0 && queueTab !== 'pending' && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                      {subCounts.pending > 9 ? '9+' : subCounts.pending}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative">
              <UserOutline className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" color="#94A3B8" />
              <input
                type="search" placeholder="Search by name, email, or mission…"
                value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
              />
            </div>
          </div>

          {queueError && (
            <div className="mb-3 px-4 py-3 bg-red/5 border border-red/20 rounded-xl">
              <p className="text-md3-body-sm text-red">{queueError}</p>
            </div>
          )}

          {loadingQueue ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <StarOutline className="w-7 h-7" color="#CBD5E1" />
              </div>
              <p className="text-md3-body-lg font-bold text-slate-700">
                {queueSearch ? 'No results found' : `No ${queueTab} submissions`}
              </p>
              <p className="text-md3-body-md text-slate-400 mt-1 max-w-xs">
                {queueSearch ? 'Try a different name or mission title.' :
                  queueTab === 'pending' ? 'All submissions have been reviewed.' :
                  `${queueTab.charAt(0).toUpperCase() + queueTab.slice(1)} submissions will appear here.`}
              </p>
            </div>
          ) : (
            <motion.div key={queueTab} variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
              {filteredSubmissions.map((sub) => (
                <MissionSubmissionCard
                  key={sub.id} sub={sub}
                  onTap={openDetail}
                  onApprove={handleApproveSubmission}
                  onReject={(s) => setRejectTarget(s)}
                  actionLoading={queueActionLoading}
                />
              ))}
              <p className="text-center text-md3-label-sm text-slate-400 pt-2">
                {filteredSubmissions.length} submission{filteredSubmissions.length !== 1 ? 's' : ''}
              </p>
            </motion.div>
          )}

          <AnimatePresence>
            {detailSub && (
              <MissionDetailSheet
                sub={detailSub} history={txHistory} historyLoading={txHistoryLoading}
                onClose={closeDetail}
                onApprove={handleApproveSubmission}
                onReject={(s) => setRejectTarget(s)}
                actionLoading={queueActionLoading}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {rejectTarget && (
              <MissionRejectModal
                submissionId={rejectTarget.id}
                memberName={rejectTarget.profiles?.full_name ?? 'Member'}
                missionTitle={rejectTarget.missions?.title ?? 'Mission'}
                onConfirm={handleRejectConfirm}
                onClose={() => setRejectTarget(null)}
                loading={rejectLoading}
              />
            )}
          </AnimatePresence>
        </div>
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
            <label className={LABEL_CLS}>{form.submission_type === 'link' ? 'Link URL' : 'GitHub URL'}</label>
            <input
              className={INPUT_CLS} type="url" value={form.github_url} onChange={f('github_url')}
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
    </div>
  )
}

const defaultXpTierForm = (): XpTierForm => ({
  name: '',
  label: '',
  min_points: '',
  max_points: '',
  badge_color: '#F8C630',
})

function XpTiersTab() {
  const [rows, setRows] = useState<XpTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<XpTier | null>(null)
  const [form, setForm] = useState<XpTierForm>(defaultXpTierForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('xp_tiers')
      .select('*')
      .order('min_points')
    if (err) setError(err.message)
    else setRows((data ?? []) as XpTier[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const openCreate = () => {
    setEditingItem(null)
    setForm(defaultXpTierForm())
    setSlideOver('create')
  }

  const openEdit = (t: XpTier) => {
    setEditingItem(t)
    setForm({
      name: t.name,
      label: t.label,
      min_points: String(t.min_points),
      max_points: t.max_points !== null ? String(t.max_points) : '',
      badge_color: t.badge_color ?? '#F8C630',
    })
    setSlideOver('edit')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name.trim(),
      label: form.label.trim(),
      min_points: parseInt(form.min_points, 10) || 0,
      max_points: form.max_points.trim() !== '' ? parseInt(form.max_points, 10) : null,
      badge_color: form.badge_color.trim() || null,
    }
    try {
      if (slideOver === 'create') {
        const { error: err } = await supabase.from('xp_tiers').insert(payload)
        if (err) throw err
      } else if (editingItem) {
        const { error: err } = await supabase.from('xp_tiers').update(payload).eq('id', editingItem.id)
        if (err) throw err
      }
      setSlideOver(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const { error: err } = await supabase.from('xp_tiers').delete().eq('id', id)
    if (err) setError(err.message)
    else setRows((prev) => prev.filter((t) => t.id !== id))
    setConfirmDeleteId(null)
  }

  const f = (key: keyof XpTierForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">XP Tiers</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Define member experience point tiers</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          Add Tier
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-md3-body-md">Loading…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Label</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Min Points</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Max Points</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Badge Color</th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">{t.label}</td>
                  <td className="px-4 py-3 text-slate-700 font-mono text-md3-label-md">{t.min_points.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-md3-label-md">{t.max_points !== null ? t.max_points.toLocaleString() : '∞'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {t.badge_color && (
                        <span
                          className="w-5 h-5 rounded-full border border-slate-200 flex-shrink-0"
                          style={{ backgroundColor: t.badge_color }}
                        />
                      )}
                      <span className="text-md3-label-md font-mono text-slate-500">{t.badge_color ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(t)} className="p-1.5 text-slate-400 hover:text-blue transition-colors">
                        <PenOutline className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteId(t.id)} className="p-1.5 text-slate-400 hover:text-red transition-colors">
                        <TrashBinTrashOutline className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No XP tiers yet.</p>
          )}
        </div>
      )}

      {slideOver && (
        <SlideOver
          title={`${slideOver === 'create' ? 'Create' : 'Edit'} XP Tier`}
          onClose={() => setSlideOver(null)}
          onSubmit={() => void handleSave()}
          saving={saving}
        >
          <div>
            <label className={LABEL_CLS}>Name</label>
            <input className={INPUT_CLS} value={form.name} onChange={f('name')} placeholder="e.g. bronze" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Label</label>
            <input className={INPUT_CLS} value={form.label} onChange={f('label')} placeholder="e.g. Bronze Member" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Min Points</label>
            <input className={INPUT_CLS} type="number" min="0" value={form.min_points} onChange={f('min_points')} placeholder="e.g. 0" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Max Points (leave blank for unlimited)</label>
            <input className={INPUT_CLS} type="number" min="0" value={form.max_points} onChange={f('max_points')} placeholder="e.g. 999" />
          </div>
          <div>
            <label className={LABEL_CLS}>Badge Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.badge_color}
                onChange={(e) => setForm((p) => ({ ...p, badge_color: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
              />
              <input className={INPUT_CLS} value={form.badge_color} onChange={f('badge_color')} placeholder="#F8C630" />
            </div>
          </div>
        </SlideOver>
      )}

      {confirmDeleteId && (
        <ConfirmDelete
          label="XP tier"
          onConfirm={() => void handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

// ── Root: AdminCMS ────────────────────────────────────────────────────────

export default function AdminCMS() {
  const [activeTab, setActiveTab] = useState<Tab>('Upgrade Requests')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="px-8 pt-8 pb-4">
        <h1 className="text-md3-headline-sm font-black text-slate-900">CMS</h1>
        <p className="text-md3-body-md text-slate-500 mt-0.5">Manage platform content and access requests</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-100 px-8 pt-6 pb-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-md3-body-md font-semibold rounded-t-lg transition-colors ${
              activeTab === tab
                ? 'bg-white border border-b-white border-slate-100 text-blue -mb-px relative z-10'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white min-h-[calc(100vh-10rem)]">
        {activeTab === 'Upgrade Requests' && <UpgradeRequestsTab />}
        {activeTab === 'Rewards' && <RewardsTab />}
        {activeTab === 'Jobs' && <JobsTab />}
        {activeTab === 'Missions' && <MissionsTab />}
        {activeTab === 'Articles' && <ArticlesTab />}
        {activeTab === 'XP Tiers' && <XpTiersTab />}
      </div>
    </div>
  )
}
