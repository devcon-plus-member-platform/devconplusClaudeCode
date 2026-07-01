import { useEffect, useMemo, useState } from 'react'
import { TrashBinTrashOutline, CloseCircleLineDuotone, LetterOutline, CaseOutline, CalendarOutline, StarOutline, MagniferOutline, AltArrowUpOutline, AltArrowDownOutline } from 'solar-icon-set'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase, getBridgeToken } from '../../lib/supabase'
import { apiFetch } from '../../lib/api'
import { ROLE_DISPLAY_NAMES } from '../../lib/constants'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import ConfirmDialog from '../../components/ConfirmDialog'

import type { Profile, UserRole, PointTransaction } from '@devcon-plus/supabase'

const ROLES: UserRole[] = ['member', 'chapter_officer', 'hq_admin', 'super_admin']

type RoleFilter = UserRole | 'all'
const ROLE_FILTERS: RoleFilter[] = ['all', ...ROLES]

type SortColumn = 'name' | 'email' | 'role' | 'points'
type SortDir = 'asc' | 'desc'

function joinedTime(u: Profile): number {
  return u.created_at ? new Date(u.created_at).getTime() : 0
}

function roleRank(role: string | null | undefined): number {
  const i = ROLES.indexOf((role ?? 'member') as UserRole)
  return i === -1 ? 0 : i
}

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
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Count of users per role (across the full dataset) for the filter pills.
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const u of users) {
      const r = u.role ?? 'member'
      counts[r] = (counts[r] ?? 0) + 1
    }
    return counts
  }, [users])

  // Filter by role, then name/email/company, then sort. With no active column
  // the list stays newest-first (recent on top); clicking a header sorts by it.
  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matched = users.filter((u) => {
      if (roleFilter !== 'all' && (u.role ?? 'member') !== roleFilter) return false
      if (!q) return true
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.school_or_company ?? '').toLowerCase().includes(q)
      )
    })
    return [...matched].sort((a, b) => {
      if (sortColumn === null) return joinedTime(b) - joinedTime(a)
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortColumn) {
        case 'name': return a.full_name.localeCompare(b.full_name) * dir
        case 'email': return a.email.localeCompare(b.email) * dir
        case 'role': return (roleRank(a.role) - roleRank(b.role)) * dir
        case 'points': return ((a.spendable_points ?? 0) - (b.spendable_points ?? 0)) * dir
        default: return 0
      }
    })
  }, [users, search, roleFilter, sortColumn, sortDir])

  const { pageItems, ...pagination } = usePagination(visibleUsers, 10)

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

  const openUser = async (user: Profile) => {
    setSelectedUser(user)
    setUserTxns([])
    setTxnsLoading(true)
    try {
      const data = await apiFetch<PointTransaction[]>(`/api/admin/users/${user.id}/transactions`)
      setUserTxns(data)
    } finally {
      setTxnsLoading(false)
    }
  }

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await apiFetch<Profile[]>('/api/admin/users')
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const [pendingRole, setPendingRole] = useState<{ user: Profile; role: UserRole } | null>(null)

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      })
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u))
      if (selectedUser?.id === userId) {
        setSelectedUser((prev) => prev ? { ...prev, role: newRole } : prev)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed')
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

    const accessToken = getBridgeToken()
    if (!accessToken) {
      setError('Session expired. Please sign in again.')
      setDeletingId(null)
      setConfirmDeleteId(null)
      return
    }

    const res = await invokeWithToken(accessToken)

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
    <div className="p-8 h-full flex flex-col">
      <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Users</h1>
      <p className="text-md3-body-md text-slate-500 mb-6">Manage member roles and accounts</p>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading users…</p>
      ) : (
        <>
        <div className="relative mb-4 shrink-0">
          <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search by name, email, or company…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); pagination.setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 shrink-0">
          {ROLE_FILTERS.map((f) => {
            const active = roleFilter === f
            const label = f === 'all' ? 'All' : (ROLE_DISPLAY_NAMES[f] ?? f)
            const count = f === 'all' ? users.length : (roleCounts[f] ?? 0)
            return (
              <button
                key={f}
                type="button"
                onClick={() => { setRoleFilter(f); pagination.setPage(1) }}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-md3-label-md font-semibold border transition-colors ${
                  active
                    ? 'bg-blue text-white border-blue'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {label}
                <span className={active ? 'text-white/80' : 'text-slate-400'}>{count}</span>
              </button>
            )
          })}
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Name {sortIcon('name')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('email')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Email {sortIcon('email')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('role')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Role {sortIcon('role')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('points')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Points {sortIcon('points')}</button>
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((u) => (
                <tr
                  key={u.id}
                  className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => void openUser(u)}
                >
                  <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3 font-medium text-slate-900">{u.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={u.role}
                      onChange={(e) => {
                        const role = e.target.value as UserRole
                        if (role !== u.role) setPendingRole({ user: u, role })
                      }}
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
          {visibleUsers.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">
              {search.trim()
                ? `No users match "${search.trim()}".`
                : roleFilter !== 'all'
                  ? `No ${ROLE_DISPLAY_NAMES[roleFilter] ?? roleFilter} users found.`
                  : 'No users found.'}
            </p>
          )}
          </div>
          <Pagination controller={pagination} itemLabel="user" className="border-t border-slate-100 shrink-0" />
        </div>
        </>
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

              {/* Info section */}
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
                    onChange={(e) => {
                      const role = e.target.value as UserRole
                      if (role !== (selectedUser.role ?? 'member')) setPendingRole({ user: selectedUser, role })
                    }}
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
                  Delete User
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {pendingRole && (
        <ConfirmDialog
          title="Change this user's role?"
          message={`${pendingRole.user.full_name} will be set to ${ROLE_DISPLAY_NAMES[pendingRole.role] ?? pendingRole.role}. This changes their access immediately.`}
          confirmLabel="Change Role"
          tone="primary"
          onConfirm={() => { void handleRoleChange(pendingRole.user.id, pendingRole.role); setPendingRole(null) }}
          onCancel={() => setPendingRole(null)}
        />
      )}
    </div>
  )
}
