import { useRef, useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { isValidUUID } from '../../../lib/validation'
import { ArrowLeftOutline, DangerTriangleOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { fadeUp, staggerContainer } from '../../../lib/animation'
import { toDatetimeLocalValue, fromDatetimeLocalValue } from '../../../lib/dates'
import { useEventsStore } from '../../../stores/useEventsStore'
import { useAuthStore } from '../../../stores/useAuthStore'
import { supabase } from '../../../lib/supabase'
import NotFound from '../../NotFound'
import {
  makeEventSchema,
  MAX_XP_ADMIN,
  MAX_XP_OFFICER,
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
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  SectionHeader,
  CustomFieldsBuilder,
} from './eventFormConstants'
import type { Json } from '@devcon-plus/supabase'
import { useFormDraft } from '../../../hooks/useFormDraft'
import { MarkdownEditor } from '../../../components/MarkdownEditor'
import CoverImageUpload from '../../../components/CoverImageUpload'

type EventEditDraft = FormData & {
  tags: string[]
  visibility: 'public' | 'unlisted' | 'draft'
  customFields: CustomFormField[]
}

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export function OrgEventEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { events, fetchEvents, isLoading, updateEvent, deleteEvent } = useEventsStore()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'hq_admin' || user?.role === 'super_admin'
  // Chapter officers cap attendance XP at 350; admins keep the original ceiling.
  const XP_CAP = isAdmin ? MAX_XP_ADMIN : MAX_XP_OFFICER
  const eventSchema = useMemo(() => makeEventSchema(XP_CAP), [XP_CAP])
  const { draft, saveDraft, clearDraft } = useFormDraft<EventEditDraft>(
    `org-event-edit:${id ?? ''}`,
    'local',
  )
  const hasDraft = Object.keys(draft).length > 0

  // ── Load events if store is empty ────────────────────────────────────────
  useEffect(() => {
    if (events.length === 0) void fetchEvents()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const event = events.find((e) => e.id === id)

  // ── Cover image (managed by <CoverImageUpload />, kept here for submit) ────
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(
    event?.cover_image_url ?? null
  )
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null)

  // ── Custom registration fields ───────────────────────────────────────────
  const [customFields, setCustomFields] = useState<CustomFormField[]>(
    hasDraft
      ? ((draft.customFields as CustomFormField[]) ?? [])
      : Array.isArray(event?.custom_form_schema)
        ? (event.custom_form_schema as CustomFormField[])
        : [],
  )

  // ── Tags ─────────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<string[]>(
    hasDraft ? ((draft.tags as string[]) ?? []) : (event?.tags ?? []),
  )
  const [tagInput, setTagInput] = useState('')

  // ── Visibility ───────────────────────────────────────────────────────────
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'draft'>(
    hasDraft
      ? ((draft.visibility as 'public' | 'unlisted' | 'draft') ?? 'public')
      : ((event?.visibility as 'public' | 'unlisted' | 'draft') ?? 'public'),
  )

  // ── Delete flow ──────────────────────────────────────────────────────────
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Submit state ─────────────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Stall detection (same pattern as EventCreate): browser timer throttling when
  // backgrounded can freeze fetchWithTimeout's abort, leaving isSubmitting stuck.
  const submitStartRef = useRef<number | null>(null)
  const [submitStalled, setSubmitStalled] = useState(false)
  const SUBMIT_STALL_MS = 35_000

  // ── Status locking ───────────────────────────────────────────────────────
  const isLocked = event?.status === 'ongoing' || event?.status === 'past'

  // ── Form ─────────────────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: event
      ? {
          title:             hasDraft ? (draft.title             as string)  ?? event.title             : event.title,
          description:       hasDraft ? (draft.description       as string)  ?? event.description ?? '' : event.description ?? '',
          location:          hasDraft ? (draft.location          as string)  ?? event.location ?? ''    : event.location ?? '',
          event_date:        hasDraft
            ? (draft.event_date as string) ?? toDatetimeLocalValue(event.event_date)
            : toDatetimeLocalValue(event.event_date),
          end_date:          hasDraft
            ? (draft.end_date as string) ?? toDatetimeLocalValue(event.end_date)
            : toDatetimeLocalValue(event.end_date),
          category:          hasDraft ? (draft.category        as FormData['category'])       ?? (event.category as FormData['category'])       : event.category as FormData['category'],
          devcon_category:   hasDraft ? (draft.devcon_category as FormData['devcon_category']) ?? (event.devcon_category ?? null) as FormData['devcon_category'] : (event.devcon_category ?? null) as FormData['devcon_category'],
          points_value:      hasDraft ? (draft.points_value      as number)  ?? (event.points_value      ?? 5)                     : event.points_value      ?? 5,
          volunteer_points:  hasDraft ? (draft.volunteer_points  as number)  ?? (event.volunteer_points  ?? DEFAULT_VOLUNTEER_POINTS) : event.volunteer_points  ?? DEFAULT_VOLUNTEER_POINTS,
          requires_approval: hasDraft ? (draft.requires_approval as boolean) ?? (event.requires_approval ?? false)                  : event.requires_approval ?? false,
          is_chapter_locked: hasDraft ? (draft.is_chapter_locked as boolean) ?? (event.is_chapter_locked ?? false)                  : event.is_chapter_locked ?? false,
          // HQ events have chapter_id === null; coerce to '' so the z.string()
          // validator passes. This field is not user-editable here and is never
          // sent in the updateEvent payload — it's validate-only. Leaving it null
          // silently fails handleSubmit (no error UI on the hidden field), which
          // is why saving an HQ event appeared to do nothing.
          chapter_id:        hasDraft ? (draft.chapter_id       as string)  ?? (event.chapter_id ?? '')                 : (event.chapter_id ?? ''),
          is_free:           hasDraft ? (draft.is_free           as boolean) ?? (event.is_free           ?? true)                   : event.is_free           ?? true,
          ticket_price_php:  hasDraft ? (draft.ticket_price_php  as number)  ?? (event.ticket_price_php  ?? 0)                     : event.ticket_price_php  ?? 0,
          capacity:          hasDraft ? (draft.capacity          as number | undefined) ?? event.capacity ?? undefined               : event.capacity          ?? undefined,
          visibility:        (event.visibility ?? 'public') as 'public' | 'unlisted' | 'draft',
        }
      : {
          points_value:      5,
          volunteer_points:  DEFAULT_VOLUNTEER_POINTS,
          requires_approval: false,
          is_chapter_locked: false,
          chapter_id:        '',
          is_free:           true,
          ticket_price_php:  0,
          visibility:        'public',
          tags:              [],
        },
  })

  const isFree    = watch('is_free')
  const category  = watch('category')
  // HQ events (no chapter) span every chapter, so "Lock to Chapter" doesn't apply.
  const isHqEvent = !!event && event.chapter_id === null

  // Auto-set attendance points when category changes (mirrors EventCreate)
  const prevCategoryRef = useRef<string | undefined>(undefined)
  if (category && category !== prevCategoryRef.current) {
    prevCategoryRef.current = category
    // Only auto-set if the event isn't locked AND the category actually changed from stored value
    if (!isLocked && category !== event?.category) {
      setValue('points_value', Math.min(ATTENDANCE_PTS[category], XP_CAP), { shouldValidate: false })
    }
  }

  // Save RHF fields → draft
  useEffect(() => {
    const { unsubscribe } = watch((values) => {
      saveDraft({ ...(values as Partial<FormData>), tags, visibility, customFields })
    })
    return unsubscribe
  }, [watch, saveDraft, tags, visibility, customFields])

  // Save outside-RHF state → draft
  useEffect(() => {
    saveDraft({ ...getValues(), tags, visibility, customFields })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags, visibility, customFields])

  // HQ events are open to all chapters — keep the lock off regardless of any
  // stale stored value so it can't be re-enabled on save.
  useEffect(() => {
    if (isHqEvent) setValue('is_chapter_locked', false)
  }, [isHqEvent, setValue])

  // Stall detection: tab backgrounded mid-submit throttles browser timers
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


  // ── TagOutline handlers ────────────────────────────────────────────────────────
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const val = tagInput.trim()
      if (val && val.length <= 20 && !tags.includes(val)) {
        setTags((prev) => [...prev, val])
      }
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag))

  // ── Delete handler ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!event) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteEvent(event.id)
      clearDraft()
      navigate('/organizer/events', { replace: true })
    } catch {
      setDeleteError('Failed to delete event. Please try again.')
      setIsDeleting(false)
    }
  }

  // ── Submit handler ──────────────────────────────────────────────────────
  const onSubmit = async (data: FormData) => {
    if (!event) return
    setSubmitError(null)
    setCoverUploadError(null)
    setSubmitStalled(false)
    submitStartRef.current = Date.now()

    // Determine cover image URL
    let cover_image_url: string | null = coverPreview
      ? (coverFile ? null : (event.cover_image_url ?? null))
      : null

    if (coverFile && !user?.id) {
      setSubmitError('Session expired. Please sign in again.')
      return
    }

    if (coverFile) {
      const userId = user?.id ?? 'unknown'
      const safeName = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
      const path = `${userId}/${Date.now()}-${safeName}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('event-covers')
        .upload(path, coverFile)
      if (uploadError) {
        setCoverUploadError('Cover image upload failed — saving without image change.')
        cover_image_url = event.cover_image_url ?? null
      } else {
        const { data: urlData } = supabase.storage
          .from('event-covers')
          .getPublicUrl(uploadData.path)
        cover_image_url = urlData.publicUrl
      }
    }

    try {
      await updateEvent(event.id, {
        title:              data.title,
        description:        data.description,
        location:           data.location,
        // datetime-local values are naive local wall-clock — convert to a UTC ISO
        // instant so the event doesn't shift a day when rendered in local time.
        event_date:         isLocked ? (event.event_date ?? undefined) : (fromDatetimeLocalValue(data.event_date) ?? data.event_date),
        end_date:           isLocked ? (event.end_date ?? null)        : fromDatetimeLocalValue(data.end_date),
        points_value:       isLocked ? (event.points_value ?? 5)       : data.points_value,
        volunteer_points:   isLocked ? (event.volunteer_points ?? DEFAULT_VOLUNTEER_POINTS) : data.volunteer_points,
        requires_approval:  isLocked ? (event.requires_approval ?? false) : data.requires_approval,
        is_chapter_locked:  data.is_chapter_locked,
        category:           data.category,
        devcon_category:    data.devcon_category ?? null,
        tags,
        visibility,
        is_free:            data.is_free,
        ticket_price_php:   data.is_free ? 0 : data.ticket_price_php,
        capacity:           data.capacity ?? null,
        cover_image_url,
        custom_form_schema: customFields.length > 0 ? customFields as unknown as Json : null,
      })
      submitStartRef.current = null
      clearDraft()
      navigate(`/organizer/events/${event.id}`)
    } catch (err) {
      submitStartRef.current = null
      setSubmitError(err instanceof Error ? err.message : 'Failed to save event. Please try again.')
    }
  }

  // ── Loading / not-found guards ───────────────────────────────────────────
  if (!isValidUUID(id)) return <Navigate to="/organizer/events" replace />

  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-blue border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!event) return <NotFound />

  // ── Render ───────────────────────────────────────────────────────────────
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
            <div className="flex items-center gap-2">
              <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
                Edit Event
              </h1>
            </div>
          </div>
        </div>
      </header>

      {isLocked && (
        <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-md3-label-md font-semibold text-amber-700">
            This event is <span className="capitalize">{event.status}</span>. Schedule and engagement fields are locked.
          </p>
        </div>
      )}

      <motion.form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="p-4 space-y-5"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <input type="hidden" {...register('chapter_id')} />
        {/* ── EVENT DETAILS ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Event Details" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Event Title <span className="text-red normal-case">*</span></label>
              <input {...register('title')} className={inputClass} placeholder="e.g. DEVCON Summit Manila 2026" />
              {errors.title && <p className="text-md3-label-md text-red mt-1">{errors.title.message}</p>}
            </div>
            <div>
              <label className={labelClass}>Description <span className="text-red normal-case">*</span></label>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <MarkdownEditor
                    value={field.value}
                    onChange={field.onChange as (value: string) => void}
                    error={errors.description?.message}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    minLength={DESCRIPTION_MIN_LENGTH}
                  />
                )}
              />
            </div>
          </div>
        </motion.div>

        {/* ── MEDIA ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Media" />
          <CoverImageUpload
            initialPreviewUrl={event.cover_image_url}
            onChange={({ file, previewUrl }) => {
              setCoverFile(file)
              setCoverPreview(previewUrl)
            }}
            error={coverUploadError}
          />
        </motion.div>

        {/* ── CATEGORIZATION ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Categorization" />
          <div className="space-y-4">
            <div>
              <label className={labelClass}>DEVCON Program <span className="text-red normal-case">*</span></label>
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
              {errors.devcon_category && <p className="text-md3-label-md text-red mt-1">{errors.devcon_category.message}</p>}
            </div>

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
              {errors.category && <p className="text-md3-label-md text-red mt-1">{errors.category.message}</p>}
            </div>

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
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-1 bg-blue/10 text-blue text-md3-label-md rounded-full">
                      {t}
                      <button type="button" onClick={() => removeTag(t)} className="leading-none hover:text-blue-dark">×</button>
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
              <label className={labelClass}>Location <span className="text-red normal-case">*</span></label>
              <input {...register('location')} className={inputClass} placeholder="Venue or Online" />
              {errors.location && <p className="text-md3-label-md text-red mt-1">{errors.location.message}</p>}
            </div>

            {isLocked ? (
              <div className="space-y-3">
                {[
                  { label: 'Start Date & Time', value: event.event_date ? new Date(event.event_date).toLocaleString() : 'TBA' },
                  { label: 'End Date & Time',   value: event.end_date   ? new Date(event.end_date).toLocaleString()   : 'TBA' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <label className={labelClass}>{label}</label>
                    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50">
                      <span className="text-md3-body-md text-slate-700">{value}</span>
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full capitalize">
                        Locked — event is {event.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Start Date & Time <span className="text-red normal-case">*</span></label>
                  <input {...register('event_date')} type="datetime-local" className={inputClass} />
                  {errors.event_date && <p className="text-md3-label-md text-red mt-1">{errors.event_date.message}</p>}
                </div>
                <div>
                  <label className={labelClass}>End Date & Time</label>
                  <input {...register('end_date')} type="datetime-local" className={inputClass} />
                  {errors.end_date && <p className="text-md3-label-md text-red mt-1">{errors.end_date.message}</p>}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* ── ACCESS SETTINGS ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Access Settings" />
          <div className="space-y-4">
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

            {isLocked ? (
              <div>
                <label className={labelClass}>Registration Approval</label>
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-md3-body-md text-slate-700">
                    {event.requires_approval ? 'Approval required' : 'Auto-approved'}
                  </span>
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full capitalize">
                    Locked — event is {event.status}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
                <input
                  {...register('requires_approval')}
                  type="checkbox"
                  id="requires_approval"
                  className="w-4 h-4 accent-blue rounded"
                />
                <div>
                  <label htmlFor="requires_approval" className="text-md3-body-md font-semibold text-slate-900 cursor-pointer">
                    Require Registration Approval
                  </label>
                  <p className="text-md3-label-md text-slate-400 mt-0.5">
                    Manually approve each registration before members receive their QR ticket.
                  </p>
                </div>
              </div>
            )}

            {/* Chapter lock toggle — N/A for HQ events (they span every chapter) */}
            <div className={`flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4 ${isHqEvent ? 'opacity-60' : ''}`}>
              <input
                {...register('is_chapter_locked')}
                type="checkbox"
                id="is_chapter_locked"
                disabled={isHqEvent}
                className="w-4 h-4 accent-blue rounded disabled:cursor-not-allowed"
              />
              <div>
                <label
                  htmlFor="is_chapter_locked"
                  className={`text-md3-body-md font-semibold text-slate-900 ${isHqEvent ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  Lock to Chapter
                </label>
                <p className="text-md3-label-md text-slate-400 mt-0.5">
                  {isHqEvent
                    ? 'HQ events are open to members from every chapter, so chapter locking does not apply.'
                    : 'Only members of your chapter can register for this event. Disable to allow members from any chapter to join.'}
                </p>
              </div>
            </div>

            <div>
              <label className={labelClass}>Ticket Price</label>
              <div className="flex gap-3">
                <Controller
                  control={control}
                  name="is_free"
                  render={({ field }) => (
                    <>
                      <button type="button" onClick={() => field.onChange(true)}
                        className={`flex-1 py-2 rounded-xl text-md3-label-md font-semibold border transition-colors ${field.value ? 'bg-blue text-white border-blue' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'}`}>
                        Free
                      </button>
                      <button type="button" onClick={() => field.onChange(false)}
                        className={`flex-1 py-2 rounded-xl text-md3-label-md font-semibold border transition-colors ${!field.value ? 'bg-blue text-white border-blue' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'}`}>
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
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-md3-body-md text-slate-400 pointer-events-none">₱</span>
                    <input {...register('ticket_price_php')} type="number" min={1} step={1} className={`${inputClass} pl-8`} placeholder="0" />
                  </div>
                  {errors.ticket_price_php && <p className="text-md3-label-md text-red mt-1">{errors.ticket_price_php.message}</p>}
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Capacity <span className="text-slate-300 normal-case font-normal">optional</span></label>
              <input {...register('capacity')} type="number" min={1} step={1} className={inputClass} placeholder="Unlimited" />
              {errors.capacity && <p className="text-md3-label-md text-red mt-1">{errors.capacity.message}</p>}
            </div>
          </div>
        </motion.div>

        {/* ── ENGAGEMENT ── */}
        <motion.div variants={fadeUp}>
          <SectionHeader title="Engagement" />
          {isLocked ? (
            <div className="space-y-4">
              {[
                { label: 'Attendance XP', value: event.points_value },
                // Volunteer XP — temporarily hidden. Uncomment to restore.
                // { label: 'Volunteer XP',  value: event.volunteer_points },
              ].map(({ label, value }) => (
                <div key={label}>
                  <label className={labelClass}>{label}</label>
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-md3-body-md text-slate-700">{value ?? 0} pts</span>
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full capitalize">
                      Locked — event is {event.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Attendance XP <span className="text-red normal-case">*</span></label>
                <input
                  {...register('points_value')}
                  type="number"
                  className={inputClass}
                  min={1}
                  max={XP_CAP}
                  step={1}
                />
                {errors.points_value && <p className="text-md3-label-md text-red mt-1">{errors.points_value.message}</p>}
                <p className="text-md3-label-md text-slate-400 mt-1">
                  Auto-set based on category — Tech Talk/Social/Networking = 5 pts, Code Camp = 50 pts, Workshop/Brown Bag/Hackathon = 150 pts.
                </p>
              </div>

              {/* Volunteer XP — temporarily disabled. Existing value still submitted
                  via updateEvent (volunteer_points from defaultValues). Uncomment to restore.
              <div>
                <label className={labelClass}>Volunteer XP</label>
                <input
                  {...register('volunteer_points')}
                  type="number"
                  className={inputClass}
                  min={0}
                  max={1000}
                  step={1}
                />
                {errors.volunteer_points && <p className="text-md3-label-md text-red mt-1">{errors.volunteer_points.message}</p>}
                <p className="text-md3-label-md text-slate-400 mt-1">
                  XP awarded on top of attendance XP for members who volunteer at this event. Default: 500 pts.
                </p>
              </div>
              */}
            </div>
          )}
        </motion.div>

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
          <motion.p variants={fadeUp} className="text-md3-label-md text-red bg-red/5 border border-red/20 rounded-xl px-3 py-2">
            {submitError}
          </motion.p>
        )}

        {/* Stall recovery */}
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

        {/* ── ACTIONS ── */}
        <motion.div variants={fadeUp} className="flex gap-3 pt-2">
          <motion.button
            type="button"
            onClick={() => navigate(-1)}
            whileTap={{ scale: 0.95 }}
            className="flex-1 py-3 border border-slate-200 text-slate-700 text-md3-body-md font-semibold rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            disabled={isSubmitting}
            whileTap={{ scale: 0.95 }}
            className="flex-1 py-3 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors disabled:opacity-60"
          >
            {isSubmitting
              ? submitStalled ? 'Connection lost…' : 'Saving…'
              : 'Save Changes'}
          </motion.button>
        </motion.div>

        {/* ── DANGER ZONE ── */}
        <motion.div variants={fadeUp} className="mt-2 border-t-2 border-red/20 pt-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red/60 mb-3">
            Danger Zone
          </p>
          <motion.button
            type="button"
            onClick={() => setDeleteStep(1)}
            whileTap={{ scale: 0.95 }}
            className="w-full py-3 rounded-xl border border-red/30 text-red text-md3-body-md font-bold hover:bg-red/5 transition-colors"
          >
            Delete Event
          </motion.button>
        </motion.div>
      </motion.form>

      {/* ── Delete confirmation bottom sheets (2-step) ── */}
      <AnimatePresence>
        {deleteStep > 0 && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setDeleteStep(0)}
            />

            {deleteStep === 1 && (
              <motion.div
                key={1}
                className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl px-4 pt-4 pb-10"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              >
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-red/10 flex items-center justify-center mb-4">
                    <DangerTriangleOutline className="w-7 h-7" color="#EF4444" />
                  </div>
                  <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">Delete Event?</h2>
                  <p className="text-md3-body-md text-slate-500">
                    You are about to delete{' '}
                    <span className="font-semibold text-slate-700">"{event.title}"</span>.
                    This will also permanently remove all registrations for this event.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setDeleteStep(0)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 text-md3-body-md font-bold">Cancel</button>
                  <button onClick={() => setDeleteStep(2)} className="flex-1 py-3 rounded-xl bg-red/10 text-red text-md3-body-md font-bold">Continue</button>
                </div>
              </motion.div>
            )}

            {deleteStep === 2 && (
              <motion.div
                key={2}
                className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl px-4 pt-4 pb-10"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              >
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-14 h-14 rounded-full bg-red/10 flex items-center justify-center mb-4">
                    <DangerTriangleOutline className="w-7 h-7" color="#EF4444" />
                  </div>
                  <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">Are you sure?</h2>
                  <p className="text-md3-body-md text-slate-500">
                    All registrations for this event will be permanently deleted along with the event itself.{' '}
                    <span className="font-semibold text-red">This cannot be undone.</span>
                  </p>
                  {deleteError && <p className="mt-3 text-md3-body-md text-red font-semibold">{deleteError}</p>}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setDeleteStep(0)} disabled={isDeleting} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 text-md3-body-md font-bold disabled:opacity-50">Cancel</button>
                  <button onClick={handleDelete} disabled={isDeleting} className="flex-1 py-3 rounded-xl bg-red text-white text-md3-body-md font-bold disabled:opacity-60">
                    {isDeleting ? 'Deleting…' : 'Delete Everything'}
                  </button>
                </div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
