import { useRef, useState, useEffect } from 'react'
import { useFormDraft } from '../../../hooks/useFormDraft'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, GalleryAddOutline, CloseCircleLineDuotone } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { fadeUp, staggerContainer } from '../../../lib/animation'
import { useEventsStore } from '../../../stores/useEventsStore'
import { useAuthStore } from '../../../stores/useAuthStore'
import { supabase } from '../../../lib/supabase'
import {
  schema,
  type FormData,
  type CustomFormField,
  inputClass,
  labelClass,
  CATEGORY_OPTIONS,
  DEVCON_PROGRAM_OPTIONS,
  VISIBILITY_OPTIONS,
  ATTENDANCE_PTS,
  DEFAULT_VOLUNTEER_POINTS,
  TAG_MAX_LENGTH,
  SectionHeader,
  CustomFieldsBuilder,
} from './eventFormConstants'
import type { Json } from '@devcon-plus/supabase'
import { MarkdownEditor } from '../../../components/MarkdownEditor'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// ── Component ─────────────────────────────────────────────────────────────────

type EventCreateDraft = FormData & {
  tags: string[]
  visibility: 'public' | 'unlisted' | 'draft'
  customFields: CustomFormField[]
  is_external: boolean
  external_registration_url: string
  url_is_tba: boolean
}

export function OrgEventCreate() {
  const navigate = useNavigate()
  const { createEvent } = useEventsStore()
  const { user, chapterName } = useAuthStore()

  const isAdmin = user?.role === 'hq_admin' || user?.role === 'super_admin'
  const [chapters, setChapters] = useState<Array<{ id: string; name: string; region: string }>>([])

  const { draft, saveDraft, clearDraft } = useFormDraft<EventCreateDraft>(
    'org-event-create',
    'local',
  )

  // Cover image (managed outside RHF)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null)
  // Track the object URL so we can revoke it to prevent memory leaks
  const coverObjectUrlRef = useRef<string | null>(null)

  // Revoke the blob URL when the component unmounts
  useEffect(() => {
    return () => {
      if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current)
    }
  }, [])

  // Tags (managed outside RHF)
  const [tags, setTags] = useState<string[]>((draft.tags as string[]) ?? [])
  const [tagInput, setTagInput] = useState('')

  // Visibility (managed outside RHF for segmented control feel)
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'draft'>(
    (draft.visibility as 'public' | 'unlisted' | 'draft') ?? 'public',
  )

  // Custom registration form fields
  const [customFields, setCustomFields] = useState<CustomFormField[]>(
    (draft.customFields as CustomFormField[]) ?? [],
  )

  // External event
  const [isExternal, setIsExternal] = useState<boolean>(
    (draft.is_external as boolean) ?? false,
  )
  // "tba" sentinel means external but URL not yet known
  const savedUrl = (draft.external_registration_url as string) ?? ''
  const [urlIsTba, setUrlIsTba] = useState<boolean>(savedUrl === 'tba' || savedUrl === '')
  const [externalUrl, setExternalUrl] = useState<string>(
    savedUrl === 'tba' ? '' : savedUrl,
  )
  const [externalUrlError, setExternalUrlError] = useState<string | null>(null)

  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title:             (draft.title             as string)  ?? '',
      description:       (draft.description       as string)  ?? '',
      location:          (draft.location          as string)  ?? '',
      event_date:        (draft.event_date         as string)  ?? '',
      end_date:          (draft.end_date           as string)  ?? '',
      category:          (draft.category           as FormData['category']) ?? undefined,
      devcon_category:   (draft.devcon_category    as FormData['devcon_category']) ?? undefined,
      points_value:      (draft.points_value       as number)  ?? 5,
      volunteer_points:  (draft.volunteer_points   as number)  ?? DEFAULT_VOLUNTEER_POINTS,
      requires_approval: (draft.requires_approval  as boolean) ?? false,
      is_chapter_locked: (draft.is_chapter_locked  as boolean) ?? true,
      is_free:           (draft.is_free            as boolean) ?? true,
      ticket_price_php:  (draft.ticket_price_php   as number)  ?? 0,
      capacity:          (draft.capacity           as number)  ?? undefined,
      chapter_id:        (draft.chapter_id         as string)  ?? (user?.chapter_id ?? ''),
      visibility:        'public',
      tags:              [],
    },
  })

  const isFree     = watch('is_free')
  const category   = watch('category')

  const submitStartRef = useRef<number | null>(null)
  const [submitStalled, setSubmitStalled] = useState(false)
  // SUBMIT_STALL_MS ≈ FETCH_TIMEOUT_MS (15s) × 2 attempts + 5s buffer
  const SUBMIT_STALL_MS = 35_000

  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        isSubmitting &&
        submitStartRef.current !== null &&
        Date.now() - submitStartRef.current > SUBMIT_STALL_MS
      ) {
        setSubmitStalled(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isSubmitting])

  // Auto-set attendance points when the organizer picks a category
  const prevCategoryRef = useRef<string | undefined>(undefined)
  if (category && category !== prevCategoryRef.current) {
    prevCategoryRef.current = category
    setValue('points_value', ATTENDANCE_PTS[category], { shouldValidate: false })
  }

  // Save RHF fields → draft whenever any field changes
  useEffect(() => {
    const { unsubscribe } = watch((values) => {
      saveDraft({ ...(values as Partial<FormData>), tags, visibility, customFields, is_external: isExternal, external_registration_url: urlIsTba ? 'tba' : externalUrl, url_is_tba: urlIsTba })
    })
    return unsubscribe
  }, [watch, saveDraft, tags, visibility, customFields, isExternal, externalUrl, urlIsTba])

  // Save outside-RHF state → draft whenever tags/visibility/customFields/external change
  useEffect(() => {
    saveDraft({ ...getValues(), tags, visibility, customFields, is_external: isExternal, external_registration_url: urlIsTba ? 'tba' : externalUrl, url_is_tba: urlIsTba })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags, visibility, customFields, isExternal, externalUrl, urlIsTba])

  useEffect(() => {
    if (!isAdmin) return
    void supabase
      .from('chapters')
      .select('id, name, region')
      .order('name')
      .then(({ data }) => {
        if (data) setChapters(data as Array<{ id: string; name: string; region: string }>)
      })
  }, [isAdmin])

  // ── Cover image handlers ─────────────────────────────────────────────────

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
    // Revoke previous object URL before creating a new one
    if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current)
    setCoverFile(file)
    setCoverUploadError(null)
    const url = URL.createObjectURL(file)
    coverObjectUrlRef.current = url
    setCoverPreview(url)
  }

  const removeCover = () => {
    if (coverObjectUrlRef.current) {
      URL.revokeObjectURL(coverObjectUrlRef.current)
      coverObjectUrlRef.current = null
    }
    setCoverFile(null)
    setCoverPreview(null)
    setCoverUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── TagOutline handlers ──────────────────────────────────────────────────────────

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const val = tagInput.trim()
      if (val && val.length <= TAG_MAX_LENGTH && !tags.includes(val)) {
        setTags((prev) => [...prev, val])
      }
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const onSubmit = async (data: FormData) => {
    if (!data.devcon_category) {
      setSubmitError('Please select a DEVCON Program.')
      return
    }
    if (!isAdmin && !user?.chapter_id) {
      setSubmitError('Your account is not linked to a chapter. Contact an admin.')
      return
    }
    if (isAdmin && !data.chapter_id) {
      setSubmitError('Please select a chapter or HQ.')
      return
    }
    if (isExternal && !urlIsTba) {
      if (!externalUrl.trim()) {
        setExternalUrlError('Enter a valid URL or switch to TBA.')
        return
      }
      try {
        new URL(externalUrl.trim())
      } catch {
        setExternalUrlError('Please enter a valid URL (e.g. https://example.com).')
        return
      }
    }
    setSubmitError(null)
    setExternalUrlError(null)
    setCoverUploadError(null)
    setSubmitStalled(false)
    submitStartRef.current = Date.now()

    // Upload cover image (non-blocking on failure)
    let cover_image_url: string | null = null
    if (coverFile) {
      const safeName = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
      const path = `${user.id}/${Date.now()}-${safeName}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('event-covers')
        .upload(path, coverFile)
      if (uploadError) {
        setCoverUploadError('Cover image upload failed — event will be saved without image.')
      } else {
        const { data: urlData } = supabase.storage
          .from('event-covers')
          .getPublicUrl(uploadData.path)
        cover_image_url = urlData.publicUrl
      }
    }

    const rawChapterId = isAdmin ? data.chapter_id : (user?.chapter_id ?? '')
    const chapterId = isAdmin && rawChapterId === '__hq__' ? null : rawChapterId
    const isHqEvent = isAdmin && chapterId === null

    try {
      await createEvent({
        title:                       data.title,
        description:                 data.description,
        location:                    data.location,
        event_date:                  data.event_date,
        end_date:                    data.end_date ?? null,
        category:                    data.category,
        devcon_category:             data.devcon_category,
        tags,
        visibility:                  isExternal ? 'public' : visibility,
        is_free:                     isExternal ? true : data.is_free,
        ticket_price_php:            isExternal ? 0 : (data.is_free ? 0 : data.ticket_price_php),
        capacity:                    isExternal ? null : (data.capacity ?? null),
        points_value:                isExternal ? 0 : data.points_value,
        volunteer_points:            isExternal ? 0 : data.volunteer_points,
        requires_approval:           data.requires_approval,
        is_chapter_locked:           isHqEvent ? false : data.is_chapter_locked,
        is_external:                 isExternal,
        external_registration_url:   isExternal ? (urlIsTba ? 'tba' : externalUrl.trim()) : null,
        cover_image_url,
        chapter_id:                  chapterId,
        created_by:                  user.id,
        custom_form_schema:          customFields.length > 0 ? customFields as unknown as Json : null,
      })
      submitStartRef.current = null
      clearDraft()
      navigate('/organizer/events')
    } catch (err) {
      submitStartRef.current = null
      setSubmitError(err instanceof Error ? err.message : 'Failed to create event. Please try again.')
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
              Create Event
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
        {/* ── EVENT DETAILS ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Event Details" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Event Title</label>
              <input
                {...register('title')}
                className={inputClass}
                placeholder="e.g. DEVCON Summit Manila 2026"
              />
              {errors.title && (
                <p className="text-md3-label-md text-red mt-1">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <MarkdownEditor
                    value={field.value}
                    onChange={field.onChange as (value: string) => void}
                    error={errors.description?.message}
                  />
                )}
              />
            </div>
          </div>
        </motion.div>

        {/* ── MEDIA ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Media" />

          {/* Cover image preview */}
          {coverPreview ? (
            <div className="relative rounded-xl overflow-hidden mb-3 border border-slate-200">
              <img
                src={coverPreview}
                alt="Cover preview"
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
              <span className="text-md3-label-md font-medium">Tap to upload cover image</span>
              <span className="text-[10px] text-slate-300">JPG, PNG, WebP — optional</span>
              <span className="text-[10px] text-slate-300">Recommended: 1200 × 675 px (16:9), max 5 MB</span>
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

        {/* ── CATEGORIZATION ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Categorization" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Chapter <span className="text-red normal-case">*</span></label>
              <select
                {...register('chapter_id')}
                disabled={!isAdmin}
                className={`${inputClass} ${!isAdmin ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
              >
                {!isAdmin && (
                  <option value={user?.chapter_id ?? ''}>
                    {chapterName ?? 'Your chapter'}
                  </option>
                )}
                {isAdmin && (
                  <>
                    <option value="">Select chapter…</option>
                    <option value="__hq__">HQ — All Chapters</option>
                    {['Luzon', 'Visayas', 'Mindanao'].map((region) => {
                      const group = chapters
                        .filter((c) => c.region === region)
                        .sort((a, b) => {
                          if (region === 'Luzon') {
                            if (a.name === 'Manila' && b.name !== 'Manila') return -1
                            if (b.name === 'Manila' && a.name !== 'Manila') return 1
                          }
                          return a.name.localeCompare(b.name)
                        })
                      if (!group.length) return null
                      return (
                        <optgroup key={region} label={region}>
                          {group.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </>
                )}
              </select>
              {errors.chapter_id && (
                <p className="text-md3-label-md text-red mt-1">{errors.chapter_id.message}</p>
              )}
              {!isAdmin && (
                <p className="text-md3-label-md text-slate-400 mt-1">
                  Chapter is locked to your organizer profile.
                </p>
              )}
            </div>

            {/* DEVCON Program */}
            <div>
              <label className={labelClass}>
                DEVCON Program <span className="text-red normal-case">*</span>
              </label>
              <Controller
                control={control}
                name="devcon_category"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {DEVCON_PROGRAM_OPTIONS.map((opt) => {
                      const isSelected = field.value === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.onChange(opt.value)}
                          style={isSelected ? { backgroundColor: opt.hex, borderColor: opt.hex } : undefined}
                          className={`px-3 py-1.5 rounded-full text-md3-label-md font-semibold border transition-colors ${
                            isSelected
                              ? opt.darkText ? 'text-slate-900' : 'text-white'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              />
              {errors.devcon_category && (
                <p className="text-md3-label-md text-red mt-1">{errors.devcon_category.message}</p>
              )}
            </div>

            {/* Category radio pills */}
            <div>
              <label className={labelClass}>Category <span className="text-red normal-case">*</span></label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => field.onChange(opt.value)}
                        className={`px-3 py-1.5 rounded-full text-md3-label-md font-semibold border transition-colors ${
                          field.value === opt.value
                            ? 'bg-blue text-white border-blue'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              />
              {errors.category && (
                <p className="text-md3-label-md text-red mt-1">{errors.category.message}</p>
              )}
            </div>

            {/* Tags chip input */}
            <div>
              <label className={labelClass}>Tags <span className="text-slate-300 normal-case font-normal">optional</span></label>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag, press Enter"
                className={inputClass}
                maxLength={TAG_MAX_LENGTH}
              />
              <p className="text-[10px] text-slate-400 mt-1">Max {TAG_MAX_LENGTH} chars per tag.</p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue/10 text-blue text-md3-label-md rounded-full"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTag(t)}
                        className="leading-none hover:text-blue-dark"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── SCHEDULE ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Schedule" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Location</label>
              <input
                {...register('location')}
                className={inputClass}
                placeholder="Venue or Online"
              />
              {errors.location && (
                <p className="text-md3-label-md text-red mt-1">{errors.location.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start Date & Time</label>
                <input
                  {...register('event_date')}
                  type="datetime-local"
                  className={inputClass}
                />
                {errors.event_date && (
                  <p className="text-md3-label-md text-red mt-1">{errors.event_date.message}</p>
                )}
              </div>

              <div>
                <label className={labelClass}>End Date & Time</label>
                <input
                  {...register('end_date')}
                  type="datetime-local"
                  className={inputClass}
                />
                {errors.end_date && (
                  <p className="text-md3-label-md text-red mt-1">{errors.end_date.message}</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── ACCESS SETTINGS ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Access Settings" />
          <div className="space-y-4">

            {/* External event toggle */}
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
              <input
                type="checkbox"
                id="is_external"
                checked={isExternal}
                onChange={(e) => {
                  setIsExternal(e.target.checked)
                  if (!e.target.checked) {
                    setExternalUrl('')
                    setExternalUrlError(null)
                  }
                }}
                className="w-4 h-4 accent-blue rounded"
              />
              <div>
                <label
                  htmlFor="is_external"
                  className="text-md3-body-md font-semibold text-slate-900 cursor-pointer"
                >
                  External Registration
                </label>
                <p className="text-md3-label-md text-slate-400 mt-0.5">
                  Members will be redirected to an external site to register. Ticket price, capacity, and XP are managed there.
                </p>
              </div>
            </div>

            {/* External URL — TBA toggle + URL input */}
            {isExternal && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Registration URL</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { setUrlIsTba(true); setExternalUrl(''); setExternalUrlError(null) }}
                      className={`flex-1 py-2 rounded-xl text-md3-label-md font-semibold border transition-colors ${
                        urlIsTba
                          ? 'bg-blue text-white border-blue'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'
                      }`}
                    >
                      TBA
                    </button>
                    <button
                      type="button"
                      onClick={() => setUrlIsTba(false)}
                      className={`flex-1 py-2 rounded-xl text-md3-label-md font-semibold border transition-colors ${
                        !urlIsTba
                          ? 'bg-blue text-white border-blue'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'
                      }`}
                    >
                      Has URL
                    </button>
                  </div>
                </div>

                {urlIsTba ? (
                  <p className="text-md3-label-md text-slate-400">
                    Members will see a "Coming Soon" button until you add the registration link.
                  </p>
                ) : (
                  <div>
                    <input
                      type="url"
                      value={externalUrl}
                      onChange={(e) => {
                        setExternalUrl(e.target.value)
                        if (externalUrlError) setExternalUrlError(null)
                      }}
                      className={inputClass}
                      placeholder="https://example.com/register"
                    />
                    {externalUrlError && (
                      <p className="text-md3-label-md text-red mt-1">{externalUrlError}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Visibility segmented control — hidden for external events */}
            {!isExternal && (
              <div>
                <label className={labelClass}>Visibility</label>
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVisibility(opt.value)}
                      className={`flex-1 py-2 text-md3-label-md font-semibold transition-colors ${
                        visibility === opt.value
                          ? 'bg-blue text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Requires approval toggle */}
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
              <input
                {...register('requires_approval')}
                type="checkbox"
                id="requires_approval"
                className="w-4 h-4 accent-blue rounded"
              />
              <div>
                <label
                  htmlFor="requires_approval"
                  className="text-md3-body-md font-semibold text-slate-900 cursor-pointer"
                >
                  Require Registration Approval
                </label>
                <p className="text-md3-label-md text-slate-400 mt-0.5">
                  Manually approve each registration before members receive their QR ticket.
                </p>
              </div>
            </div>

            {/* Chapter lock toggle */}
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
              <input
                {...register('is_chapter_locked')}
                type="checkbox"
                id="is_chapter_locked"
                className="w-4 h-4 accent-blue rounded"
              />
              <div>
                <label
                  htmlFor="is_chapter_locked"
                  className="text-md3-body-md font-semibold text-slate-900 cursor-pointer"
                >
                  Lock to Chapter
                </label>
                <p className="text-md3-label-md text-slate-400 mt-0.5">
                  Only members of your chapter can register for this event. Disable to allow members from any chapter to join.
                </p>
              </div>
            </div>

            {/* Ticket price — hidden for external events */}
            {!isExternal && (
              <div>
                <label className={labelClass}>Ticket Price</label>
                <div className="flex gap-3">
                  <Controller
                    control={control}
                    name="is_free"
                    render={({ field }) => (
                      <>
                        <button
                          type="button"
                          onClick={() => field.onChange(true)}
                          className={`flex-1 py-2 rounded-xl text-md3-label-md font-semibold border transition-colors ${
                            field.value
                              ? 'bg-blue text-white border-blue'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'
                          }`}
                        >
                          Free
                        </button>
                        <button
                          type="button"
                          onClick={() => field.onChange(false)}
                          className={`flex-1 py-2 rounded-xl text-md3-label-md font-semibold border transition-colors ${
                            !field.value
                              ? 'bg-blue text-white border-blue'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'
                          }`}
                        >
                          Paid
                        </button>
                      </>
                    )}
                  />
                </div>

                {!isFree && (
                  <div className="mt-3">
                    <label className={labelClass}>Price (PHP)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-md3-body-md text-slate-400 pointer-events-none">
                        ₱
                      </span>
                      <input
                        {...register('ticket_price_php')}
                        type="number"
                        min={1}
                        step={1}
                        className={`${inputClass} pl-8`}
                        placeholder="0"
                      />
                    </div>
                    {errors.ticket_price_php && (
                      <p className="text-md3-label-md text-red mt-1">{errors.ticket_price_php.message}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Capacity — hidden for external events */}
            {!isExternal && (
              <div>
                <label className={labelClass}>
                  Capacity <span className="text-slate-300 normal-case font-normal">optional</span>
                </label>
                <input
                  {...register('capacity')}
                  type="number"
                  min={1}
                  step={1}
                  className={inputClass}
                  placeholder="Unlimited"
                />
                {errors.capacity && (
                  <p className="text-md3-label-md text-red mt-1">{errors.capacity.message}</p>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── ENGAGEMENT — hidden for external events ── */}
        {!isExternal && (
          <motion.div variants={fadeUp}>
            <SectionHeader title="Engagement" />
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Attendance XP</label>
                <input
                  {...register('points_value')}
                  type="number"
                  className={inputClass}
                  min={1}
                  max={1000}
                  step={1}
                />
                {errors.points_value && (
                  <p className="text-md3-label-md text-red mt-1">{errors.points_value.message}</p>
                )}
                <p className="text-md3-label-md text-slate-400 mt-1">
                  Auto-set based on category — Tech Talk/Social/Networking = 5 pts, Workshop/Brown Bag/Hackathon = 150 pts.
                </p>
              </div>

              {/* Volunteer XP — temporarily disabled. Default value (500) still submitted via form defaultValues. */}
              {/* <div>
                <label className={labelClass}>Volunteer XP</label>
                <input
                  {...register('volunteer_points')}
                  type="number"
                  className={inputClass}
                  min={0}
                  max={1000}
                  step={1}
                />
                {errors.volunteer_points && (
                  <p className="text-md3-label-md text-red mt-1">{errors.volunteer_points.message}</p>
                )}
                <p className="text-md3-label-md text-slate-400 mt-1">
                  XP awarded on top of attendance XP for members who volunteer at this event. Default: 500 pts.
                </p>
              </div> */}
            </div>
          </motion.div>
        )}

        {/* ── REGISTRATION QUESTIONS ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Registration Questions" />
          <p className="text-md3-label-md text-slate-400 mb-3">
            Add custom fields to collect extra information from registrants.
          </p>
          <CustomFieldsBuilder
            customFields={customFields}
            setCustomFields={setCustomFields}
          />
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

        {/* Stall recovery: shown when the tab was backgrounded mid-submit and the
            browser timer throttling caused fetchWithTimeout's abort to fire late */}
        {submitStalled && (
          <motion.div
            variants={fadeUp}
            className="p-4 bg-amber-50 border border-amber-200 rounded-xl"
          >
            <p className="text-md3-body-sm font-semibold text-amber-900">Taking longer than expected</p>
            <p className="text-md3-label-md text-amber-700 mt-1">
              Your form data is saved. Reload the page and try again — nothing will be lost.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 text-md3-label-md font-semibold text-blue underline-offset-2 underline"
            >
              Reload page →
            </button>
          </motion.div>
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
              ? submitStalled ? 'Connection lost…' : 'Creating…'
              : 'Create Event'}
          </button>
        </motion.div>
      </motion.form>
    </div>
  )
}
