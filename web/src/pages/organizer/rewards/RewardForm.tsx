import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeftOutline, GalleryAddOutline, CloseCircleLineDuotone } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useRewardsStore } from '../../../stores/useRewardsStore'
import { useFormDraft } from '../../../hooks/useFormDraft'
import type { Reward } from '@devcon-plus/supabase'
import {
  schema,
  type RewardFormData,
  inputClass,
  labelClass,
  SectionHeader,
} from './rewardFormConstants'
import { staggerContainer, fadeUp } from '../../../lib/animation'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RewardFormProps {
  /** Present = edit mode; absent = create mode */
  reward?: Reward
  /** Called after a successful save — shell navigates away */
  onSuccess: () => void
  /** Optional content rendered below the submit buttons (e.g. Danger Zone) */
  dangerZone?: React.ReactNode
}

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// ── Component ─────────────────────────────────────────────────────────────────

export function RewardForm({ reward, onSuccess, dangerZone }: RewardFormProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { createReward, updateReward } = useRewardsStore()
  const isEdit = Boolean(reward)

  // ── Draft persistence ────────────────────────────────────────────────────
  const draftKey = isEdit && reward ? `org-reward-edit:${reward.id}` : 'org-reward-create'
  const { draft, saveDraft, clearDraft } = useFormDraft<RewardFormData>(draftKey, 'local')
  const hasDraft = Object.keys(draft).length > 0

  // ── Image state ──────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(
    reward?.image_url ?? null
  )
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Form ─────────────────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RewardFormData>({
    resolver: zodResolver(schema),
    defaultValues: reward
      ? {
          name: hasDraft ? (draft.name as string) ?? reward.name : reward.name,
          description: hasDraft ? (draft.description as string) ?? reward.description ?? '' : reward.description ?? '',
          points_cost: hasDraft ? (draft.points_cost as number) ?? reward.points_cost : reward.points_cost,
          type: hasDraft ? (draft.type as RewardFormData['type']) ?? reward.type : reward.type,
          claim_method: hasDraft ? (draft.claim_method as RewardFormData['claim_method']) ?? reward.claim_method : reward.claim_method,
          stock_remaining: hasDraft ? (draft.stock_remaining as number | undefined) ?? reward.stock_remaining ?? undefined : reward.stock_remaining ?? undefined,
          max_per_user: hasDraft ? (draft.max_per_user as number | undefined) ?? reward.max_per_user ?? undefined : reward.max_per_user ?? undefined,
          is_active: hasDraft ? (draft.is_active as boolean) ?? reward.is_active : reward.is_active,
          is_coming_soon: hasDraft ? (draft.is_coming_soon as boolean) ?? reward.is_coming_soon : reward.is_coming_soon,
        }
      : {
          name: (draft.name as string) ?? '',
          description: (draft.description as string) ?? '',
          points_cost: (draft.points_cost as number) ?? undefined,
          type: (draft.type as RewardFormData['type']) ?? 'physical',
          claim_method: (draft.claim_method as RewardFormData['claim_method']) ?? 'onsite',
          stock_remaining: (draft.stock_remaining as number | undefined) ?? undefined,
          max_per_user: (draft.max_per_user as number | undefined) ?? undefined,
          is_active: (draft.is_active as boolean) ?? true,
          is_coming_soon: (draft.is_coming_soon as boolean) ?? true,
        },
  })

  const watchedType = watch('type')

  // Persist form draft on every field change
  useEffect(() => {
    const { unsubscribe } = watch((values) => {
      saveDraft(values as Partial<RewardFormData>)
    })
    return unsubscribe
  }, [watch, saveDraft])

  // Auto-set claim_method when type changes
  useEffect(() => {
    if (watchedType === 'digital') {
      setValue('claim_method', 'digital_delivery')
    } else {
      setValue('claim_method', 'onsite')
    }
  }, [watchedType, setValue])

  // ── Image handlers ───────────────────────────────────────────────────────
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setCoverUploadError('Only JPG, PNG, or WebP images are allowed.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setCoverUploadError('Image must be under 5 MB.')
      return
    }
    setCoverFile(file)
    setCoverUploadError(null)
    setCoverPreview(URL.createObjectURL(file))
  }

  const removeCover = () => {
    setCoverFile(null)
    setCoverPreview(null)
    setCoverUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const onSubmit = async (data: RewardFormData) => {
    setSubmitError(null)
    setCoverUploadError(null)

    // Resolve final image URL:
    // - coverPreview + no new file → keep existing URL (or null if cleared)
    // - coverPreview + new file → will upload below
    // - no coverPreview → null (cleared or never set)
    let imageUrl: string | null =
      coverPreview && !coverFile ? (reward?.image_url ?? null) : null

    if (coverFile) {
      if (!user?.id) {
        setSubmitError('Session expired. Please sign in again.')
        return
      }
      const safeName = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
      const path = `${user.id}/${Date.now()}-${safeName}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('reward-images')
        .upload(path, coverFile)
      if (uploadError) {
        setCoverUploadError('Image upload failed — reward will be saved without image.')
      } else {
        const { data: urlData } = supabase.storage
          .from('reward-images')
          .getPublicUrl(uploadData.path)
        imageUrl = urlData.publicUrl
      }
    }

    try {
      if (isEdit && reward) {
        await updateReward(reward.id, data, imageUrl)
      } else {
        await createReward(data, imageUrl)
      }
      clearDraft()
      onSuccess()
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save reward. Please try again.'
      )
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Glassmorphism Background ── */}
        <div className="absolute inset-0 backdrop-blur-md bg-slate-50/80 pointer-events-auto -z-10" />

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
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >
              <ArrowLeftOutline className="w-5 h-5" color="white" />
            </button>
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              {isEdit ? 'Edit Reward' : 'Add Reward'}
            </h1>
          </div>
        </div>
      </header>

      <motion.form
        onSubmit={handleSubmit(onSubmit)}
        className="p-4 space-y-5"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* ── DETAILS ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Details" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                Name <span className="text-red normal-case">*</span>
              </label>
              <input
                {...register('name')}
                className={inputClass}
                placeholder="e.g. DEVCON Cap"
              />
              {errors.name && (
                <p className="text-md3-label-md text-red mt-1">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className={labelClass}>
                Description{' '}
                <span className="text-slate-300 normal-case font-normal">optional</span>
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="Brief description of this reward"
              />
            </div>

            <div>
              <label className={labelClass}>
                Points Cost <span className="text-red normal-case">*</span>
              </label>
              <input
                {...register('points_cost')}
                type="number"
                min={1}
                step={1}
                className={inputClass}
                placeholder="e.g. 500"
              />
              {errors.points_cost && (
                <p className="text-md3-label-md text-red mt-1">{errors.points_cost.message}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── IMAGE ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Image" />
          {coverPreview ? (
            <div className="relative rounded-xl overflow-hidden mb-3 border border-slate-200">
              <img
                src={coverPreview}
                alt="Reward preview"
                className="w-full h-44 object-cover"
              />
              <button
                type="button"
                onClick={removeCover}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/60 flex items-center justify-center"
              >
                <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-36 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue hover:text-blue transition-colors mb-3"
            >
              <GalleryAddOutline className="w-6 h-6" />
              <span className="text-md3-label-md font-medium">Tap to upload image</span>
              <span className="text-[10px] text-slate-300">JPG, PNG, WebP — optional</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          {coverUploadError && (
            <p className="text-md3-label-md text-red mt-1">{coverUploadError}</p>
          )}
        </motion.div>

        {/* ── TYPE & CLAIM ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Type & Claim" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                Type <span className="text-red normal-case">*</span>
              </label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                    {(
                      [
                        ['physical', 'Physical'],
                        ['digital', 'Digital'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => field.onChange(value)}
                        className={`flex-1 py-2 text-md3-label-md font-semibold transition-colors ${
                          field.value === value
                            ? 'bg-blue text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>

            <div>
              <label className={labelClass}>
                Claim Method <span className="text-red normal-case">*</span>
              </label>
              <Controller
                control={control}
                name="claim_method"
                render={({ field }) => (
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                    {(
                      [
                        ['onsite', 'On-site'],
                        ['digital_delivery', 'Digital Delivery'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={watchedType === 'digital'}
                        onClick={() => field.onChange(value)}
                        className={`flex-1 py-2 text-md3-label-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          field.value === value
                            ? 'bg-blue text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              />
              {watchedType === 'digital' && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Digital rewards always use Digital Delivery.
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── INVENTORY ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Inventory" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                Stock{' '}
                <span className="text-slate-300 normal-case font-normal">optional</span>
              </label>
              <input
                {...register('stock_remaining')}
                type="number"
                min={0}
                step={1}
                className={inputClass}
                placeholder="Unlimited"
              />
              {errors.stock_remaining && (
                <p className="text-md3-label-md text-red mt-1">{errors.stock_remaining.message}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>
                Max / UserOutline{' '}
                <span className="text-slate-300 normal-case font-normal">optional</span>
              </label>
              <input
                {...register('max_per_user')}
                type="number"
                min={1}
                step={1}
                className={inputClass}
                placeholder="No limit"
              />
              {errors.max_per_user && (
                <p className="text-md3-label-md text-red mt-1">{errors.max_per_user.message}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── VISIBILITY ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Visibility" />
          <div className="space-y-3">
            {(
              [
                {
                  field: 'is_active' as const,
                  label: 'Active',
                  desc: 'Visible in the member rewards catalog',
                },
                {
                  field: 'is_coming_soon' as const,
                  label: 'Coming Soon',
                  desc: 'Shows "Coming Soon" badge — redemption disabled on member side',
                },
              ] as const
            ).map(({ field, label, desc }) => (
              <Controller
                key={field}
                control={control}
                name={field}
                render={({ field: f }) => (
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <input
                      type="checkbox"
                      id={field}
                      checked={f.value}
                      onChange={(e) => f.onChange(e.target.checked)}
                      className="w-4 h-4 accent-blue rounded"
                    />
                    <div>
                      <label
                        htmlFor={field}
                        className="text-md3-body-md font-semibold text-slate-900 cursor-pointer"
                      >
                        {label}
                      </label>
                      <p className="text-md3-label-md text-slate-400 mt-0.5">{desc}</p>
                    </div>
                  </div>
                )}
              />
            ))}
          </div>
        </motion.div>

        {/* Submit error */}
        {submitError && (
          <motion.p
            variants={fadeUp}
            className="text-md3-label-md text-red bg-red/5 border border-red/20 rounded-xl px-3 py-2"
          >
            {submitError}
          </motion.p>
        )}

        {/* Actions */}
        <motion.div variants={fadeUp} className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 border border-slate-200 text-slate-700 text-md3-body-md font-semibold rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors disabled:opacity-60"
          >
            {isSubmitting
              ? isEdit ? 'Saving…' : 'Creating…'
              : isEdit ? 'Save Changes' : 'Add Reward'}
          </button>
        </motion.div>

        {/* Danger zone slot (edit only — passed from RewardEdit) */}
        {dangerZone}
      </motion.form>
    </div>
  )
}
