import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, CopyOutline, CheckCircleOutline, UsersGroupRoundedOutline, ClockCircleOutline, TrashBinTrashOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrganizerUser } from '../../../stores/useOrgAuthStore'
import { useAuthStore } from '../../../stores/useAuthStore'
import { supabase } from '../../../lib/supabase'
import { formatDate } from '../../../lib/dates'
import { staggerContainer, cardItem } from '../../../lib/animation'

interface ChapterCode {
  code: string
}

interface PendingRequest {
  id: string
  created_at: string
  profiles: {
    id: string
    full_name: string
    email: string
    avatar_url: string | null
  } | null
}

interface CoOrganizer {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  created_at: string | null
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export function OrgCoOrganizers() {
  const navigate = useNavigate()
  const orgUser = useOrganizerUser()
  const { user } = useAuthStore()

  const [chapterCode, setChapterCode] = useState<ChapterCode | null>(null)
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [coOrganizers, setCoOrganizers] = useState<CoOrganizer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.chapter_id) return
    void loadAll(user.chapter_id)
  }, [user?.chapter_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll(chapterId: string) {
    setLoading(true)
    setError(null)
    try {
      const [codeRes, pendingRes, coOrgRes] = await Promise.all([
        supabase
          .from('organizer_codes')
          .select('code')
          .eq('chapter_id', chapterId)
          .eq('assigned_role', 'chapter_officer')
          .eq('is_active', true)
          .limit(1)
          .single(),

        supabase
          .from('organizer_upgrade_requests')
          .select('id, created_at, profiles!user_id(id, full_name, email, avatar_url)')
          .eq('chapter_id', chapterId)
          .eq('status', 'pending')
          .eq('requested_role', 'chapter_officer')
          .order('created_at', { ascending: false }),

        supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, created_at')
          .eq('chapter_id', chapterId)
          .eq('role', 'chapter_officer')
          .neq('id', user!.id)
          .order('created_at', { ascending: false }),
      ])

      if (codeRes.data) setChapterCode(codeRes.data)
      if (pendingRes.data) setPendingRequests(pendingRes.data as unknown as PendingRequest[])
      if (coOrgRes.data) setCoOrganizers(coOrgRes.data)
    } catch {
      setError('Failed to load co-organizer data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!chapterCode) return
    void navigator.clipboard.writeText(chapterCode.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleApprove(requestId: string) {
    if (!user?.id) return
    setActionLoading(requestId)
    try {
      // RPCs not yet in generated types — cast to bypass strict overload checks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase.rpc as any)('officer_approve_upgrade', {
        p_request_id: requestId,
        p_reviewer_id: user.id,
      }) as { data: { success: boolean; error?: string } | null; error: { message: string } | null }
      if (rpcError || !data?.success) {
        alert(data?.error ?? rpcError?.message ?? 'Failed to approve')
        return
      }
      // Optimistic: remove from pending, reload co-organizers list
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId))
      if (user.chapter_id) {
        const { data: fresh } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, created_at')
          .eq('chapter_id', user.chapter_id)
          .eq('role', 'chapter_officer')
          .neq('id', user.id)
          .order('created_at', { ascending: false })
        if (fresh) setCoOrganizers(fresh)
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(requestId: string) {
    if (!user?.id) return
    setActionLoading(requestId)
    try {
      const { error: rpcError } = await supabase.rpc('reject_organizer_upgrade', {
        p_request_id: requestId,
        p_user_id: user.id,
      })
      if (rpcError) {
        alert(rpcError.message)
        return
      }
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRemove(targetId: string) {
    if (!user?.id) return
    setActionLoading(targetId)
    setConfirmRemoveId(null)
    try {
      // RPC not yet in generated types — cast to bypass strict overload checks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase.rpc as any)('officer_demote_coorganizer', {
        p_target_id: targetId,
        p_officer_id: user.id,
      }) as { data: { success: boolean; error?: string } | null; error: { message: string } | null }
      if (rpcError || !data?.success) {
        alert(data?.error ?? rpcError?.message ?? 'Failed to remove')
        return
      }
      setCoOrganizers((prev) => prev.filter((c) => c.id !== targetId))
    } finally {
      setActionLoading(null)
    }
  }

  if (!orgUser) return null

  return (
    <div className="bg-slate-50 min-h-screen">
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-[#1152d4] relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Icons */}
          <div className="relative z-10 px-4 pb-4 flex items-center gap-3">
            <button
              onClick={() => navigate('/organizer/profile')}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >
              <ArrowLeftOutline className="w-5 h-5" color="white" />
            </button>
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              Co-Organizers
            </h1>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4 pb-24">

        {error && (
          <div className="bg-red/10 border border-red/20 rounded-2xl px-4 py-3 text-md3-body-md text-red font-medium">
            {error}
          </div>
        )}

        {/* Zone 1 — Chapter Invite Code */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-card">
          <p className="text-md3-label-md font-semibold text-slate-400 uppercase tracking-wide mb-3">
            Chapter Invite Code
          </p>
          {loading ? (
            <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
          ) : chapterCode ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-md3-headline-sm font-black text-slate-900 tracking-widest">
                  {chapterCode.code}
                </span>
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 text-md3-label-md font-bold px-3 py-1.5 rounded-xl transition-colors ${
                    copied
                      ? 'bg-green/10 text-green'
                      : 'bg-blue/10 text-blue hover:bg-blue/20'
                  }`}
                >
                  {copied ? (
                    <><CheckCircleOutline className="w-3.5 h-3.5" /> Copied!</>
                  ) : (
                    <><CopyOutline className="w-3.5 h-3.5" /> Copy</>
                  )}
                </button>
              </div>
              <p className="text-md3-label-md text-slate-400 mt-2">
                Share this with members in your chapter to invite them as co-organizers.
              </p>
            </>
          ) : (
            <p className="text-md3-body-md text-slate-400">
              No active invite code found. Contact HQ admin to generate one.
            </p>
          )}
        </div>

        {/* Zone 2 — Pending Approvals */}
        {(loading || pendingRequests.length > 0) && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <p className="text-md3-body-md font-bold text-slate-900">Awaiting Approval</p>
              {!loading && (
                <span className="text-md3-label-md font-bold bg-gold/10 text-gold px-2 py-0.5 rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-card">
              {loading ? (
                <div className="space-y-px">
                  {[0, 1].map((i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-slate-100 rounded animate-pulse w-32" />
                        <div className="h-2.5 bg-slate-100 rounded animate-pulse w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="divide-y divide-slate-50"
                >
                  {pendingRequests.map((req) => {
                    const profile = req.profiles
                    const name = profile?.full_name ?? 'Unknown'
                    const isProcessing = actionLoading === req.id
                    return (
                      <motion.div
                        key={req.id}
                        variants={cardItem}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-md3-label-md font-black text-blue">{getInitials(name)}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-md3-body-md font-semibold text-slate-900 truncate">{name}</p>
                          <p className="text-md3-label-md text-slate-400 truncate">{profile?.email}</p>
                          <p className="text-[10px] text-slate-300 mt-0.5">
                            {formatDate.short(req.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => void handleApprove(req.id)}
                            disabled={isProcessing}
                            className="text-md3-label-md font-bold bg-primary text-white px-3 py-1.5 rounded-xl disabled:opacity-50 transition-opacity"
                          >
                            {isProcessing ? '…' : 'Approve'}
                          </button>
                          <button
                            onClick={() => void handleReject(req.id)}
                            disabled={isProcessing}
                            className="text-md3-label-md font-bold text-red-500 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* Zone 3 — Active Co-Organizers */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-1">
            <p className="text-md3-body-md font-bold text-slate-900">Chapter Officers</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-card">
            {loading ? (
              <div className="space-y-px">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-32" />
                      <div className="h-2.5 bg-slate-100 rounded animate-pulse w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : coOrganizers.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <UsersGroupRoundedOutline className="w-6 h-6" color="#CBD5E1" />
                </div>
                <p className="text-md3-body-md font-semibold text-slate-500">No co-organizers yet</p>
                <p className="text-md3-label-md text-slate-400 mt-1 text-center">
                  Share your code above to invite members as co-organizers.
                </p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="divide-y divide-slate-50"
              >
                {coOrganizers.map((coOrg) => {
                  const isRemoving = actionLoading === coOrg.id
                  const isConfirming = confirmRemoveId === coOrg.id
                  return (
                    <motion.div key={coOrg.id} variants={cardItem} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {coOrg.avatar_url ? (
                            <img src={coOrg.avatar_url} alt={coOrg.full_name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-md3-label-md font-black text-blue">{getInitials(coOrg.full_name)}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-md3-body-md font-semibold text-slate-900 truncate">{coOrg.full_name}</p>
                          <p className="text-md3-label-md text-slate-400 truncate">{coOrg.email}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <ClockCircleOutline className="w-2.5 h-2.5" color="#CBD5E1" />
                            <p className="text-[10px] text-slate-300">
                              Officer since {formatDate.short(coOrg.created_at ?? '')}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setConfirmRemoveId(isConfirming ? null : coOrg.id)}
                          disabled={isRemoving}
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <TrashBinTrashOutline className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Inline confirm row */}
                      <AnimatePresence>
                        {isConfirming && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 ml-13 flex items-center gap-2 pl-[52px]">
                              <p className="text-md3-label-md text-slate-500 flex-1">
                                Remove <span className="font-semibold">{coOrg.full_name}</span> as co-organizer?
                              </p>
                              <button
                                onClick={() => setConfirmRemoveId(null)}
                                className="text-md3-label-md font-semibold text-slate-400 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => void handleRemove(coOrg.id)}
                                className="text-md3-label-md font-bold text-white bg-red-500 px-3 py-1.5 rounded-xl"
                              >
                                Remove
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </motion.div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
