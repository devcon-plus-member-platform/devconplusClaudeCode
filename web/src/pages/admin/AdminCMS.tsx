import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleOutline, PenOutline, TrashBinTrashOutline, CloseCircleLineDuotone, CheckCircleOutline, CloseCircleOutline, StarOutline, UserOutline, LinkOutline, DocumentTextOutline, ClockCircleOutline, ArrowLeftOutline, MagniferOutline, AltArrowUpOutline, AltArrowDownOutline } from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import { apiFetch, publicFetch } from '../../lib/api'
import { cardItem, slideUp, staggerContainer } from '../../lib/animation'
import type { SolarIcon } from '../../lib/icons'
import AdminUpgradeRequests from './AdminUpgradeRequests'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import ConfirmDialog from '../../components/ConfirmDialog'
import { INPUT_CLS, LABEL_CLS, SlideOver, ToggleRow, ConfirmDelete, RejectModal } from './cmsPrimitives'
import type { Reward, Job, NewsPost, XpTier } from '@devcon-plus/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────

const TABS = ['Upgrade Requests', 'Rewards', 'Jobs', 'Point Submissions', 'Articles', 'XP Tiers'] as const
type Tab = typeof TABS[number]

// Shared sort direction for all sortable tables in this file.
type SortDir = 'asc' | 'desc'


// ── Tab 1: Upgrade Requests ───────────────────────────────────────────────

function UpgradeRequestsTab() {
  return <AdminUpgradeRequests />
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

type RewardSortColumn = 'name' | 'points_cost' | 'type' | 'claim_method' | 'is_active' | 'is_coming_soon'

function RewardsTab() {
  const [rows, setRows] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<Reward | null>(null)
  const [form, setForm] = useState<RewardForm>(defaultRewardForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [rewardSearch, setRewardSearch] = useState('')
  const [rewardSortColumn, setRewardSortColumn] = useState<RewardSortColumn | null>(null)
  const [rewardSortDir, setRewardSortDir] = useState<SortDir>('asc')

  // Filter by name/type/claim method, then sort. With no active column the list
  // stays newest-first (most recently added rewards on top).
  const visibleRewards = useMemo(() => {
    const q = rewardSearch.trim().toLowerCase()
    const matched = q
      ? rows.filter((r) =>
          r.name.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.claim_method.toLowerCase().includes(q),
        )
      : rows
    return [...matched].sort((a, b) => {
      if (rewardSortColumn === null) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      const dir = rewardSortDir === 'asc' ? 1 : -1
      switch (rewardSortColumn) {
        case 'name': return a.name.localeCompare(b.name) * dir
        case 'points_cost': return (a.points_cost - b.points_cost) * dir
        case 'type': return a.type.localeCompare(b.type) * dir
        case 'claim_method': return a.claim_method.localeCompare(b.claim_method) * dir
        case 'is_active': return ((a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)) * dir
        case 'is_coming_soon': return ((a.is_coming_soon ? 1 : 0) - (b.is_coming_soon ? 1 : 0)) * dir
        default: return 0
      }
    })
  }, [rows, rewardSearch, rewardSortColumn, rewardSortDir])

  const { pageItems, ...pagination } = usePagination(visibleRewards, 10)

  const handleRewardSort = (col: RewardSortColumn) => {
    pagination.setPage(1)
    if (rewardSortColumn !== col) {
      setRewardSortColumn(col)
      setRewardSortDir('asc')
    } else if (rewardSortDir === 'asc') {
      setRewardSortDir('desc')
    } else {
      setRewardSortColumn(null)
      setRewardSortDir('asc')
    }
  }

  const rewardSortIcon = (col: RewardSortColumn) => {
    if (rewardSortColumn !== col) return null
    return rewardSortDir === 'asc'
      ? <AltArrowUpOutline color="#1152D4" width={14} height={14} />
      : <AltArrowDownOutline color="#1152D4" width={14} height={14} />
  }

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
        await apiFetch('/api/rewards', { method: 'POST', body: JSON.stringify(payload) })
      } else if (editingItem) {
        await apiFetch(`/api/rewards/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
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
    try {
      await apiFetch(`/api/rewards/${id}`, { method: 'DELETE' })
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
    setConfirmDeleteId(null)
  }

  const f = (key: keyof RewardForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Rewards</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage the rewards catalog</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          <span className="hidden sm:inline">Add Reward</span>
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-md3-body-md">Loading…</p>
      ) : (
        <>
        <div className="relative mb-4 shrink-0">
          <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search by name, type, or claim method…"
            value={rewardSearch}
            onChange={(e) => { setRewardSearch(e.target.value); pagination.setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[640px] text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleRewardSort('name')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Name {rewardSortIcon('name')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleRewardSort('points_cost')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Points Cost {rewardSortIcon('points_cost')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleRewardSort('type')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Type {rewardSortIcon('type')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleRewardSort('claim_method')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Claim Method {rewardSortIcon('claim_method')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleRewardSort('is_active')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Active {rewardSortIcon('is_active')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleRewardSort('is_coming_soon')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Coming Soon {rewardSortIcon('is_coming_soon')}</button>
                </th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r) => (
                <tr key={r.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3 font-semibold text-slate-900">{r.name}</td>
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
          {visibleRewards.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">
              {rewardSearch.trim() ? `No rewards match "${rewardSearch.trim()}".` : 'No rewards yet.'}
            </p>
          )}
          </div>
          <Pagination controller={pagination} itemLabel="reward" className="border-t border-slate-100 shrink-0" />
        </div>
        </>
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

type JobSortColumn = 'title' | 'company' | 'location' | 'work_type' | 'is_promoted' | 'is_active'

function jobPostedTime(j: Job): number {
  return j.posted_at ? new Date(j.posted_at).getTime() : 0
}

function JobsTab() {
  const [rows, setRows] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<Job | null>(null)
  const [form, setForm] = useState<JobForm>(defaultJobForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [jobSearch, setJobSearch] = useState('')
  const [jobSortColumn, setJobSortColumn] = useState<JobSortColumn | null>(null)
  const [jobSortDir, setJobSortDir] = useState<SortDir>('asc')

  // Filter by title/company/location/type, then sort. With no active column the
  // list stays newest-first by posted_at (matching the load query).
  const visibleJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase()
    const matched = q
      ? rows.filter((j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          (j.location ?? '').toLowerCase().includes(q) ||
          j.work_type.toLowerCase().includes(q),
        )
      : rows
    return [...matched].sort((a, b) => {
      if (jobSortColumn === null) return jobPostedTime(b) - jobPostedTime(a)
      const dir = jobSortDir === 'asc' ? 1 : -1
      switch (jobSortColumn) {
        case 'title': return a.title.localeCompare(b.title) * dir
        case 'company': return a.company.localeCompare(b.company) * dir
        case 'location': return (a.location ?? '').localeCompare(b.location ?? '') * dir
        case 'work_type': return a.work_type.localeCompare(b.work_type) * dir
        case 'is_promoted': return ((a.is_promoted ? 1 : 0) - (b.is_promoted ? 1 : 0)) * dir
        case 'is_active': return ((a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)) * dir
        default: return 0
      }
    })
  }, [rows, jobSearch, jobSortColumn, jobSortDir])

  const { pageItems, ...pagination } = usePagination(visibleJobs, 10)

  const handleJobSort = (col: JobSortColumn) => {
    pagination.setPage(1)
    if (jobSortColumn !== col) {
      setJobSortColumn(col)
      setJobSortDir('asc')
    } else if (jobSortDir === 'asc') {
      setJobSortDir('desc')
    } else {
      setJobSortColumn(null)
      setJobSortDir('asc')
    }
  }

  const jobSortIcon = (col: JobSortColumn) => {
    if (jobSortColumn !== col) return null
    return jobSortDir === 'asc'
      ? <AltArrowUpOutline color="#1152D4" width={14} height={14} />
      : <AltArrowDownOutline color="#1152D4" width={14} height={14} />
  }

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
        await apiFetch('/api/jobs', { method: 'POST', body: JSON.stringify(payload) })
      } else if (editingItem) {
        await apiFetch(`/api/jobs/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
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
    try {
      await apiFetch(`/api/jobs/${id}`, { method: 'DELETE' })
      setRows((prev) => prev.filter((j) => j.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
    setConfirmDeleteId(null)
  }

  const f = (key: keyof JobForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Jobs</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage the jobs board listings</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          <span className="hidden sm:inline">Add Job</span>
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-md3-body-md">Loading…</p>
      ) : (
        <>
        <div className="relative mb-4 shrink-0">
          <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search by title, company, location, or type…"
            value={jobSearch}
            onChange={(e) => { setJobSearch(e.target.value); pagination.setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[640px] text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleJobSort('title')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Title {jobSortIcon('title')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleJobSort('company')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Company {jobSortIcon('company')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleJobSort('location')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Location {jobSortIcon('location')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleJobSort('work_type')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Type {jobSortIcon('work_type')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleJobSort('is_promoted')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Promoted {jobSortIcon('is_promoted')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleJobSort('is_active')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Active {jobSortIcon('is_active')}</button>
                </th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((j) => (
                <tr key={j.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3 font-semibold text-slate-900">{j.title}</td>
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
          {visibleJobs.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">
              {jobSearch.trim() ? `No jobs match "${jobSearch.trim()}".` : 'No jobs yet.'}
            </p>
          )}
          </div>
          <Pagination controller={pagination} itemLabel="job" className="border-t border-slate-100 shrink-0" />
        </div>
        </>
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

type ArticleSortColumn = 'title' | 'category' | 'is_featured' | 'is_promoted'

function ArticlesTab() {
  const [rows, setRows] = useState<NewsPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<NewsPost | null>(null)
  const [form, setForm] = useState<ArticleForm>(defaultArticleForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [articleSearch, setArticleSearch] = useState('')
  const [articleSortColumn, setArticleSortColumn] = useState<ArticleSortColumn | null>(null)
  const [articleSortDir, setArticleSortDir] = useState<SortDir>('asc')

  // Filter by title/category/body, then sort. With no active column the list
  // stays newest-first (most recently created on top).
  const visibleArticles = useMemo(() => {
    const q = articleSearch.trim().toLowerCase()
    const matched = q
      ? rows.filter((n) =>
          n.title.toLowerCase().includes(q) ||
          n.category.toLowerCase().includes(q) ||
          (n.body ?? '').toLowerCase().includes(q),
        )
      : rows
    return [...matched].sort((a, b) => {
      if (articleSortColumn === null) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      const dir = articleSortDir === 'asc' ? 1 : -1
      switch (articleSortColumn) {
        case 'title': return a.title.localeCompare(b.title) * dir
        case 'category': return a.category.localeCompare(b.category) * dir
        case 'is_featured': return (((a.is_featured ? 1 : 0)) - ((b.is_featured ? 1 : 0))) * dir
        case 'is_promoted': return (((a.is_promoted ? 1 : 0)) - ((b.is_promoted ? 1 : 0))) * dir
        default: return 0
      }
    })
  }, [rows, articleSearch, articleSortColumn, articleSortDir])

  const { pageItems, ...pagination } = usePagination(visibleArticles, 10)

  const handleArticleSort = (col: ArticleSortColumn) => {
    pagination.setPage(1)
    if (articleSortColumn !== col) {
      setArticleSortColumn(col)
      setArticleSortDir('asc')
    } else if (articleSortDir === 'asc') {
      setArticleSortDir('desc')
    } else {
      setArticleSortColumn(null)
      setArticleSortDir('asc')
    }
  }

  const articleSortIcon = (col: ArticleSortColumn) => {
    if (articleSortColumn !== col) return null
    return articleSortDir === 'asc'
      ? <AltArrowUpOutline color="#1152D4" width={14} height={14} />
      : <AltArrowDownOutline color="#1152D4" width={14} height={14} />
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await publicFetch<NewsPost[]>('/api/news')
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles')
    } finally {
      setLoading(false)
    }
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
      category: n.category === 'tech_community' ? 'tech_community' : 'devcon',
      cover_image_url: n.cover_image_url ?? '',
      is_featured: n.is_featured ?? false,
      is_promoted: n.is_promoted ?? false,
    })
    setSlideOver('edit')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
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
        await apiFetch('/api/news', { method: 'POST', body: JSON.stringify(payload) })
      } else if (editingItem) {
        await apiFetch(`/api/news/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
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
    try {
      await apiFetch<void>(`/api/news/${id}`, { method: 'DELETE' })
      setRows((prev) => prev.filter((n) => n.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
    setConfirmDeleteId(null)
  }

  const f = (key: keyof ArticleForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Articles</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage news posts and updates</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          <span className="hidden sm:inline">Add Article</span>
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-md3-body-md">Loading…</p>
      ) : (
        <>
        <div className="relative mb-4 shrink-0">
          <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search by title, category, or body…"
            value={articleSearch}
            onChange={(e) => { setArticleSearch(e.target.value); pagination.setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[640px] text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleArticleSort('title')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Title {articleSortIcon('title')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleArticleSort('category')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Category {articleSortIcon('category')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleArticleSort('is_featured')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Featured {articleSortIcon('is_featured')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleArticleSort('is_promoted')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Promoted {articleSortIcon('is_promoted')}</button>
                </th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((n) => (
                <tr key={n.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3 font-semibold text-slate-900 max-w-xs truncate">{n.title}</td>
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
          {visibleArticles.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">
              {articleSearch.trim() ? `No articles match "${articleSearch.trim()}".` : 'No articles yet.'}
            </p>
          )}
          </div>
          <Pagination controller={pagination} itemLabel="article" className="border-t border-slate-100 shrink-0" />
        </div>
        </>
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


const defaultXpTierForm = (): XpTierForm => ({
  name: '',
  label: '',
  min_points: '',
  max_points: '',
  badge_color: '#F8C630',
})

type XpTierSortColumn = 'name' | 'label' | 'min_points' | 'max_points' | 'badge_color'

function XpTiersTab() {
  const [rows, setRows] = useState<XpTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<XpTier | null>(null)
  const [form, setForm] = useState<XpTierForm>(defaultXpTierForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [tierSearch, setTierSearch] = useState('')
  const [tierSortColumn, setTierSortColumn] = useState<XpTierSortColumn | null>(null)
  const [tierSortDir, setTierSortDir] = useState<SortDir>('asc')

  // Filter by name/label/badge color, then sort. With no active column the list
  // keeps the server-returned order.
  const visibleTiers = useMemo(() => {
    const q = tierSearch.trim().toLowerCase()
    const matched = q
      ? rows.filter((t) =>
          t.name.toLowerCase().includes(q) ||
          t.label.toLowerCase().includes(q) ||
          (t.badge_color ?? '').toLowerCase().includes(q),
        )
      : rows
    return [...matched].sort((a, b) => {
      if (tierSortColumn === null) return 0
      const dir = tierSortDir === 'asc' ? 1 : -1
      switch (tierSortColumn) {
        case 'name': return a.name.localeCompare(b.name) * dir
        case 'label': return a.label.localeCompare(b.label) * dir
        case 'min_points': return (a.min_points - b.min_points) * dir
        case 'max_points': return ((a.max_points ?? Infinity) - (b.max_points ?? Infinity)) * dir
        case 'badge_color': return (a.badge_color ?? '').localeCompare(b.badge_color ?? '') * dir
        default: return 0
      }
    })
  }, [rows, tierSearch, tierSortColumn, tierSortDir])

  const { pageItems, ...pagination } = usePagination(visibleTiers, 10)

  const handleTierSort = (col: XpTierSortColumn) => {
    pagination.setPage(1)
    if (tierSortColumn !== col) {
      setTierSortColumn(col)
      setTierSortDir('asc')
    } else if (tierSortDir === 'asc') {
      setTierSortDir('desc')
    } else {
      setTierSortColumn(null)
      setTierSortDir('asc')
    }
  }

  const tierSortIcon = (col: XpTierSortColumn) => {
    if (tierSortColumn !== col) return null
    return tierSortDir === 'asc'
      ? <AltArrowUpOutline color="#1152D4" width={14} height={14} />
      : <AltArrowDownOutline color="#1152D4" width={14} height={14} />
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<XpTier[]>('/api/points/tiers')
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tiers')
    } finally {
      setLoading(false)
    }
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
      name:       form.name.trim(),
      label:      form.label.trim(),
      min_points: parseInt(form.min_points, 10) || 0,
      max_points: form.max_points.trim() !== '' ? parseInt(form.max_points, 10) : null,
      badge_color: form.badge_color.trim() || null,
    }
    try {
      if (slideOver === 'create') {
        await apiFetch('/api/points/tiers', { method: 'POST', body: JSON.stringify(payload) })
      } else if (editingItem) {
        await apiFetch(`/api/points/tiers/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
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
    try {
      await apiFetch(`/api/points/tiers/${id}`, { method: 'DELETE' })
      setRows((prev) => prev.filter((t) => t.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
    setConfirmDeleteId(null)
  }

  const f = (key: keyof XpTierForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">XP Tiers</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Define member experience point tiers</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          <span className="hidden sm:inline">Add Tier</span>
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-slate-400 text-md3-body-md">Loading…</p>
      ) : (
        <>
        <div className="relative mb-4 shrink-0">
          <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search by name, label, or color…"
            value={tierSearch}
            onChange={(e) => { setTierSearch(e.target.value); pagination.setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[640px] text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleTierSort('name')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Name {tierSortIcon('name')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleTierSort('label')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Label {tierSortIcon('label')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleTierSort('min_points')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Min Points {tierSortIcon('min_points')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleTierSort('max_points')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Max Points {tierSortIcon('max_points')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleTierSort('badge_color')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Badge Color {tierSortIcon('badge_color')}</button>
                </th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3 font-semibold text-slate-900">{t.name}</td>
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
          {visibleTiers.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">
              {tierSearch.trim() ? `No tiers match "${tierSearch.trim()}".` : 'No XP tiers yet.'}
            </p>
          )}
          </div>
          <Pagination controller={pagination} itemLabel="tier" className="border-t border-slate-100 shrink-0" />
        </div>
        </>
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

// ── Tab: Point Submissions ────────────────────────────────────────────────

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

// ── Main Tab ──────────────────────────────────────────────────────────────────

function PointSubmissionsTab() {
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
    <div className="p-4 md:p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Point Submissions</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Review mission submissions and award or reject points</p>
        </div>
        <button onClick={() => void load()} className="px-3 py-2 bg-slate-100 text-slate-600 text-md3-label-md font-semibold rounded-xl hover:bg-slate-200 transition-colors">
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

      {filtered.length > 10 && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-4 w-10 h-10 bg-blue text-white rounded-full shadow-card flex items-center justify-center"
          aria-label="Scroll to top"
        >
          <ArrowLeftOutline color="white" width={16} height={16} className="rotate-90" />
        </button>
      )}

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

// ── Root: AdminCMS ────────────────────────────────────────────────────────

export default function AdminCMS() {
  const [activeTab, setActiveTab] = useState<Tab>('Upgrade Requests')

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Page header */}
      <div className="px-4 pt-6 md:px-8 md:pt-8 pb-4 shrink-0">
        <h1 className="text-md3-headline-sm font-black text-slate-900">CMS</h1>
        <p className="text-md3-body-md text-slate-500 mt-0.5">Manage platform content and access requests</p>
      </div>

      {/* Tab bar — horizontally scrollable on mobile so the 7 tabs never force page-wide overflow */}
      <div className="flex gap-1 border-b border-slate-100 px-4 md:px-8 pt-6 pb-0 shrink-0 overflow-x-auto md:overflow-x-visible">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-md3-body-md font-semibold rounded-t-lg transition-colors ${
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
      <div className="flex-1 min-h-0 bg-white">
        {activeTab === 'Upgrade Requests' && <UpgradeRequestsTab />}
        {activeTab === 'Rewards' && <RewardsTab />}
        {activeTab === 'Jobs' && <JobsTab />}
        {activeTab === 'Point Submissions' && <PointSubmissionsTab />}
        {activeTab === 'Articles' && <ArticlesTab />}
        {activeTab === 'XP Tiers' && <XpTiersTab />}
      </div>
    </div>
  )
}
