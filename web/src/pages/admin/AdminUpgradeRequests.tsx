import { useEffect, useState } from 'react'
import { CheckCircleOutline, CloseCircleOutline } from 'solar-icon-set'
import { apiFetch } from '../../lib/api'
import { useAuthStore } from '../../stores/useAuthStore'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'

interface UpgradeRequest {
  id: string
  user_id: string
  organizer_code: string
  chapter_id: string | null
  requested_role: 'chapter_officer' | 'hq_admin'
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
  // Flat fields returned by GET /api/upgrades (see server UpgradeRequestWithDetails)
  member_name: string
  member_email: string
  member_chapter_id: string | null
  member_chapter_name: string | null
  request_chapter_name: string | null
}

const ROLE_LABELS: Record<string, string> = {
  chapter_officer: 'Chapter Officer',
  hq_admin: 'HQ Admin',
}

export default function AdminUpgradeRequests() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<UpgradeRequest[]>([])
  const { pageItems, ...pagination } = usePagination(requests, 10)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await apiFetch<UpgradeRequest[]>('/api/upgrades')
      setRequests(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleApprove = async (req: UpgradeRequest) => {
    if (!user) return
    setActionLoading(req.id)
    setError(null)
    try {
      await apiFetch(`/api/upgrades/${req.id}/approve`, { method: 'POST' })
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
      await apiFetch(`/api/upgrades/${req.id}/reject`, { method: 'POST' })
      setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'rejected' } : r))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
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
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[640px] text-md3-body-md">
            <thead className="sticky top-0 z-10">
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
              {pageItems.map((req) => (
                <tr key={req.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900 text-md3-body-md">{req.member_name || '—'}</p>
                    <p className="text-md3-label-md text-slate-400">{req.member_email || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">
                    {req.member_chapter_name ?? 'No chapter'}
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
          <Pagination controller={pagination} itemLabel="request" className="border-t border-slate-100 shrink-0" />
        </div>
      )}
    </div>
  )
}
