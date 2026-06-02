import { useEffect, useState } from 'react'
import { AddCircleOutline, TrashBinTrashOutline } from 'solar-icon-set'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'

interface Assignment {
  id: string
  email: string
  chapter_id: string
  assigned_role: string
  is_active: boolean
  applied_at: string | null
  applied_user_id: string | null
  created_at: string
  chapters?: { name: string } | null
}

interface Chapter {
  id: string
  name: string
}

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  chapter_id: z.string().min(1, 'Select a chapter'),
})

type FormData = z.infer<typeof schema>

export default function AdminChapterOfficers() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const load = async () => {
    setIsLoading(true)
    const [assignRes, chaptersRes] = await Promise.all([
      supabase
        .from('officer_email_assignments')
        .select('*, chapters(name)')
        .order('created_at', { ascending: false }),
      supabase.from('chapters').select('id, name').order('name'),
    ])
    setAssignments((assignRes.data ?? []) as Assignment[])
    setChapters((chaptersRes.data ?? []) as Chapter[])
    setIsLoading(false)
  }

  useEffect(() => { void load() }, [])

  const onSubmit = async (data: FormData) => {
    setError(null)
    const { error: rpcErr } = await supabase.rpc('assign_officer_email', {
      p_email: data.email,
      p_chapter_id: data.chapter_id,
    })
    if (rpcErr) { setError(rpcErr.message); return }
    // Re-fetch so the new/updated row (with joined chapter name + applied status) is accurate.
    await load()
    reset({ email: '', chapter_id: '' })
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const { error: dbErr } = await supabase
      .from('officer_email_assignments')
      .delete()
      .eq('id', id)
    setDeletingId(null)
    setConfirmDeleteId(null)
    if (dbErr) { setError(dbErr.message); return }
    setAssignments((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-md3-headline-sm font-black text-slate-900">Chapter Officers</h1>
          <p className="text-md3-body-md text-slate-500 mt-0.5">
            Pre-assign an email to a chapter — they become an officer automatically on sign-up
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          Assign Officer
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
          <h2 className="text-md3-body-md font-bold text-slate-900">Assign Chapter Officer</h2>

          {/* Email */}
          <div>
            <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              autoComplete="off"
              placeholder="officer@example.com"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            />
            {errors.email && <p className="text-red text-[10px] mt-1">{errors.email.message}</p>}
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

          <p className="text-[11px] text-slate-400 leading-snug">
            If an account with this email already exists, it is upgraded immediately. Otherwise the
            officer role is applied automatically the next time they sign up.
          </p>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? 'Assigning…' : 'Assign Officer'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); reset({ email: '', chapter_id: '' }) }}
              className="px-4 py-2 bg-slate-100 text-slate-600 text-md3-body-md font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading assignments…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Chapter</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{a.email}</td>
                  <td className="px-4 py-3 text-slate-600">{a.chapters?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      a.applied_at ? 'bg-green/10 text-green' : 'bg-gold/10 text-slate-500'
                    }`}>
                      {a.applied_at ? 'Applied' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">
                    {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmDeleteId === a.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-md3-label-md px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >Cancel</button>
                        <button
                          onClick={() => void handleDelete(a.id)}
                          disabled={deletingId === a.id}
                          className="text-md3-label-md px-2 py-1 rounded-lg bg-red text-white disabled:opacity-50 hover:bg-red/80 transition-colors"
                        >{deletingId === a.id ? '…' : 'Delete'}</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(a.id)}
                        className="p-1 rounded-lg text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                        title="Remove assignment"
                      >
                        <TrashBinTrashOutline className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assignments.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No officer assignments yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
