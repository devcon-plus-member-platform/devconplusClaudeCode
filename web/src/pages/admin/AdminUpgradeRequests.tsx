import { useEffect, useState } from 'react'
import { CheckCircleOutline, CloseCircleOutline } from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'

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

const ROLE_LABELS: Record<string, string> = {
  chapter_officer: 'Chapter Officer',
  hq_admin: 'HQ Admin',
}

export default function AdminUpgradeRequests() {
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
      // Single atomic RPC — updates profile role + marks request approved server-side.
      // Direct anon-key UPDATE on another user's profile is blocked by RLS.
      const { error } = await supabase.rpc('approve_organizer_upgrade', {
        p_request_id: req.id,
        p_user_id:    req.user_id,
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
      const { error: rpcErr } = await supabase.rpc('reject_organizer_upgrade' as any, {
        p_request_id: req.id,
        p_user_id:    req.user_id,
      })
      if (rpcErr) throw rpcErr

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
          <h1 className="text-md3-headline-sm font-black text-slate-900">Organizer Upgrade Requests</h1>
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
