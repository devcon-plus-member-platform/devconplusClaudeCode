import { useEffect, useMemo, useState } from 'react'
import { AddCircleOutline, PenOutline, TrashBinTrashOutline, MagniferOutline, AltArrowUpOutline, AltArrowDownOutline } from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import { apiFetch, publicFetch } from '../../lib/api'
import AdminUpgradeRequests from './AdminUpgradeRequests'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import { INPUT_CLS, LABEL_CLS, SlideOver, ToggleRow, ConfirmDelete } from './cmsPrimitives'
import type { FeaturedStory, FeaturedStoryType, Job, NewsPost, XpTier } from '@devcon-plus/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────

// Rewards management moved to its own /admin/rewards page (catalog + claims).
const TABS = ['Upgrade Requests', 'Jobs', 'Articles', 'Featured Stories', 'XP Tiers'] as const
type Tab = typeof TABS[number]

// Shared sort direction for all sortable tables in this file.
type SortDir = 'asc' | 'desc'


// ── Tab 1: Upgrade Requests ───────────────────────────────────────────────

function UpgradeRequestsTab() {
  return <AdminUpgradeRequests />
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

// ── Tab 4: Featured Stories ───────────────────────────────────────────────

interface FeaturedStoryForm {
  type: FeaturedStoryType
  youtube_input: string // raw pasted URL or bare ID; parsed to youtube_id on save
  title: string
  article_url: string
  is_active: boolean
}

const defaultFeaturedStoryForm = (): FeaturedStoryForm => ({
  type: 'video',
  youtube_input: '',
  title: '',
  article_url: '',
  is_active: true,
})

// Accepts a bare video ID or a full YouTube URL (watch/shorts/youtu.be/embed) and
// returns just the video ID, so admins can paste whichever they have on hand.
function extractYoutubeId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{6,})/)
  return match ? match[1] : trimmed
}

type FeaturedStorySortColumn = 'title' | 'type' | 'is_active'

function FeaturedStoriesTab() {
  const [rows, setRows] = useState<FeaturedStory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<FeaturedStory | null>(null)
  const [form, setForm] = useState<FeaturedStoryForm>(defaultFeaturedStoryForm())
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [storySearch, setStorySearch] = useState('')
  const [storySortColumn, setStorySortColumn] = useState<FeaturedStorySortColumn | null>(null)
  const [storySortDir, setStorySortDir] = useState<SortDir>('asc')

  // Filter by title/type, then sort. With no active column the list stays
  // newest-first (most recently added on top).
  const visibleStories = useMemo(() => {
    const q = storySearch.trim().toLowerCase()
    const matched = q
      ? rows.filter((s) =>
          s.title.toLowerCase().includes(q) ||
          s.youtube_id.toLowerCase().includes(q),
        )
      : rows
    return [...matched].sort((a, b) => {
      if (storySortColumn === null) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      const dir = storySortDir === 'asc' ? 1 : -1
      switch (storySortColumn) {
        case 'title': return a.title.localeCompare(b.title) * dir
        case 'type': return a.type.localeCompare(b.type) * dir
        case 'is_active': return ((a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)) * dir
        default: return 0
      }
    })
  }, [rows, storySearch, storySortColumn, storySortDir])

  const { pageItems, ...pagination } = usePagination(visibleStories, 10)

  const handleStorySort = (col: FeaturedStorySortColumn) => {
    pagination.setPage(1)
    if (storySortColumn !== col) {
      setStorySortColumn(col)
      setStorySortDir('asc')
    } else if (storySortDir === 'asc') {
      setStorySortDir('desc')
    } else {
      setStorySortColumn(null)
      setStorySortDir('asc')
    }
  }

  const storySortIcon = (col: FeaturedStorySortColumn) => {
    if (storySortColumn !== col) return null
    return storySortDir === 'asc'
      ? <AltArrowUpOutline color="#1152D4" width={14} height={14} />
      : <AltArrowDownOutline color="#1152D4" width={14} height={14} />
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<FeaturedStory[]>('/api/featured-stories/admin')
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load featured stories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const openCreate = () => {
    setEditingItem(null)
    setForm(defaultFeaturedStoryForm())
    setSlideOver('create')
  }

  const openEdit = (s: FeaturedStory) => {
    setEditingItem(s)
    setForm({
      type: s.type,
      youtube_input: s.youtube_id,
      title: s.title,
      article_url: s.article_url ?? '',
      is_active: s.is_active,
    })
    setSlideOver('edit')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const payload = {
      type: form.type,
      youtube_id: extractYoutubeId(form.youtube_input),
      title: form.title.trim(),
      article_url: form.type === 'article' ? (form.article_url.trim() || null) : null,
      is_active: form.is_active,
    }
    try {
      if (slideOver === 'create') {
        await apiFetch('/api/featured-stories', { method: 'POST', body: JSON.stringify(payload) })
      } else if (editingItem) {
        await apiFetch(`/api/featured-stories/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
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
      await apiFetch<void>(`/api/featured-stories/${id}`, { method: 'DELETE' })
      setRows((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
    setConfirmDeleteId(null)
  }

  const f = (key: keyof FeaturedStoryForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Featured Stories</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">
            Manage the Home dashboard carousel — videos autoplay muted and loop; order is shuffled every visit.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          <span className="hidden sm:inline">Add Story</span>
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
            placeholder="Search by title or YouTube ID…"
            value={storySearch}
            onChange={(e) => { setStorySearch(e.target.value); pagination.setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[640px] text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  Thumbnail
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleStorySort('title')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Title {storySortIcon('title')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleStorySort('type')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Type {storySortIcon('type')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleStorySort('is_active')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Active {storySortIcon('is_active')}</button>
                </th>
                <th className="px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((s) => (
                <tr key={s.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3">
                    <img
                      src={`https://img.youtube.com/vi/${s.youtube_id}/default.jpg`}
                      alt=""
                      className="w-16 h-9 object-cover rounded-md bg-slate-100"
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900 max-w-xs truncate">{s.title}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md capitalize">{s.type}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green/10 text-green' : 'bg-slate-100 text-slate-400'}`}>
                      {s.is_active ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-blue transition-colors">
                        <PenOutline className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteId(s.id)} className="p-1.5 text-slate-400 hover:text-red transition-colors">
                        <TrashBinTrashOutline className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleStories.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">
              {storySearch.trim() ? `No stories match "${storySearch.trim()}".` : 'No featured stories yet — add a YouTube link to get started.'}
            </p>
          )}
          </div>
          <Pagination controller={pagination} itemLabel="story" className="border-t border-slate-100 shrink-0" />
        </div>
        </>
      )}

      {slideOver && (
        <SlideOver
          title={`${slideOver === 'create' ? 'Create' : 'Edit'} Featured Story`}
          onClose={() => setSlideOver(null)}
          onSubmit={() => void handleSave()}
          saving={saving}
          submitLabel={slideOver === 'create' ? 'Create Story' : 'Save Changes'}
        >
          <div>
            <label className={LABEL_CLS}>Type</label>
            <select
              className={INPUT_CLS}
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as FeaturedStoryType }))}
            >
              <option value="video">Video — opens YouTube on tap</option>
              <option value="article">Article — video preview, taps into an in-app article</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>YouTube Link or Video ID</label>
            <input className={INPUT_CLS} value={form.youtube_input} onChange={f('youtube_input')} placeholder="https://youtu.be/dQw4w9WgXcQ" required />
            <p className="text-[11px] text-slate-400 mt-1">Paste the full YouTube URL (watch, shorts, or youtu.be) — the video ID is extracted automatically. Plays autoloop, muted, and autoplay in the shuffled carousel.</p>
          </div>
          {form.youtube_input.trim() && (
            <img
              src={`https://img.youtube.com/vi/${extractYoutubeId(form.youtube_input)}/hqdefault.jpg`}
              alt="Video thumbnail preview"
              className="w-full rounded-xl bg-slate-100 aspect-video object-cover"
            />
          )}
          <div>
            <label className={LABEL_CLS}>Title</label>
            <input className={INPUT_CLS} value={form.title} onChange={f('title')} placeholder="e.g. DEVCON Summit 2026 Highlights" required />
          </div>
          {form.type === 'article' && (
            <div>
              <label className={LABEL_CLS}>Article Destination</label>
              <input className={INPUT_CLS} value={form.article_url} onChange={f('article_url')} placeholder="/news/welcome" />
              <p className="text-[11px] text-slate-400 mt-1">In-app path (e.g. /news/welcome) to navigate to on tap.</p>
            </div>
          )}
          <ToggleRow label="Active" checked={form.is_active} onChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
        </SlideOver>
      )}

      {confirmDeleteId && (
        <ConfirmDelete
          label="featured story"
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

      {/* Tab bar — horizontally scrollable on mobile so the tabs never force page-wide overflow */}
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
        {activeTab === 'Jobs' && <JobsTab />}
        {activeTab === 'Articles' && <ArticlesTab />}
        {activeTab === 'Featured Stories' && <FeaturedStoriesTab />}
        {activeTab === 'XP Tiers' && <XpTiersTab />}
      </div>
    </div>
  )
}
