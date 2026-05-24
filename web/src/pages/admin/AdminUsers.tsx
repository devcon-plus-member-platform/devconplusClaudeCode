import { useEffect, useState } from 'react'
import { TrashBinTrashOutline, CloseCircleLineDuotone, LetterOutline, CaseOutline, CalendarOutline, StarOutline } from 'solar-icon-set'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import type { Profile, UserRole, PointTransaction } from '@devcon-plus/supabase'

const ROLES: UserRole[] = ['member', 'chapter_officer', 'hq_admin', 'super_admin']

function getRolePillClass(role: string): string {
  switch (role) {
    case 'chapter_officer': return 'bg-blue/10 text-blue'
    case 'hq_admin': return 'bg-gold/10 text-gold'
    case 'super_admin': return 'bg-promoted/10 text-promoted'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function getUserInitials(fullName: string): string {
  return fullName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
}

export default function AdminUsers() {
  const [users, setUsers] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [userTxns, setUserTxns] = useState<PointTransaction[]>([])
  const [txnsLoading, setTxnsLoading] = useState(false)

  const openUser = async (user: Profile) => {
    setSelectedUser(user)
    setUserTxns([])
    setTxnsLoading(true)
    const { data } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
    setUserTxns((data ?? []) as PointTransaction[])
    setTxnsLoading(false)
  }

  const load = async () => {
    setIsLoading(true)
    const { data, error: dbErr } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (dbErr) { setError(dbErr.message); setIsLoading(false); return }
    setUsers((data ?? []) as Profile[])
    setIsLoading(false)
  }

  useEffect(() => { void load() }, [])

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const { error: dbErr } = await supabase.rpc('admin_update_user_role' as any, {
      p_user_id: userId,
      p_new_role: newRole,
    })
    if (dbErr) { setError(dbErr.message); return }
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) => prev ? { ...prev, role: newRole } : prev)
    }
  }

  const handleDelete = async (userId: string) => {
    setDeletingId(userId)
    setError(null)

    const invokeWithToken = (token: string) =>
      supabase.functions.invoke('delete-user', {
        body: { user_id: userId },
        headers: { Authorization: `Bearer ${token}` },
      })

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Session expired. Please sign in again.')
      setDeletingId(null)
      setConfirmDeleteId(null)
      return
    }

    let res = await invokeWithToken(session.access_token)

    // If the call failed, refresh the session once and retry.
    // Handles the case where the access token expired between getSession() and the call.
    if (res.error) {
      const { data: refreshed } = await supabase.auth.refreshSession()
      if (refreshed.session) {
        res = await invokeWithToken(refreshed.session.access_token)
      }
    }

    setDeletingId(null)
    setConfirmDeleteId(null)
    if (res.error || !(res.data as { success?: boolean })?.success) {
      const msg = (res.data as { error?: string })?.error ?? 'Failed to delete user.'
      setError(msg)
      return
    }
    setUsers((prev) => prev.filter((u) => u.id !== userId))
    if (selectedUser?.id === userId) setSelectedUser(null)
  }


  return (
    <div className="p-8">
      <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Users</h1>
      <p className="text-md3-body-md text-slate-500 mb-6">Manage member roles and accounts</p>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading users…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Points</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => void openUser(u)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={u.role}
                      onChange={(e) => void handleRoleChange(u.id, e.target.value as UserRole)}
                      className="text-md3-label-md border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-semibold">{(u.spendable_points ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {confirmDeleteId === u.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-md3-label-md text-slate-500">Sure?</span>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-md3-label-md px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void handleDelete(u.id)}
                          disabled={deletingId === u.id}
                          className="text-md3-label-md px-2 py-1 rounded-lg bg-red text-white disabled:opacity-50 hover:bg-red/80 transition-colors"
                        >
                          {deletingId === u.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(u.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                      >
                        <TrashBinTrashOutline className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No users found.</p>
          )}
        </div>
      )}

      {/* Slide-over panel */}
      <AnimatePresence>
        {selectedUser && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="fixed inset-0 bg-black/20 z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 overflow-y-auto"
            >
              {/* Header */}
              <div className="bg-slate-50 border-b border-slate-100 p-5 relative">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                >
                  <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
                </button>

                <div className="flex items-center gap-4 pr-8">
                  <div className="w-14 h-14 rounded-full bg-blue text-white flex items-center justify-center text-md3-title-lg font-bold flex-shrink-0">
                    {getUserInitials(selectedUser.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-md3-title-lg font-black text-slate-900 truncate">{selectedUser.full_name}</p>
                    <span className={`inline-block mt-1 text-md3-label-md font-semibold px-2.5 py-0.5 rounded-full ${getRolePillClass(selectedUser.role ?? 'member')}`}>
                      {selectedUser.role ?? 'member'}
                    </span>
                  </div>
                </div>
              </div>

              {/* InfoCircleOutline section */}
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <LetterOutline className="w-4 h-4 flex-shrink-0" color="#94A3B8" />
                  <span className="text-md3-body-md text-slate-700 truncate">{selectedUser.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CaseOutline className="w-4 h-4 flex-shrink-0" color="#94A3B8" />
                  <span className="text-md3-body-md text-slate-700">
                    {selectedUser.school_or_company ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <CalendarOutline className="w-4 h-4 flex-shrink-0" color="#94A3B8" />
                  <span className="text-md3-body-md text-slate-700">
                    {selectedUser.created_at
                      ? new Date(selectedUser.created_at).toLocaleDateString('en-PH', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StarOutline className="w-4 h-4 flex-shrink-0" color="#F8C630" />
                  <span className="text-md3-body-md font-bold text-gold">
                    {(selectedUser.spendable_points ?? 0).toLocaleString()} pts
                  </span>
                </div>
              </div>

              {/* Points History */}
              <div className="px-5 pb-5">
                <p className="text-md3-label-md font-bold uppercase tracking-wide text-slate-400 mb-3">
                  Points History
                </p>
                {txnsLoading ? (
                  <p className="text-md3-label-md text-slate-400">Loading…</p>
                ) : userTxns.length > 0 ? (
                  <div>
                    {userTxns.map((tx) => {
                      const isPositive = tx.amount > 0
                      const dateStr = tx.created_at
                        ? new Date(tx.created_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : ''
                      return (
                        <div key={tx.id} className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0">
                          <div className="min-w-0 mr-3">
                            <p className="text-md3-body-md font-medium text-slate-700 truncate">{tx.description}</p>
                            <p className="text-md3-label-md text-slate-400 mt-0.5">{dateStr}</p>
                          </div>
                          <p className={`text-md3-body-md font-bold flex-shrink-0 ${isPositive ? 'text-green' : 'text-red'}`}>
                            {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-md3-label-md text-slate-400">No transactions yet.</p>
                )}
              </div>

              {/* Actions */}
              <div className="px-5 pb-6 space-y-2 border-t border-slate-100 pt-5">
                <p className="text-md3-label-md font-bold uppercase tracking-wide text-slate-400 mb-3">
                  Actions
                </p>

                <div>
                  <label className="text-md3-label-md text-slate-500 mb-1 block">Change Role</label>
                  <select
                    value={selectedUser.role ?? 'member'}
                    onChange={(e) => void handleRoleChange(selectedUser.id, e.target.value as UserRole)}
                    className="w-full text-md3-body-md border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => {
                    setConfirmDeleteId(selectedUser.id)
                    setSelectedUser(null)
                  }}
                  className="w-full mt-2 px-4 py-2.5 rounded-xl text-md3-body-md font-semibold bg-red/10 text-red hover:bg-red hover:text-white transition-colors"
                >
                  Delete UserOutline
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
