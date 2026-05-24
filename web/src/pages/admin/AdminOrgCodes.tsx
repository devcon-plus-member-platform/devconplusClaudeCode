import { useEffect, useState } from 'react'
import { AddCircleOutline, PowerOutline, RefreshOutline, TrashBinTrashOutline } from 'solar-icon-set'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'

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
  chapters?: { name: string } | null
}

interface Chapter {
  id: string
  name: string
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
  const [chapters, setChapters] = useState<Chapter[]>([])
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

  const load = async () => {
    setIsLoading(true)
    const [codesRes, chaptersRes] = await Promise.all([
      supabase
        .from('organizer_codes')
        .select('*, chapters(name)')
        .order('created_at', { ascending: false }),
      supabase.from('chapters').select('id, name').order('name'),
    ])
    setCodes((codesRes.data ?? []) as OrgCode[])
    setChapters((chaptersRes.data ?? []) as Chapter[])
    setIsLoading(false)
  }

  useEffect(() => { void load() }, [])

  const handleToggle = async (id: string, current: boolean) => {
    const { error: dbErr } = await supabase
      .from('organizer_codes')
      .update({ is_active: !current })
      .eq('id', id)
    if (dbErr) { setError(dbErr.message); return }
    setCodes((prev) => prev.map((c) => c.id === id ? { ...c, is_active: !current } : c))
  }

  const handleRotate = async (id: string) => {
    setRotatingId(id)
    const newCode = generateCode()
    const { error: dbErr } = await supabase
      .from('organizer_codes')
      .update({ code: newCode })
      .eq('id', id)
    setRotatingId(null)
    if (dbErr) { setError(dbErr.message); return }
    setCodes((prev) => prev.map((c) => c.id === id ? { ...c, code: newCode } : c))
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const { error: dbErr } = await supabase
      .from('organizer_codes')
      .delete()
      .eq('id', id)
    setDeletingId(null)
    setConfirmDeleteId(null)
    if (dbErr) { setError(dbErr.message); return }
    setCodes((prev) => prev.filter((c) => c.id !== id))
  }

  const onSubmit = async (data: FormData) => {
    setError(null)
    const { data: inserted, error: dbErr } = await supabase
      .from('organizer_codes')
      .insert({
        code: data.code.toUpperCase(),
        chapter_id: data.chapter_id,
        assigned_role: data.assigned_role,
        is_active: true,
        usage_limit: data.has_usage_limit ? (data.usage_limit ?? null) : null,
        usage_count: 0,
        expires_at: data.has_expiry ? (data.expires_at ?? null) : null,
      })
      .select('*, chapters(name)')
      .single()
    if (dbErr) { setError(dbErr.message); return }
    setCodes((prev) => [inserted as OrgCode, ...prev])
    reset({
      assigned_role: 'chapter_officer',
      code: generateCode(),
      has_usage_limit: false,
      has_expiry: false,
    })
    setShowForm(false)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-md3-headline-sm font-black text-slate-900">Organizer Codes</h1>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Issue codes to grant officer access per chapter</p>
        </div>
        <button
          onClick={() => { setValue('code', generateCode()); setShowForm((v) => !v) }}
          className="flex items-center gap-2 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          New Code
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
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Code</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Chapter</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Usage</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Expires</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-slate-900 text-md3-label-md tracking-wider">{c.code}</td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">{c.assigned_role}</td>
                  <td className="px-4 py-3 text-slate-600">{c.chapters?.name ?? '—'}</td>
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
                        onClick={() => void handleRotate(c.id)}
                        disabled={rotatingId === c.id}
                        className="p-1 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue disabled:opacity-40 transition-colors"
                        title="Rotate code"
                      >
                        <RefreshOutline className={`w-4 h-4 ${rotatingId === c.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => void handleToggle(c.id, c.is_active)}
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
          {codes.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No organizer codes yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
