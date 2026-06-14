import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PenOutline, TrashBinTrashOutline, AddCircleOutline, GiftOutline, BoxOutline, CheckCircleOutline, CloseCircleLineDuotone } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useRewardsStore } from '../../../stores/useRewardsStore'
import type { RewardRedemptionWithDetails } from '../../../stores/useRewardsStore'
import { staggerContainer, cardItem, fadeUp, backdrop, slideUp } from '../../../lib/animation'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// ── RefundConfirmSheet ────────────────────────────────────────────────────────

interface RefundConfirmSheetProps {
  claim: RewardRedemptionWithDetails
  onConfirm: () => Promise<void>
  onClose: () => void
  isLoading: boolean
}

function RefundConfirmSheet({ claim, onConfirm, onClose, isLoading }: RefundConfirmSheetProps) {
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const handleClose = () => {
    if (isLoading) return
    setVisible(false)
    timerRef.current = setTimeout(onClose, 220)
  }

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-[60]"
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-[24px] p-6"
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-proxima font-bold text-slate-900 mb-2">Refund this claim?</h3>
            <p className="text-[14px] text-slate-500 mb-6">
              This will restore{' '}
              <strong className="text-slate-900">{claim.reward_points_cost.toLocaleString()} pts</strong> to{' '}
              <strong className="text-slate-900">{claim.member_name}</strong> and cancel the claim.
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <motion.button
                onClick={handleClose}
                disabled={isLoading}
                className="flex-1 py-3.5 rounded-[14px] border border-slate-200 text-slate-600 text-[15px] font-proxima font-bold disabled:opacity-50"
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                Cancel
              </motion.button>
              <motion.button
                onClick={() => { void onConfirm() }}
                disabled={isLoading}
                className="flex-1 py-3.5 rounded-[14px] bg-red text-white text-[15px] font-proxima font-bold disabled:opacity-60"
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                {isLoading ? 'Refunding...' : 'Yes, Refund'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ── ClaimCard ─────────────────────────────────────────────────────────────────

interface ClaimCardProps {
  claim: RewardRedemptionWithDetails
  onApprove: (id: string) => void
  onRefund: (id: string) => void
  actionLoadingId: string | null
  isHighlighted?: boolean
}

function ClaimCard({ claim, onApprove, onRefund, actionLoadingId, isHighlighted = false }: ClaimCardProps) {
  const initials = claim.member_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const isPending = claim.status === 'pending'
  const isLoading = actionLoadingId === claim.id

  const statusConfig = {
    pending:   { bg: 'bg-amber-50',  text: 'text-amber-700', dot: 'bg-amber-400',  label: 'Pending'  },
    claimed:   { bg: 'bg-green/10',  text: 'text-green',     dot: 'bg-green',      label: 'Verified' },
    cancelled: { bg: 'bg-red/10',    text: 'text-red',       dot: 'bg-red',        label: 'Refunded' },
  } as const
  const pill = statusConfig[claim.status as keyof typeof statusConfig] ?? statusConfig['pending']

  return (
    <motion.div
      variants={cardItem}
      className={`bg-white rounded-[16px] border-2 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] p-4 transition-colors ${
        isHighlighted ? 'border-blue' : 'border-[rgba(156,163,175,0.3)]'
      }`}
    >
      {/* Member row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue/10 flex items-center justify-center text-blue text-md3-body-md font-proxima font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-proxima font-bold text-slate-900 truncate">{claim.member_name}</p>
          <p className="text-[11px] text-slate-400 truncate">{claim.member_email}</p>
        </div>
        {/* Status chip */}
        <div className={`flex items-center gap-1 ${pill.bg} px-2 py-1 rounded-full shrink-0`}>
          <div className={`w-1.5 h-1.5 rounded-full ${pill.dot}`} />
          <p className={`text-[9px] font-proxima font-bold ${pill.text}`}>{pill.label}</p>
        </div>
      </div>

      {/* Reward row */}
      <div className="flex items-center gap-3 bg-slate-50 rounded-[12px] p-3 mb-3">
        <div className="size-[44px] bg-slate-200 rounded-[10px] overflow-hidden shrink-0">
          {claim.reward_image_url ? (
            <img src={claim.reward_image_url} alt={claim.reward_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-blue">
              <GiftOutline className="size-5" color="white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-proxima font-bold text-slate-900 truncate">{claim.reward_name}</p>
          <p className="text-[11px] text-slate-400">
            {new Date(claim.redeemed_at ?? '').toLocaleDateString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[13px] font-proxima font-bold text-slate-900">{claim.reward_points_cost.toLocaleString()} pts</p>
          {claim.claim_pin != null && isPending && (
            <p className="text-[10px] font-proxima font-black text-blue tracking-widest">PIN {claim.claim_pin}</p>
          )}
        </div>
      </div>

      {/* Actions — pending only */}
      {isPending && (
        <div className="flex gap-2">
          <motion.button
            onClick={() => onRefund(claim.id)}
            disabled={isLoading}
            className="flex-1 py-2.5 text-[13px] font-proxima font-bold rounded-[12px] border border-slate-200 text-slate-500 hover:bg-red/5 hover:border-red hover:text-red transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <CloseCircleLineDuotone className="w-3.5 h-3.5" color="#EF4444" />
            Refund
          </motion.button>
          <motion.button
            onClick={() => onApprove(claim.id)}
            disabled={isLoading}
            className="flex-1 py-2.5 text-[13px] font-proxima font-bold rounded-[12px] bg-blue text-white hover:bg-blue-dark transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <CheckCircleOutline color="white" size={14} />
            {isLoading ? 'Processing...' : 'Approve'}
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}

// ── TabButton ─────────────────────────────────────────────────────────────────

type TabId = 'rewards' | 'claims'

function TabButton({
  id, label, activeTab, onSelect, badge,
}: {
  id: TabId
  label: string
  activeTab: TabId
  onSelect: (t: TabId) => void
  badge?: number
}) {
  const isActive = activeTab === id
  return (
    <button
      onClick={() => onSelect(id)}
      className={`flex-1 h-[32px] flex items-center justify-center rounded-[128px] text-[14px] font-proxima font-bold transition-all relative ${
        isActive ? 'bg-blue text-white shadow-sm' : 'bg-blue/10 text-blue'
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function OrgRewardsManagement() {
  const navigate = useNavigate()
  const {
    allRewards, isLoadingAll, fetchAllRewards, deleteReward,
    allRedemptions, isLoadingClaims, fetchAllRedemptions,
    approveClaim, refundClaim,
    unseenClaimCount, markClaimsAsSeen,
  } = useRewardsStore()

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<TabId>('rewards')
  const [pinSearch, setPinSearch] = useState('')
  const [refundTargetId, setRefundTargetId] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    void fetchAllRewards()
    void fetchAllRedemptions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'claims') markClaimsAsSeen()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteReward(id)
      setDeleteConfirmId(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleApprove = async (claimId: string) => {
    setActionLoadingId(claimId)
    setActionError(null)
    try {
      const result = await approveClaim(claimId)
      if (!result.success) setActionError(result.error ?? 'Failed to approve')
    } catch {
      setActionError('Failed to approve')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleRefundConfirm = async () => {
    if (!refundTargetId) return
    setActionLoadingId(refundTargetId)
    setActionError(null)
    try {
      const result = await refundClaim(refundTargetId)
      if (!result.success) setActionError(result.error ?? 'Failed to refund')
    } catch {
      setActionError('Failed to refund')
    } finally {
      setActionLoadingId(null)
      setRefundTargetId(null)
    }
  }

  const activeCount = useMemo(
    () => allRewards.filter((r) => r.is_active).length,
    [allRewards]
  )
  const pendingClaims = useMemo(
    () => allRedemptions.filter((r) => r.status === 'pending'),
    [allRedemptions]
  )
  const resolvedClaims = useMemo(
    () => allRedemptions.filter((r) => r.status !== 'pending'),
    [allRedemptions]
  )
  const refundTarget = useMemo(
    () => allRedemptions.find((r) => r.id === refundTargetId) ?? null,
    [allRedemptions, refundTargetId]
  )

  const searchTrimmed = pinSearch.trim()
  const matchedClaimId = useMemo(() => {
    if (searchTrimmed.length !== 6) return null
    return pendingClaims.find((r) => r.claim_pin === searchTrimmed)?.id ?? null
  }, [searchTrimmed, pendingClaims])

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Glassmorphism Background ── */}
        <div className="absolute inset-0 backdrop-blur-md bg-slate-50/80 pointer-events-auto -z-10" />

        {/* ── Blue Background Container ── */}
        <div
          className="bg-blue relative z-0 pointer-events-auto pb-[64px]"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat',
          }}
        >
          {/* Header Row: Title + Icons */}
          <div className="relative z-10 flex items-center justify-between px-4 pt-6">
            <h1 className="text-white text-[28px] font-semibold font-proxima leading-none tracking-tight">
              Rewards
            </h1>

            {activeTab === 'rewards' && (
              <button
                onClick={() => navigate('/organizer/rewards/create')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white/20 backdrop-blur-md border border-white/40 text-white text-md3-body-md font-bold font-proxima rounded-full active:bg-white/40 transition-colors shadow-lg shrink-0"
              >
                <AddCircleOutline className="w-[18px] h-[18px]" color="white" />
                Add Reward
              </button>
            )}
          </div>
        </div>

        {/* ── Stats Card Overlay ── */}
        <div className="relative z-10 flex flex-col px-4 -mt-[40px] pointer-events-none">
          <div className="bg-white rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] border border-slate-400/30 h-[100px] flex items-center pointer-events-auto">
            {/* Total */}
            <div className="flex-1 flex items-center gap-[10px] pl-[20px]">
              <div className="shrink-0 size-[40px] bg-blue/10 rounded-xl flex items-center justify-center">
                <GiftOutline className="size-5" color="#1152d4" />
              </div>
              <div className="flex flex-col justify-center translate-y-px">
                <p className="font-proxima text-slate-500 text-[12px] leading-none mb-[6px] uppercase tracking-wide">
                  Total
                </p>
                <p className="font-proxima font-extrabold text-[24px] text-slate-700 leading-none tracking-tight">
                  {allRewards.length}
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-[50px] bg-slate-100" />

            {/* Active */}
            <div className="flex-1 flex items-center gap-[10px] pl-[20px]">
              <div className="shrink-0 size-[40px] bg-green/10 rounded-xl flex items-center justify-center">
                <BoxOutline className="size-5" color="#21C45D" />
              </div>
              <div className="flex flex-col justify-center translate-y-px">
                <p className="font-proxima text-slate-500 text-[12px] leading-none mb-[6px] uppercase tracking-wide">
                  Active
                </p>
                <p className="font-proxima font-extrabold text-[24px] text-slate-700 leading-none tracking-tight">
                  {activeCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 pb-2 px-4 pointer-events-auto">
          <div className="flex gap-[6px]">
            <TabButton id="rewards" label="Rewards" activeTab={activeTab} onSelect={setActiveTab} />
            <TabButton id="claims" label="Claims" activeTab={activeTab} onSelect={setActiveTab} badge={unseenClaimCount} />
          </div>
        </div>
      </header>

      <motion.div
        className="px-4 pt-4 space-y-4 pb-24 md:max-w-4xl md:mx-auto"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* ── Rewards Tab ── */}
        {activeTab === 'rewards' && (
          <>
            {deleteError && (
              <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">
                {deleteError}
              </p>
            )}

            {isLoadingAll && allRewards.length === 0 ? (
              <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <div className="w-8 h-8 rounded-full border-2 border-blue border-t-transparent animate-spin mx-auto" />
              </motion.div>
            ) : (
              <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
                {allRewards.length === 0 ? (
                  <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <p className="text-md3-body-lg font-bold text-slate-700">No rewards yet</p>
                    <p className="text-md3-body-md text-slate-400 mt-1">Add items to the catalog.</p>
                  </motion.div>
                ) : (
                  allRewards.map((reward) => (
                    <motion.div
                      key={reward.id}
                      variants={cardItem}
                      className="bg-white border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] rounded-[16px] p-3 overflow-hidden"
                    >
                      <div className="flex items-center gap-4">
                        {/* Left Side: Image or Placeholder */}
                        <div className="size-[72px] bg-slate-100 rounded-[12px] overflow-hidden shrink-0 relative">
                          {reward.image_url ? (
                            <img
                              src={reward.image_url}
                              alt={reward.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center bg-blue"
                              style={{
                                backgroundImage: PATTERN_BG,
                                backgroundSize: '40px 40px',
                                backgroundPosition: 'center',
                              }}
                            >
                              <GiftOutline className="size-8" color="white" />
                            </div>
                          )}
                        </div>

                        {/* Right Side: Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <p className="font-proxima font-bold text-[14px] text-slate-900 leading-tight truncate">
                              {reward.name}
                            </p>

                            {/* Action buttons */}
                            {deleteConfirmId !== reward.id && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => navigate(`/organizer/rewards/${reward.id}/edit`)}
                                  className="w-7 h-7 rounded-lg bg-blue/10 flex items-center justify-center active:bg-blue/20 transition-colors"
                                >
                                  <PenOutline className="w-3.5 h-3.5" color="#1152D4" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(reward.id)}
                                  className="w-7 h-7 rounded-lg bg-red/10 flex items-center justify-center active:bg-red/20 transition-colors"
                                >
                                  <TrashBinTrashOutline className="w-3.5 h-3.5" color="#EF4444" />
                                </button>
                              </div>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-500 line-clamp-1 mb-1.5">
                            {reward.description}
                          </p>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] font-bold text-blue bg-blue/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <GiftOutline color="#1152D4" size={10} />
                              {reward.points_cost.toLocaleString()} pts
                            </span>

                            <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                              {reward.claim_method === 'digital_delivery' ? 'Digital' : 'On-site'}
                            </span>

                            {!reward.is_active && (
                              <span className="text-[9px] font-bold text-red/60 bg-red/10 px-2 py-0.5 rounded-full uppercase">
                                Inactive
                              </span>
                            )}

                            {reward.is_coming_soon && (
                              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase">
                                Coming Soon
                              </span>
                            )}
                          </div>

                          {/* Inline delete confirm */}
                          {deleteConfirmId === reward.id && (
                            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                              <p className="text-[10px] text-slate-500">Remove?</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  disabled={isDeleting}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold"
                                >
                                  No
                                </button>
                                <button
                                  onClick={() => void handleDelete(reward.id)}
                                  disabled={isDeleting}
                                  className="px-2.5 py-1 rounded-lg bg-red text-white text-[10px] font-bold"
                                >
                                  {isDeleting ? '...' : 'Yes'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}
          </>
        )}

        {/* ── Claims Tab ── */}
        {activeTab === 'claims' && (
          <>
            {actionError && (
              <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">{actionError}</p>
            )}

            {/* PIN Search */}
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinSearch}
                onChange={(e) => setPinSearch(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit claim PIN..."
                className="w-full h-[44px] bg-white border border-slate-200 rounded-[12px] px-4 pr-10 text-[14px] font-proxima text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue transition-colors"
              />
              {pinSearch && (
                <button
                  onClick={() => setPinSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <CloseCircleLineDuotone color="#94A3B8" size={16} />
                </button>
              )}
            </div>

            {isLoadingClaims && allRedemptions.length === 0 ? (
              <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <div className="w-8 h-8 rounded-full border-2 border-blue border-t-transparent animate-spin mx-auto" />
              </motion.div>
            ) : pendingClaims.length === 0 && resolvedClaims.length === 0 ? (
              <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <p className="text-md3-body-lg font-bold text-slate-700">No claims yet</p>
                <p className="text-md3-body-md text-slate-400 mt-1">When members redeem rewards, they'll appear here.</p>
              </motion.div>
            ) : (
              <>
                {/* Pending section */}
                {pendingClaims.length > 0 && (
                  <div>
                    <p className="text-[11px] font-proxima font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
                      Pending · {pendingClaims.length}
                    </p>
                    <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
                      {pendingClaims.map((claim) => (
                        <ClaimCard
                          key={claim.id}
                          claim={claim}
                          onApprove={(id) => { void handleApprove(id) }}
                          onRefund={(id) => setRefundTargetId(id)}
                          actionLoadingId={actionLoadingId}
                          isHighlighted={matchedClaimId === claim.id}
                        />
                      ))}
                    </motion.div>
                  </div>
                )}

                {/* Resolved section */}
                {resolvedClaims.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-proxima font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
                      Resolved · {resolvedClaims.length}
                    </p>
                    <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
                      {resolvedClaims.map((claim) => (
                        <ClaimCard
                          key={claim.id}
                          claim={claim}
                          onApprove={() => {}}
                          onRefund={() => {}}
                          actionLoadingId={null}
                        />
                      ))}
                    </motion.div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </motion.div>

      {/* ── Refund Confirmation Sheet ── */}
      {refundTargetId !== null && refundTarget !== null && (
        <RefundConfirmSheet
          claim={refundTarget}
          onConfirm={handleRefundConfirm}
          onClose={() => setRefundTargetId(null)}
          isLoading={actionLoadingId === refundTargetId}
        />
      )}
    </div>
  )
}
