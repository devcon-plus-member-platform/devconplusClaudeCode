import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { z } from 'zod'
import {
  AddCircleOutline, PenOutline, TrashBinTrashOutline, GiftOutline,
  GalleryAddOutline, CloseCircleLineDuotone, CheckCircleOutline, MagniferOutline,
} from 'solar-icon-set'
import type { Reward } from '@devcon-plus/supabase'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { useRewardsStore } from '../../stores/useRewardsStore'
import type { RewardRedemptionWithDetails } from '../../stores/useRewardsStore'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import ConfirmDialog from '../../components/ConfirmDialog'
import { INPUT_CLS, LABEL_CLS, SlideOver, ConfirmDelete, ToggleRow } from './cmsPrimitives'
import { formatDate, toDatetimeLocalValue, fromDatetimeLocalValue } from '../../lib/dates'

// ── Validation (mirrors the reward DTO on the gateway) ───────────────────────

const rewardSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be under 100 characters'),
  description: z.string().max(1000, 'Description must be under 1000 characters').optional().or(z.literal('')),
  points_cost: z.number({ coerce: true }).int().min(1, 'Points cost must be at least 1').max(100000, 'Points cost cannot exceed 100,000'),
  type: z.enum(['physical', 'digital']),
  claim_method: z.enum(['onsite', 'digital_delivery']),
  stock_remaining: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0, 'Stock cannot be negative').max(100000).nullable()
  ),
  max_per_user: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1, 'Max per user must be at least 1').max(1000).nullable()
  ),
  is_active: z.boolean(),
  is_coming_soon: z.boolean(),
  // ISO timestamp or null. Computed in handleSave from hasDeadline + the
  // datetime-local input, so it's validated as an already-resolved value.
  deadline: z.string().datetime().nullable(),
})

// ── Form state ────────────────────────────────────────────────────────────────

interface RewardFormState {
  name: string
  description: string
  points_cost: string
  type: 'physical' | 'digital'
  claim_method: 'onsite' | 'digital_delivery'
  stock_remaining: string
  max_per_user: string
  is_active: boolean
  is_coming_soon: boolean
  hasDeadline: boolean
  deadline: string // datetime-local value ('' when none)
}

const defaultRewardForm = (): RewardFormState => ({
  name: '',
  description: '',
  points_cost: '',
  type: 'physical',
  claim_method: 'onsite',
  stock_remaining: '',
  max_per_user: '',
  is_active: true,
  is_coming_soon: true,
  hasDeadline: false,
  deadline: '',
})

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

// ── Claim status pill config ──────────────────────────────────────────────────

const CLAIM_PILLS = {
  pending:   { cls: 'bg-amber-100 text-amber-700', label: 'Pending'  },
  claimed:   { cls: 'bg-green/10 text-green',      label: 'Verified' },
  cancelled: { cls: 'bg-red/10 text-red',          label: 'Refunded' },
} as const

function ClaimStatusPill({ status }: { status: string }) {
  const pill = CLAIM_PILLS[status as keyof typeof CLAIM_PILLS] ?? CLAIM_PILLS.pending
  return (
    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${pill.cls}`}>
      {pill.label}
    </span>
  )
}

// ── Claim row ─────────────────────────────────────────────────────────────────

interface ClaimRowProps {
  claim: RewardRedemptionWithDetails
  onApprove: (id: string) => void
  onRefund: (id: string) => void
  actionLoadingId: string | null
  isHighlighted?: boolean
}

function ClaimRow({ claim, onApprove, onRefund, actionLoadingId, isHighlighted = false }: ClaimRowProps) {
  const isPending = claim.status === 'pending'
  const isLoading = actionLoadingId === claim.id

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-white border rounded-xl px-4 py-3 shadow-card ${
        isHighlighted ? 'border-blue' : 'border-slate-100'
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="size-10 bg-slate-100 rounded-lg overflow-hidden shrink-0">
          {claim.reward_image_url ? (
            <img src={claim.reward_image_url} alt={claim.reward_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-blue">
              <GiftOutline className="w-5 h-5" color="white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-md3-body-md font-semibold text-slate-900 truncate">{claim.member_name}</span>
            <ClaimStatusPill status={claim.status ?? 'pending'} />
          </div>
          <p className="text-md3-label-md text-slate-400 truncate">
            {claim.reward_name} · {claim.member_email}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {claim.reward_points_cost.toLocaleString()} pts ·{' '}
            {new Date(claim.redeemed_at ?? '').toLocaleDateString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            {claim.claim_pin != null && isPending && (
              <span className="font-bold text-blue tracking-widest"> · PIN {claim.claim_pin}</span>
            )}
          </p>
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onRefund(claim.id)}
            disabled={isLoading}
            className="px-3 py-1.5 text-md3-label-md font-bold rounded-lg border border-slate-200 text-slate-500 hover:bg-red/5 hover:border-red hover:text-red transition-colors disabled:opacity-50"
          >
            Refund
          </button>
          <button
            onClick={() => onApprove(claim.id)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-md3-label-md font-bold rounded-lg bg-blue text-white hover:bg-blue-dark transition-colors disabled:opacity-50"
          >
            <CheckCircleOutline className="w-3.5 h-3.5" color="white" />
            {isLoading ? 'Processing…' : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminRewards() {
  const { user } = useAuthStore()
  const {
    allRewards, isLoadingAll, fetchAllRewards,
    createReward, updateReward, deleteReward,
    allRedemptions, isLoadingClaims, fetchAllRedemptions,
    approveClaim, refundClaim,
    unseenClaimCount, markClaimsAsSeen,
  } = useRewardsStore()

  const [subTab, setSubTab] = useState<'catalog' | 'claims'>('catalog')

  // ── Catalog state ─────────────────────────────────────────────────────────
  const [slideOver, setSlideOver] = useState<'create' | 'edit' | null>(null)
  const [editingItem, setEditingItem] = useState<Reward | null>(null)
  const [form, setForm] = useState<RewardFormState>(defaultRewardForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  // Catalog search (name / type / claim method — carried over from the old CMS tab)
  const [catalogSearch, setCatalogSearch] = useState('')

  // ── Claims state ──────────────────────────────────────────────────────────
  const [pinSearch, setPinSearch] = useState('')
  const [refundTargetId, setRefundTargetId] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [claimsError, setClaimsError] = useState<string | null>(null)

  const visibleRewards = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase()
    if (!q) return allRewards
    return allRewards.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q) ||
      r.claim_method.toLowerCase().includes(q),
    )
  }, [allRewards, catalogSearch])

  const { pageItems: rewardItems, ...rewardPagination } = usePagination(visibleRewards, 10)

  useEffect(() => {
    void fetchAllRewards()
    void fetchAllRedemptions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (subTab === 'claims') markClaimsAsSeen()
  }, [subTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Catalog handlers ──────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingItem(null)
    setForm(defaultRewardForm())
    setCoverFile(null)
    setCoverPreview(null)
    setFormError(null)
    setSlideOver('create')
  }

  const openEdit = (r: Reward) => {
    setEditingItem(r)
    setForm({
      name: r.name,
      description: r.description ?? '',
      points_cost: String(r.points_cost),
      type: r.type,
      claim_method: r.claim_method,
      stock_remaining: r.stock_remaining != null ? String(r.stock_remaining) : '',
      max_per_user: r.max_per_user != null ? String(r.max_per_user) : '',
      is_active: r.is_active,
      is_coming_soon: r.is_coming_soon,
      hasDeadline: r.deadline != null,
      deadline: toDatetimeLocalValue(r.deadline),
    })
    setCoverFile(null)
    setCoverPreview(r.image_url)
    setFormError(null)
    setSlideOver('edit')
  }

  const f = (key: keyof RewardFormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }))

  // Digital rewards always deliver digitally — mirror the old organizer form rule.
  const setType = (type: 'physical' | 'digital') =>
    setForm((p) => ({ ...p, type, claim_method: type === 'digital' ? 'digital_delivery' : 'onsite' }))

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFormError('Only JPG, PNG, or WebP images are allowed.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setFormError('Image must be under 5 MB.')
      return
    }
    setCoverFile(file)
    setFormError(null)
    setCoverPreview(URL.createObjectURL(file))
  }

  const removeCover = () => {
    setCoverFile(null)
    setCoverPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    setFormError(null)

    // Resolve the optional deadline: only when the toggle is on. Reject an
    // empty or already-past date so admins don't silently create a reward that
    // is dead on arrival.
    let deadline: string | null = null
    if (form.hasDeadline) {
      deadline = fromDatetimeLocalValue(form.deadline)
      if (!deadline) {
        setFormError('Please set a deadline date, or turn off "Has a deadline".')
        return
      }
      if (new Date(deadline).getTime() <= Date.now()) {
        setFormError('The deadline must be in the future.')
        return
      }
    }

    const parsed = rewardSchema.safeParse({
      name: form.name.trim(),
      description: form.description.trim(),
      points_cost: form.points_cost,
      type: form.type,
      claim_method: form.claim_method,
      stock_remaining: form.stock_remaining,
      max_per_user: form.max_per_user,
      is_active: form.is_active,
      is_coming_soon: form.is_coming_soon,
      deadline,
    })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Please check the form fields.')
      return
    }

    setSaving(true)
    // Keep the existing URL when the preview is untouched; clear it when removed.
    let imageUrl: string | null =
      coverPreview && !coverFile ? (editingItem?.image_url ?? null) : null

    try {
      if (coverFile) {
        if (!user?.id) {
          setFormError('Session expired. Please sign in again.')
          return
        }
        const safeName = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
        const path = `${user.id}/${Date.now()}-${safeName}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('reward-images')
          .upload(path, coverFile)
        if (uploadError) {
          setFormError('Image upload failed. Please try again or remove the image.')
          return
        }
        const { data: urlData } = supabase.storage
          .from('reward-images')
          .getPublicUrl(uploadData.path)
        imageUrl = urlData.publicUrl
      }

      if (slideOver === 'edit' && editingItem) {
        await updateReward(editingItem.id, parsed.data, imageUrl)
      } else {
        await createReward(parsed.data, imageUrl)
      }
      setSlideOver(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save reward.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setCatalogError(null)
    try {
      await deleteReward(id)
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Delete failed.')
    }
    setConfirmDeleteId(null)
  }

  // ── Claims handlers ───────────────────────────────────────────────────────

  const handleApprove = async (claimId: string) => {
    setActionLoadingId(claimId)
    setClaimsError(null)
    const result = await approveClaim(claimId)
    if (!result.success) setClaimsError(result.error ?? 'Failed to approve claim.')
    setActionLoadingId(null)
  }

  const handleRefundConfirm = async () => {
    if (!refundTargetId) return
    setActionLoadingId(refundTargetId)
    setClaimsError(null)
    const result = await refundClaim(refundTargetId)
    if (!result.success) setClaimsError(result.error ?? 'Failed to refund claim.')
    setActionLoadingId(null)
    setRefundTargetId(null)
  }

  const pendingClaims = useMemo(
    () => allRedemptions.filter((r) => r.status === 'pending'),
    [allRedemptions]
  )
  const resolvedClaims = useMemo(
    () => allRedemptions.filter((r) => r.status !== 'pending'),
    [allRedemptions]
  )
  const { pageItems: resolvedItems, ...resolvedPagination } = usePagination(resolvedClaims, 10)

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
    <div className="p-4 md:p-8 h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-md3-title-lg font-bold text-slate-900">Rewards</h2>
          <p className="text-md3-body-md text-slate-500 mt-0.5">Manage the rewards catalog and verify member claims</p>
        </div>
        {subTab === 'catalog' && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
          >
            <AddCircleOutline className="w-4 h-4" />
            Add Reward
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {(['catalog', 'claims'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`relative px-4 py-1.5 rounded-full text-md3-body-md font-semibold transition-colors ${
              subTab === t ? 'bg-blue text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {t === 'catalog' ? 'Catalog' : 'Claims'}
            {t === 'claims' && unseenClaimCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unseenClaimCount > 9 ? '9+' : unseenClaimCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Catalog tab ── */}
      {subTab === 'catalog' && (
        <>
          {catalogError && <p className="text-md3-body-md text-red mb-4">{catalogError}</p>}

          {isLoadingAll && allRewards.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : allRewards.length === 0 ? (
            <p className="text-md3-body-md text-slate-400 text-center py-12">No rewards yet. Add one to get started.</p>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="relative mb-4 shrink-0">
                <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  placeholder="Search by name, type, or claim method…"
                  value={catalogSearch}
                  onChange={(e) => { setCatalogSearch(e.target.value); rewardPagination.setPage(1) }}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
                />
              </div>
              {visibleRewards.length === 0 && (
                <p className="text-md3-body-md text-slate-400 text-center py-12">
                  No rewards match "{catalogSearch.trim()}".
                </p>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {rewardItems.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-card">
                    <div className="size-12 bg-slate-100 rounded-lg overflow-hidden shrink-0">
                      {r.image_url ? (
                        <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue">
                          <GiftOutline className="w-5 h-5" color="white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-md3-body-md font-semibold text-slate-900 truncate">{r.name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">
                          {r.type}
                        </span>
                        {(() => {
                          // A reward is effectively inactive once its deadline passes,
                          // even before the cron job flips is_active in the DB.
                          const pastDeadline = r.deadline != null && new Date(r.deadline).getTime() < Date.now()
                          const active = r.is_active && !pastDeadline
                          return (
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              active ? 'bg-green/10 text-green' : 'bg-slate-100 text-slate-400'
                            }`}>
                              {active ? 'Active' : 'Inactive'}
                            </span>
                          )
                        })()}
                        {r.is_coming_soon && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Coming Soon
                          </span>
                        )}
                      </div>
                      <p className="text-md3-label-md text-slate-400 mt-0.5">
                        {r.points_cost.toLocaleString()} pts
                        {r.stock_remaining != null && ` · ${r.stock_remaining} in stock`}
                        {r.max_per_user != null && ` · max ${r.max_per_user}/user`}
                        {r.deadline && ` · until ${formatDate.dateTime(r.deadline)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                        <PenOutline className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDeleteId(r.id)} className="p-1.5 rounded-lg hover:bg-red/10 text-slate-400 hover:text-red">
                        <TrashBinTrashOutline className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination controller={rewardPagination} itemLabel="reward" className="shrink-0" />
            </div>
          )}
        </>
      )}

      {/* ── Claims tab ── */}
      {subTab === 'claims' && (
        <>
          {claimsError && <p className="text-md3-body-md text-red mb-4">{claimsError}</p>}

          {/* PIN search */}
          <div className="relative max-w-sm mb-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pinSearch}
              onChange={(e) => setPinSearch(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 6-digit claim PIN…"
              className={INPUT_CLS}
            />
            {pinSearch && (
              <button
                onClick={() => setPinSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                aria-label="Clear PIN search"
              >
                <CloseCircleLineDuotone color="#94A3B8" width={16} height={16} />
              </button>
            )}
          </div>

          {isLoadingClaims && allRedemptions.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : allRedemptions.length === 0 ? (
            <p className="text-md3-body-md text-slate-400 text-center py-12">
              No claims yet. When members redeem rewards, they'll appear here.
            </p>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
                {pendingClaims.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Pending · {pendingClaims.length}
                    </p>
                    <div className="space-y-2">
                      {pendingClaims.map((claim) => (
                        <ClaimRow
                          key={claim.id}
                          claim={claim}
                          onApprove={(id) => { void handleApprove(id) }}
                          onRefund={(id) => setRefundTargetId(id)}
                          actionLoadingId={actionLoadingId}
                          isHighlighted={matchedClaimId === claim.id}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {resolvedClaims.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Resolved · {resolvedClaims.length}
                    </p>
                    <div className="space-y-2">
                      {resolvedItems.map((claim) => (
                        <ClaimRow
                          key={claim.id}
                          claim={claim}
                          onApprove={() => {}}
                          onRefund={() => {}}
                          actionLoadingId={null}
                        />
                      ))}
                    </div>
                    <Pagination controller={resolvedPagination} itemLabel="claim" className="shrink-0" />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* SlideOver: Create / Edit reward */}
      {slideOver && (
        <SlideOver
          title={slideOver === 'create' ? 'New Reward' : 'Edit Reward'}
          onClose={() => setSlideOver(null)}
          onSubmit={() => void handleSave()}
          saving={saving}
        >
          <div>
            <label className={LABEL_CLS}>Name</label>
            <input className={INPUT_CLS} value={form.name} onChange={f('name')} placeholder="e.g. DEVCON Cap" required />
          </div>
          <div>
            <label className={LABEL_CLS}>Description (optional)</label>
            <textarea className={INPUT_CLS} rows={3} value={form.description} onChange={f('description')} placeholder="Brief description of this reward" />
          </div>
          <div>
            <label className={LABEL_CLS}>Points Cost</label>
            <input className={INPUT_CLS} type="number" min="1" value={form.points_cost} onChange={f('points_cost')} placeholder="e.g. 500" required />
          </div>

          {/* Image */}
          <div>
            <label className={LABEL_CLS}>Image (optional)</label>
            {coverPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200">
                <img src={coverPreview} alt="Reward preview" className="w-full h-36 object-cover" />
                <button
                  type="button"
                  onClick={removeCover}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/60 flex items-center justify-center"
                  aria-label="Remove image"
                >
                  <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-28 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:border-blue hover:text-blue transition-colors"
              >
                <GalleryAddOutline className="w-5 h-5" />
                <span className="text-md3-label-md font-medium">Upload image</span>
                <span className="text-[10px] text-slate-300">JPG, PNG, WebP — max 5 MB</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Type</label>
              <select className={INPUT_CLS} value={form.type} onChange={(e) => setType(e.target.value as 'physical' | 'digital')}>
                <option value="physical">Physical</option>
                <option value="digital">Digital</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Claim Method</label>
              <select
                className={INPUT_CLS}
                value={form.claim_method}
                onChange={f('claim_method')}
                disabled={form.type === 'digital'}
              >
                <option value="onsite">On-site</option>
                <option value="digital_delivery">Digital Delivery</option>
              </select>
              {form.type === 'digital' && (
                <p className="text-[10px] text-slate-400 mt-1">Digital rewards always use Digital Delivery.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Stock (optional)</label>
              <input className={INPUT_CLS} type="number" min="0" value={form.stock_remaining} onChange={f('stock_remaining')} placeholder="Unlimited" />
            </div>
            <div>
              <label className={LABEL_CLS}>Max / User (optional)</label>
              <input className={INPUT_CLS} type="number" min="1" value={form.max_per_user} onChange={f('max_per_user')} placeholder="No limit" />
            </div>
          </div>

          <ToggleRow label="Active (visible in member catalog)" checked={form.is_active} onChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
          <ToggleRow label="Coming Soon (redemption disabled)" checked={form.is_coming_soon} onChange={(v) => setForm((p) => ({ ...p, is_coming_soon: v }))} />

          <ToggleRow
            label="Has a deadline (auto-hides after this date)"
            checked={form.hasDeadline}
            onChange={(v) => setForm((p) => ({ ...p, hasDeadline: v }))}
          />
          {form.hasDeadline && (
            <div>
              <label className={LABEL_CLS}>Available until</label>
              <input
                className={INPUT_CLS}
                type="datetime-local"
                value={form.deadline}
                onChange={f('deadline')}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                The reward is set inactive after this date. Re-activate it manually if you extend the deadline later.
              </p>
            </div>
          )}

          {formError && <p className="text-md3-body-md text-red">{formError}</p>}
        </SlideOver>
      )}

      {confirmDeleteId && (
        <ConfirmDelete
          label="reward"
          onConfirm={() => void handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {refundTarget && (
        <ConfirmDialog
          title="Refund this claim?"
          message={`This will restore ${refundTarget.reward_points_cost.toLocaleString()} pts to ${refundTarget.member_name} and cancel the claim. This cannot be undone.`}
          confirmLabel="Refund"
          tone="danger"
          loading={actionLoadingId === refundTarget.id}
          onConfirm={() => { void handleRefundConfirm() }}
          onCancel={() => setRefundTargetId(null)}
        />
      )}
    </div>
  )
}
