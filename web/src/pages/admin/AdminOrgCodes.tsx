import { useEffect, useMemo, useState } from 'react'
import { AddCircleOutline, PowerOutline, RefreshOutline, TrashBinTrashOutline, MagniferOutline, AltArrowUpOutline, AltArrowDownOutline } from 'solar-icon-set'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiFetch } from '../../lib/api'
import { useChaptersStore } from '../../stores/useChaptersStore'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import ConfirmDialog from '../../components/ConfirmDialog'

const generateCode = (): string => {
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('')
  const numbers = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 10)
  ).join('')
  return `DCN-${letters}-${numbers}`
}

interface OrgCode {
  id: string
  code: string
  chapter_id: string | null
  assigned_role: string
  is_active: boolean
  usage_limit: number | null
  usage_count: number
  expires_at: string | null
  created_at: string
  // Flat field returned by GET /api/org-codes (see server OrgCodeWithChapter)
  chapter_name: string | null
}

type SortColumn = 'code' | 'role' | 'chapter' | 'usage' | 'expires' | 'status'
type SortDir = 'asc' | 'desc'

function createdTime(c: OrgCode): number {
  return c.created_at ? new Date(c.created_at).getTime() : 0
}

function expiryTime(c: OrgCode): number {
  return c.expires_at ? new Date(c.expires_at).getTime() : Number.MAX_SAFE_INTEGER
}

const CODE_PATTERN = /^DCN-[A-Z]{3}-[0-9]{4}$/

const schema = z
  .object({
    code: z.string().regex(CODE_PATTERN, 'Must match DCN-XXX-XXXX format'),
    chapter_id: z.string().min(1, 'Select a chapter'),
    assigned_role: z.enum(['chapter_officer', 'hq_admin']),
    usage_limit: z.coerce.number().int().positive().optional(),
    has_usage_limit: z.boolean().default(false),
    expires_at: z.string().optional(),
    has_expiry: z.boolean().default(false),
  })

type FormData = z.infer<typeof schema>

export default function AdminOrgCodes() {
  const [codes, setCodes] = useState<OrgCode[]>([])
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const { chapters, fetchChapters } = useChaptersStore()
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rotatingId, setRotatingId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      assigned_role: 'chapter_officer',
      code: generateCode(),
      has_usage_limit: false,
      has_expiry: false,
    },
  })

  const hasUsageLimit = watch('has_usage_limit')
  const hasExpiry = watch('has_expiry')

  // Filter by code/chapter/role, then sort. With no active column the list
  // stays newest-first (recent on top); clicking a header sorts by that column.
  const visibleCodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matched = q
      ? codes.filter((c) =>
          c.code.toLowerCase().includes(q) ||
          (c.chapter_name ?? '').toLowerCase().includes(q) ||
          c.assigned_role.toLowerCase().includes(q),
        )
      : codes
    return [...matched].sort((a, b) => {
      if (sortColumn === null) return createdTime(b) - createdTime(a)
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortColumn) {
        case 'code': return a.code.localeCompare(b.code) * dir
        case 'role': return a.assigned_role.localeCompare(b.assigned_role) * dir
        case 'chapter': return (a.chapter_name ?? '').localeCompare(b.chapter_name ?? '') * dir
        case 'usage': return (a.usage_count - b.usage_count) * dir
        case 'expires': return (expiryTime(a) - expiryTime(b)) * dir
        case 'status': return ((a.is_active ? 1 : 0) - (b.is_active ? 1 : 0)) * dir
        default: return 0
      }
    })
  }, [codes, search, sortColumn, sortDir])

  const { pageItems, ...pagination } = usePagination(visibleCodes, 10)

  // Click cycles a column: asc → desc → back to default (newest first).
  const handleSort = (col: SortColumn) => {
    pagination.setPage(1)
    if (sortColumn !== col) {
      setSortColumn(col)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortColumn(null)
      setSortDir('asc')
    }
  }

  const sortIcon = (col: SortColumn) => {
    if (sortColumn !== col) return null
    return sortDir === 'asc'
      ? <AltArrowUpOutline color="#1152D4" width={14} height={14} />
      : <AltArrowDownOutline color="#1152D4" width={14} height={14} />
  }

  const load = async () => {
    setIsLoading(true)
    try {
      const codesData = await apiFetch<OrgCode[]>('/api/org-codes')
      setCodes(codesData)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    void fetchChapters()
  }, [fetchChapters]) // eslint-disable-line react-hooks/exhaustive-deps

  const [rotateTarget, setRotateTarget] = useState<OrgCode | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<OrgCode | null>(null)

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await apiFetch(`/api/org-codes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !current }),
      })
      setCodes((prev) => prev.map((c) => c.id === id ? { ...c, is_active: !current } : c))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toggle failed')
    }
  }

  const handleRotate = async (id: string) => {
    setRotatingId(id)
    const newCode = generateCode()
    try {
      await apiFetch(`/api/org-codes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ code: newCode }),
      })
      setCodes((prev) => prev.map((c) => c.id === id ? { ...c, code: newCode } : c))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rotation failed')
    } finally {
      setRotatingId(null)
    }
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await apiFetch(`/api/org-codes/${id}`, { method: 'DELETE' })
      setCodes((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  const onSubmit = async (data: FormData) => {
    setError(null)
    try {
      const inserted = await apiFetch<OrgCode>('/api/org-codes', {
        method: 'POST',
        body: JSON.stringify({
          code:          data.code.toUpperCase(),
          chapter_id:    data.chapter_id,
          assigned_role: data.assigned_role,
          usage_limit:   data.has_usage_limit ? (data.usage_limit ?? undefined) : undefined,
          expires_at:    data.has_expiry ? (data.expires_at ?? undefined) : undefined,
        }),
      })
      setCodes((prev) => [inserted, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
      return
    }
    reset({
      assigned_role: 'chapter_officer',
      code: generateCode(),
      has_usage_limit: false,
      has_expiry: false,
    })
    setShowForm(false)
  }

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-md3-headline-sm font-black text-slate-900">Organizer Codes</h1>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Issue codes to grant officer access per chapter</p>
        </div>
        <button
          onClick={() => { setValue('code', generateCode()); setShowForm((v) => !v) }}
          className="flex items-center gap-2.5 px-4 sm:px-6 py-3 bg-blue text-white text-md3-body-lg font-bold rounded-xl hover:bg-blue-dark active:scale-95 transition-colors"
        >
          <AddCircleOutline className="w-6 h-6" />
          <span className="hidden sm:inline">New Code</span>
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-card space-y-4"
        >
          <h2 className="text-md3-body-md font-bold text-slate-900">Create Organizer Code</h2>

          {/* Code */}
          <div>
            <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Code</label>
            <div className="flex gap-1.5">
              <input
                {...register('code')}
                readOnly
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md font-mono bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue"
              />
              <button
                type="button"
                onClick={() => setValue('code', generateCode())}
                className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-blue/10 hover:text-blue hover:border-blue/30 transition-colors"
                title="Regenerate"
              >
                <RefreshOutline className="w-4 h-4" />
              </button>
            </div>
            {errors.code && <p className="text-red text-[10px] mt-1">{errors.code.message}</p>}
          </div>

          {/* Chapter */}
          <div>
            <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Chapter</label>
            <select
              {...register('chapter_id')}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            >
              <option value="">Select…</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.chapter_id && <p className="text-red text-[10px] mt-1">{errors.chapter_id.message}</p>}
          </div>

          {/* Role */}
          <div>
            <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Role</label>
            <select
              {...register('assigned_role')}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            >
              <option value="chapter_officer">Chapter Officer</option>
              <option value="hq_admin">HQ Admin</option>
            </select>
          </div>

          {/* Usage Limit */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                {...register('has_usage_limit')}
                id="has_usage_limit"
                className="w-4 h-4 accent-blue"
              />
              <label htmlFor="has_usage_limit" className="text-md3-label-md text-slate-700">Limit uses</label>
            </div>
            {hasUsageLimit && (
              <input
                {...register('usage_limit')}
                type="number"
                min={1}
                placeholder="Max uses"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
              />
            )}
            {errors.usage_limit && <p className="text-red text-[10px] mt-1">{errors.usage_limit.message}</p>}
          </div>

          {/* Expiry */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                {...register('has_expiry')}
                id="has_expiry"
                className="w-4 h-4 accent-blue"
              />
              <label htmlFor="has_expiry" className="text-md3-label-md text-slate-700">Set expiry date</label>
            </div>
            {hasExpiry && (
              <input
                {...register('expires_at')}
                type="date"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
              />
            )}
            {errors.expires_at && <p className="text-red text-[10px] mt-1">{errors.expires_at.message}</p>}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? 'Creating…' : 'Create Code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                reset({
                  assigned_role: 'chapter_officer',
                  code: generateCode(),
                  has_usage_limit: false,
                  has_expiry: false,
                })
              }}
              className="px-4 py-2 bg-slate-100 text-slate-600 text-md3-body-md font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading codes…</p>
      ) : (
        <>
        <div className="relative mb-4 shrink-0">
          <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search by code, chapter, or role…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); pagination.setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('code')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Code {sortIcon('code')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('role')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Role {sortIcon('role')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('chapter')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Chapter {sortIcon('chapter')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('usage')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Usage {sortIcon('usage')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('expires')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Expires {sortIcon('expires')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Status {sortIcon('status')}</button>
                </th>
                <th className="text-right px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c) => (
                <tr key={c.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3 font-mono font-bold text-slate-900 text-md3-label-md tracking-wider">{c.code}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">{c.assigned_role}</td>
                  <td className="px-4 py-3 text-slate-600">{c.chapter_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md tabular-nums">
                    {c.usage_count} / {c.usage_limit ?? '∞'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">
                    {c.expires_at
                      ? new Date(c.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.is_active ? 'bg-green/10 text-green' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setRotateTarget(c)}
                        disabled={rotatingId === c.id}
                        className="p-1 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue disabled:opacity-40 transition-colors"
                        title="Rotate code"
                      >
                        <RefreshOutline className={`w-4 h-4 ${rotatingId === c.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => { if (c.is_active) setDeactivateTarget(c); else void handleToggle(c.id, c.is_active) }}
                        className="text-slate-400 hover:text-blue transition-colors"
                        title={c.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {c.is_active
                          ? <PowerOutline className="w-5 h-5" color="#21C45D" />
                          : <PowerOutline className="w-5 h-5" />
                        }
                      </button>
                      {confirmDeleteId === c.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-md3-label-md px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                          >Cancel</button>
                          <button
                            onClick={() => void handleDelete(c.id)}
                            disabled={deletingId === c.id}
                            className="text-md3-label-md px-2 py-1 rounded-lg bg-red text-white disabled:opacity-50 hover:bg-red/80 transition-colors"
                          >{deletingId === c.id ? '…' : 'Delete'}</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(c.id)}
                          className="p-1 rounded-lg text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                        >
                          <TrashBinTrashOutline className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleCodes.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">
              {search.trim() ? `No codes match "${search.trim()}".` : 'No organizer codes yet.'}
            </p>
          )}
          </div>
          <Pagination controller={pagination} itemLabel="code" className="border-t border-slate-100 shrink-0" />
        </div>
        </>
      )}

      {rotateTarget && (
        <ConfirmDialog
          title="Rotate this code?"
          message={`The current code ${rotateTarget.code} will stop working and be replaced with a new one. Anyone holding the old code will need the new one.`}
          confirmLabel="Rotate Code"
          tone="danger"
          loading={rotatingId === rotateTarget.id}
          onConfirm={() => { void handleRotate(rotateTarget.id); setRotateTarget(null) }}
          onCancel={() => setRotateTarget(null)}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate this code?"
          message={`${deactivateTarget.code} will stop working — no one will be able to sign up with it until you reactivate it.`}
          confirmLabel="Deactivate"
          tone="danger"
          onConfirm={() => { void handleToggle(deactivateTarget.id, deactivateTarget.is_active); setDeactivateTarget(null) }}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  )
}
