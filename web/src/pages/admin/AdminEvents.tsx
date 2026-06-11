import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPointOutline, TrashBinTrashOutline, BoltOutline, AddCircleOutline, PenOutline, CloseCircleLineDuotone, DownloadOutline, GalleryAddOutline } from 'solar-icon-set'
import { AnimatePresence, motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { apiFetch, publicFetch } from '../../lib/api'
import type { Event } from '@devcon-plus/supabase'
import { useChaptersStore } from '../../stores/useChaptersStore'

// ── Custom form field types ────────────────────────────────────────────────────

type CustomFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'radio'

interface CustomFormField {
  id: string          // crypto.randomUUID() — stable key, survives label edits
  label: string
  type: CustomFieldType
  required: boolean
  options: string[]   // only used for select / radio / checkbox
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventWithChapter extends Event {
  chapters?: { name: string } | null
}

type ExportKind = 'events' | 'attendance'
type ExportScope = 'all' | 'event'
type AttendanceFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'checked_in' | 'not_checked_in'

interface ExportDialogState {
  kind: ExportKind
  scope: ExportScope
  eventId: string
  chapterId: string
  eventDate: string
  attendanceStatus: AttendanceFilter
}

interface AttendanceExportRow extends Record<string, string | number | boolean | null | undefined> {
  registration_id: string
  status: string
  checked_in: boolean
  registered_at: string
  chapter_name: string
  member_name: string
  member_email: string
  school_or_company: string
}

// ── Zod schema ─────────────────────────────────────────────────────────────────

const eventSchema = z
  .object({
    chapter_id: z.string(),
    title: z.string().min(3, 'Title must be at least 3 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    location: z.string().min(2, 'Location is required'),
    event_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().optional(),
    category: z.enum([
      'tech_talk',
      'hackathon',
      'workshop',
      'brown_bag',
      'summit',
      'social',
      'networking',
    ]),
    is_external: z.boolean().default(false),
    external_registration_url: z
      .string()
      .url('Enter a valid URL')
      .optional()
      .or(z.literal('')),
    url_is_tba: z.boolean().default(false),
    visibility: z.enum(['public', 'unlisted', 'draft']).default('public'),
    is_free: z.boolean().default(true),
    ticket_price_php: z.number({ coerce: true }).int().min(0).default(0),
    capacity: z.preprocess(
      (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
      z.number().int().positive().optional()
    ),
    points_value: z
      .number({ coerce: true })
      .min(0, 'Minimum 0 XP')
      .max(1000, 'Maximum 1000 XP'),
    requires_approval: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.end_date && data.event_date && data.end_date <= data.event_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'End time must be after start time',
      })
    }
    if (data.is_external) {
      if (!data.url_is_tba && (!data.external_registration_url || data.external_registration_url === '')) {
        ctx.addIssue({
          code: 'custom',
          path: ['external_registration_url'],
          message: 'External registration URL is required',
        })
      }
      if (data.points_value !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['points_value'],
          message: 'External events must be set to 0 XP',
        })
      }
    } else if (data.points_value < 50) {
      ctx.addIssue({
        code: 'custom',
        path: ['points_value'],
        message: 'Minimum 50 XP',
      })
    }
  })

type EventFormData = z.infer<typeof eventSchema>

const normalizeExternalUrl = (value?: string | null) => (value === 'tba' ? '' : (value ?? ''))

const attachChapterName = (
  event: Event,
  chapters: { id: string; name: string }[],
): EventWithChapter => ({
  ...event,
  chapters: event.chapter_id
    ? { name: chapters.find((chapter) => chapter.id === event.chapter_id)?.name ?? '—' }
    : null,
})

// ── Constants ──────────────────────────────────────────────────────────────────

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md3-body-md text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20'
const labelClass = 'block text-md3-label-md font-bold uppercase tracking-wide text-slate-500 mb-1.5'

const CATEGORY_OPTIONS: { value: EventFormData['category']; label: string }[] = [
  { value: 'tech_talk',  label: 'Tech Talk'  },
  { value: 'hackathon',  label: 'Hackathon'  },
  { value: 'workshop',   label: 'Workshop'   },
  { value: 'brown_bag',  label: 'Brown Bag'  },
  { value: 'summit',     label: 'Summit'     },
  { value: 'social',     label: 'Social'     },
  { value: 'networking', label: 'Networking' },
]

const VISIBILITY_OPTIONS: { value: EventFormData['visibility']; label: string }[] = [
  { value: 'public',   label: 'Public'   },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'draft',    label: 'Draft'    },
]

// ── CSV helpers ─────────────────────────────────────────────────────────────

const CSV_SEPARATOR = ','

const escapeCsvValue = (value: string | number | boolean | null | undefined) => {
  const raw = value === null || value === undefined ? '' : String(value)
  const escaped = raw.replace(/"/g, '""')
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

const buildCsv = (headers: string[], rows: Array<Record<string, string | number | boolean | null | undefined>>) => {
  const headerLine = headers.join(CSV_SEPARATOR)
  const lines = rows.map((row) => headers.map((key) => escapeCsvValue(row[key])).join(CSV_SEPARATOR))
  return [headerLine, ...lines].join('\n')
}

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const getPhilippineDateStamp = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

const buildExportFilename = (prefix: string, label?: string) => {
  const dateStamp = getPhilippineDateStamp()
  if (label) {
    return `${prefix}-${dateStamp}-${slugify(label)}.csv`
  }
  return `${prefix}-${dateStamp}.csv`
}

const getEventDateKey = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(value))
    : ''


// ── SlideOver form props ───────────────────────────────────────────────────────

interface SlideOverFormProps {
  mode: 'create' | 'edit'
  event?: EventWithChapter
  chapters: { id: string; name: string }[]
  onClose: () => void
  onSaved: (event: EventWithChapter) => void
}

// ── EventSlideOverForm ─────────────────────────────────────────────────────────

function EventSlideOverForm({ mode, event, chapters, onClose, onSaved }: SlideOverFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null)

  // ── Custom form fields state ─────────────────────────────────────────────────
  const [customFields, setCustomFields] = useState<CustomFormField[]>(() => {
    const raw = event?.custom_form_schema
    return Array.isArray(raw) ? (raw as CustomFormField[]) : []
  })
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({})

  // ── Cover image ──────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(event?.cover_image_url ?? null)
  const coverObjectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current)
    }
  }, [])

  const addField = () =>
    setCustomFields(prev => [...prev, {
      id:       crypto.randomUUID(),
      label:    '',
      type:     'text',
      required: false,
      options:  [],
    }])

  const removeField = (id: string) =>
    setCustomFields(prev => prev.filter(f => f.id !== id))

  const updateField = (id: string, patch: Partial<CustomFormField>) =>
    setCustomFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))

  const addOption = (fieldId: string) => {
    const draft = optionDrafts[fieldId]?.trim()
    if (!draft) return
    const field = customFields.find(f => f.id === fieldId)
    if (!field) return
    updateField(fieldId, { options: [...field.options, draft] })
    setOptionDrafts(prev => ({ ...prev, [fieldId]: '' }))
  }

  const removeOption = (fieldId: string, index: number) => {
    const field = customFields.find(f => f.id === fieldId)
    if (!field) return
    updateField(fieldId, { options: field.options.filter((_, i) => i !== index) })
  }

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

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: event
      ? {
          chapter_id:        event.chapter_id === null ? '__hq__' : event.chapter_id,
          title:             event.title,
          description:       event.description ?? '',
          location:          event.location ?? '',
          event_date:        event.event_date?.slice(0, 16) ?? '',
          end_date:          event.end_date?.slice(0, 16) ?? '',
          category:          event.category ?? 'tech_talk',
          is_external:       event.is_external ?? false,
          external_registration_url: normalizeExternalUrl(event.external_registration_url),
          url_is_tba:        normalizeExternalUrl(event.external_registration_url) === '',
          visibility:        event.visibility ?? 'public',
          is_free:           event.is_free ?? true,
          ticket_price_php:  event.ticket_price_php ?? 0,
          capacity:          event.capacity ?? undefined,
          points_value:      event.points_value ?? 200,
          requires_approval: event.requires_approval ?? false,
        }
      : {
          points_value:      200,
          requires_approval: false,
          is_free:           true,
          ticket_price_php:  0,
          is_external:       false,
          external_registration_url: '',
          url_is_tba:        true,
          visibility:        'public',
        },
  })

  const isFree = watch('is_free')
  const isExternal = watch('is_external')
  const [urlIsTba, setUrlIsTba] = useState<boolean>(() => {
    const existing = normalizeExternalUrl(event?.external_registration_url)
    return existing === ''
  })

  useEffect(() => {
    if (isExternal) {
      setValue('points_value', 0)
      setValue('requires_approval', false)
      setValue('visibility', 'public')
      setValue('url_is_tba', urlIsTba)
      if (urlIsTba) {
        setValue('external_registration_url', '')
      }
    } else {
      setValue('external_registration_url', '')
      setValue('url_is_tba', true)
      setUrlIsTba(true)
    }
  }, [isExternal, setValue, urlIsTba])

  const onSubmit = async (data: EventFormData) => {
    setSubmitError(null)
    setCoverUploadError(null)
    if (!data.chapter_id) {
      setSubmitError('Please select a chapter or HQ.')
      return
    }
    try {
      const schema = customFields.length > 0 ? customFields : null
      const isExternalEvent = data.is_external === true
      const externalUrl = data.url_is_tba ? 'tba' : (data.external_registration_url?.trim() || null)
      const { url_is_tba: _urlIsTba, ...rest } = data

      const isHqEvent = rest.chapter_id === '__hq__'
      const chapterId = isHqEvent ? null : rest.chapter_id

      let cover_image_url: string | null = coverPreview
        ? (coverFile ? null : (event?.cover_image_url ?? null))
        : null

      if (coverFile) {
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData.user?.id ?? 'admin'
        const safeName = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
        const path = `${userId}/${Date.now()}-${safeName}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('event-covers')
          .upload(path, coverFile)
        if (uploadError) {
          setCoverUploadError('Cover image upload failed — saving without image change.')
          cover_image_url = event?.cover_image_url ?? null
        } else {
          const { data: urlData } = supabase.storage
            .from('event-covers')
            .getPublicUrl(uploadData.path)
          cover_image_url = urlData.publicUrl
        }
      }

      const payload = {
        ...rest,
        chapter_id: chapterId,
        is_chapter_locked: isHqEvent ? false : true,
        end_date: data.end_date ?? null,
        capacity: data.capacity ?? null,
        external_registration_url: isExternalEvent ? externalUrl : null,
        visibility: isExternalEvent ? 'public' : data.visibility,
        points_value: isExternalEvent ? 0 : data.points_value,
        requires_approval: isExternalEvent ? false : data.requires_approval,
        custom_form_schema: isExternalEvent ? null : schema,
        cover_image_url,
      }
      if (mode === 'create') {
        const result = await apiFetch<Event>('/api/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        onSaved(attachChapterName(result, chapters))
      } else {
        const result = await apiFetch<Event>(`/api/events/${event!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        onSaved(attachChapterName(result, chapters))
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
        <div>
          <h2 className="text-md3-body-lg font-bold text-slate-900">
            {mode === 'create' ? 'Create Event' : 'Edit Event'}
          </h2>
          <p className="text-md3-label-md text-slate-400 mt-0.5">
            {mode === 'create' ? 'Add a new event to any chapter' : 'Update event details'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
        </button>
      </div>

      {/* Scrollable form body */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* ── Chapter (admin-only) ── */}
        <div>
          <label className={labelClass}>
            Chapter <span className="text-red normal-case">*</span>
          </label>
          <select {...register('chapter_id')} className={inputClass}>
            <option value="">Select chapter…</option>
            <option value="__hq__">HQ — All Chapters</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.chapter_id && (
            <p className="text-md3-label-md text-red mt-1">{errors.chapter_id.message}</p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4 mt-4">
          {/* ── Title ── */}
          <div className="mb-4">
            <label className={labelClass}>Event Title <span className="text-red normal-case">*</span></label>
            <input
              {...register('title')}
              className={inputClass}
              placeholder="e.g. DEVCON Summit Manila 2026"
            />
            {errors.title && (
              <p className="text-md3-label-md text-red mt-1">{errors.title.message}</p>
            )}
          </div>

          {/* ── Description ── */}
          <div>
            <label className={labelClass}>Description <span className="text-red normal-case">*</span></label>
            <textarea
              {...register('description')}
              rows={4}
              className={`${inputClass} resize-none`}
              placeholder="What is this event about?"
            />
            {errors.description && (
              <p className="text-md3-label-md text-red mt-1">{errors.description.message}</p>
            )}
          </div>
        </div>

        {/* ── Cover Image ── */}
        <div className="border-t border-slate-100 pt-4 mt-4">
          <label className={labelClass}>
            Cover Image <span className="text-slate-300 normal-case font-normal">optional</span>
          </label>

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
              className="w-full h-36 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue hover:text-blue transition-colors"
            >
              <GalleryAddOutline className="w-6 h-6" />
              <span className="text-md3-label-md font-medium">Tap to upload cover image</span>
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
        </div>

        {/* ── External Event Toggle ── */}
        <div className="border-t border-slate-100 pt-4 mt-4">
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
            <input
              {...register('is_external')}
              type="checkbox"
              id="is_external_admin"
              className="w-4 h-4 accent-blue rounded"
            />
            <div>
              <label
                htmlFor="is_external_admin"
                className="text-md3-body-md font-semibold text-slate-900 cursor-pointer"
              >
                External Tech Community Event
              </label>
              <p className="text-md3-label-md text-slate-400 mt-0.5">
                Redirects to an external registration page and awards no XP.
              </p>
            </div>
          </div>

          {isExternal && (
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>External Registration URL</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setUrlIsTba(true)
                      setValue('external_registration_url', '', { shouldValidate: true })
                      setValue('url_is_tba', true, { shouldValidate: false })
                    }}
                    className={`flex-1 py-2 rounded-xl text-md3-label-md font-semibold border transition-colors ${
                      urlIsTba
                        ? 'bg-blue text-white border-blue'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'
                    }`}
                  >
                    To Be Announced
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUrlIsTba(false)
                      setValue('url_is_tba', false, { shouldValidate: false })
                    }}
                    className={`flex-1 py-2 rounded-xl text-md3-label-md font-semibold border transition-colors ${
                      !urlIsTba
                        ? 'bg-blue text-white border-blue'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue hover:text-blue'
                    }`}
                  >
                    Provide URL
                  </button>
                </div>
              </div>

              {urlIsTba ? (
                <p className="text-md3-label-md text-slate-400">
                  The registration link will be shown once it is available.
                </p>
              ) : (
                <div>
                  <input
                    {...register('external_registration_url')}
                    className={inputClass}
                    placeholder="https://..."
                  />
                  {errors.external_registration_url && (
                    <p className="text-md3-label-md text-red mt-1">{errors.external_registration_url.message}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Category ── */}
        <div className="border-t border-slate-100 pt-4 mt-4">
          <label className={labelClass}>
            Category <span className="text-red normal-case">*</span>
          </label>
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

        {/* ── Location ── */}
        <div className="border-t border-slate-100 pt-4 mt-4">
          <label className={labelClass}>Location <span className="text-red normal-case">*</span></label>
          <input
            {...register('location')}
            className={inputClass}
            placeholder="Venue or Online"
          />
          {errors.location && (
            <p className="text-md3-label-md text-red mt-1">{errors.location.message}</p>
          )}
        </div>

        {/* ── Dates ── */}
        <div className="border-t border-slate-100 pt-4 mt-4">
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

        {/* ── Visibility ── */}
        {!isExternal && (
          <div className="border-t border-slate-100 pt-4 mt-4">
            <label className={labelClass}>Visibility</label>
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                      className={`flex-1 py-2 text-md3-label-md font-semibold transition-colors ${
                        field.value === opt.value
                          ? 'bg-blue text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
        )}

        {/* ── Requires Approval ── */}
        {!isExternal && (
          <div className="border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
              <input
                {...register('requires_approval')}
                type="checkbox"
                id="requires_approval_admin"
                className="w-4 h-4 accent-blue rounded"
              />
              <div>
                <label
                  htmlFor="requires_approval_admin"
                  className="text-md3-body-md font-semibold text-slate-900 cursor-pointer"
                >
                  Require Registration Approval
                </label>
                <p className="text-md3-label-md text-slate-400 mt-0.5">
                  Manually approve each registration before members receive their QR ticket.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── TicketOutline Price ── */}
        {!isExternal && (
          <div className="border-t border-slate-100 pt-4 mt-4">
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

        {/* ── Capacity ── */}
        <div className="border-t border-slate-100 pt-4 mt-4">
          <label className={labelClass}>
            Capacity{' '}
            <span className="text-slate-300 normal-case font-normal">optional</span>
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

        {/* ── XP Points Value ── */}
        {!isExternal && (
          <div className="border-t border-slate-100 pt-4 mt-4">
            <label className={labelClass}>XP Points Value</label>
            <input
              {...register('points_value')}
              type="number"
              className={inputClass}
              min={50}
              max={1000}
              step={50}
            />
            {errors.points_value && (
              <p className="text-md3-label-md text-red mt-1">{errors.points_value.message}</p>
            )}
            <p className="text-md3-label-md text-slate-400 mt-1">
              Members earn this many XP when checked in at the event.
            </p>
          </div>
        )}

        {/* ── Registration Questions (form builder) ── */}
        {!isExternal && (
          <div className="border-t border-slate-100 pt-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className={labelClass}>Registration Questions</p>
                <p className="text-md3-label-md text-slate-400 -mt-1 mb-2">
                  Extra fields shown on the member registration form.
                </p>
              </div>
              <button
                type="button"
                onClick={addField}
                className="flex items-center gap-1.5 text-md3-label-md font-bold text-blue bg-blue/10 hover:bg-blue/20 px-3 py-1.5 rounded-xl transition-colors shrink-0"
              >
                <AddCircleOutline className="w-3.5 h-3.5" />
                Add Question
              </button>
            </div>

            {customFields.length === 0 && (
              <p className="text-md3-label-md text-slate-300 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No extra questions — only name, email, and school/company will be collected.
              </p>
            )}

            <div className="space-y-3">
              {customFields.map((field, index) => (
                <div key={field.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <p className="text-md3-label-md font-bold text-slate-400 uppercase tracking-wide">
                      Question {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeField(field.id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                    >
                      <TrashBinTrashOutline className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Label */}
                  <div>
                    <label className={labelClass}>
                      Label <span className="text-red normal-case">*</span>
                    </label>
                    <input
                      type="text"
                      value={field.label}
                      onChange={e => updateField(field.id, { label: e.target.value })}
                      placeholder="e.g. What is your shirt size?"
                      className={inputClass}
                    />
                  </div>

                  {/* Type + Required */}
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className={labelClass}>Type</label>
                      <select
                        value={field.type}
                        onChange={e =>
                          updateField(field.id, {
                            type:    e.target.value as CustomFieldType,
                            options: [],
                          })
                        }
                        className={inputClass}
                      >
                        <option value="text">Short Text</option>
                        <option value="textarea">Long Text</option>
                        <option value="select">Dropdown</option>
                        <option value="radio">Multiple Choice</option>
                        <option value="checkbox">Checkboxes</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer pb-2.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={e => updateField(field.id, { required: e.target.checked })}
                        className="w-4 h-4 accent-blue"
                      />
                      <span className="text-md3-label-md font-semibold text-slate-600">Required</span>
                    </label>
                  </div>

                  {/* Options — only for select / radio / checkbox */}
                  {(field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') && (
                    <div>
                      <label className={labelClass}>Options</label>
                      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[26px]">
                        {field.options.map((opt, i) => (
                          <span
                            key={i}
                            className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-md3-label-md px-2 py-0.5 rounded-full"
                          >
                            {opt}
                            <button
                              type="button"
                              onClick={() => removeOption(field.id, i)}
                              className="text-slate-400 hover:text-red transition-colors"
                            >
                              <CloseCircleLineDuotone className="w-2.5 h-2.5" color="#EF4444" />
                            </button>
                          </span>
                        ))}
                        {field.options.length === 0 && (
                          <span className="text-md3-label-md text-slate-300 italic">No options yet</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={optionDrafts[field.id] ?? ''}
                          onChange={e =>
                            setOptionDrafts(prev => ({ ...prev, [field.id]: e.target.value }))
                          }
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); addOption(field.id) }
                          }}
                          placeholder="Add option…"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => addOption(field.id)}
                          className="px-3 py-2 bg-blue text-white text-md3-label-md font-bold rounded-xl hover:bg-blue-dark transition-colors shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <p className="text-md3-label-md text-red bg-red/5 border border-red/20 rounded-xl px-3 py-2">
            {submitError}
          </p>
        )}

        {coverUploadError && (
          <p className="text-md3-label-md text-red bg-red/5 border border-red/20 rounded-xl px-3 py-2">
            {coverUploadError}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2 pb-6">
          <button
            type="button"
            onClick={onClose}
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
              ? mode === 'create' ? 'Creating…' : 'Saving…'
              : mode === 'create' ? 'Create Event' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── AdminEvents ────────────────────────────────────────────────────────────────

export default function AdminEvents() {
  const [events, setEvents] = useState<EventWithChapter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<{ mode: 'create' | 'edit'; event?: EventWithChapter } | null>(null)
  const { chapters, fetchChapters } = useChaptersStore()
  const [exportDialog, setExportDialog] = useState<ExportDialogState | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [eventSearch, setEventSearch] = useState('')

  const eventOptions = useMemo(() => {
    const sorted = [...events].sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
    return sorted
  }, [events])

  const getEventOptionLabel = (event: EventWithChapter) => event.title

  const getEventSearchText = (event: EventWithChapter) => event.title.toLowerCase()

  const filteredEventOptions = useMemo(() => {
    const query = eventSearch.trim().toLowerCase()
    let list = eventOptions
    if (exportDialog?.scope === 'event' && exportDialog.chapterId) {
      list = list.filter((event) => event.chapter_id === exportDialog.chapterId)
    }
    if (exportDialog?.scope === 'event' && exportDialog.eventDate) {
      list = list.filter((event) => getEventDateKey(event.event_date) === exportDialog.eventDate)
    }
    if (!query) return list
    return list.filter((event) => getEventSearchText(event).includes(query))
  }, [eventOptions, eventSearch, exportDialog?.chapterId, exportDialog?.eventDate, exportDialog?.scope])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        await fetchChapters()

        const [eventRows, chapterRows] = await Promise.all([
          publicFetch<Event[]>('/api/events'),
          publicFetch<{ id: string; name: string }[]>('/api/chapters'),
        ])
        setEvents(eventRows.map((event) => attachChapterName(event, chapterRows)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load events')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  const applyAttendanceStatusFilter = (query: any, status: AttendanceFilter) => {
    const filterable = query as { eq: (column: string, value: string | boolean) => any }
    if (status === 'checked_in') return filterable.eq('checked_in', true)
    if (status === 'not_checked_in') return filterable.eq('checked_in', false)
    if (status !== 'all') return filterable.eq('status', status)
    return query
  }

  const openExportDialog = (kind: ExportKind) => {
    setExportError(null)
    setEventSearch('')
    setExportDialog({
      kind,
      scope: 'all',
      eventId: '',
      chapterId: '',
      eventDate: '',
      attendanceStatus: 'all',
    })
  }

  const closeExportDialog = () => {
    setEventSearch('')
    setExportDialog(null)
  }

  const handleExportEvents = async (
    scope: ExportScope,
    eventId?: string,
  ) => {
    setExportError(null)
    setExportLoading(true)
    try {
      let query = supabase
        .from('events')
        .select('end_date, location, category, visibility, status, is_free, ticket_price_php, capacity, points_value, requires_approval, is_external, external_registration_url, created_at, chapters(name)')
        .order('event_date', { ascending: false })

      if (scope === 'event' && eventId) query = query.eq('id', eventId)

      const { data, error: exportErr } = await query
      if (exportErr) throw new Error(exportErr.message)

      const rows = (data ?? []).map((event) => ({
        chapter: (event.chapters as { name?: string } | null)?.name ?? '',
        end_date: event.end_date ?? '',
        location: event.location ?? '',
        category: event.category ?? '',
        visibility: event.visibility ?? '',
        status: event.status ?? '',
        is_free: event.is_free ?? true,
        ticket_price_php: event.ticket_price_php ?? 0,
        capacity: event.capacity ?? '',
        points_value: event.points_value ?? '',
        requires_approval: event.requires_approval ?? false,
        is_external: event.is_external ?? false,
        external_registration_url: event.external_registration_url ?? '',
        created_at: event.created_at ?? '',
      }))

      const headers = [
        'chapter',
        'end_date',
        'location',
        'category',
        'visibility',
        'status',
        'is_free',
        'ticket_price_php',
        'capacity',
        'points_value',
        'requires_approval',
        'is_external',
        'external_registration_url',
        'created_at',
      ]

      const csv = buildCsv(headers, rows)
      const eventLabel = scope === 'event'
        ? events.find((event) => event.id === eventId)?.title
        : undefined
      const filename = buildExportFilename('events', eventLabel)
      downloadCsv(filename, csv)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export events.')
    } finally {
      setExportLoading(false)
    }
  }

  const handleExportAttendance = async (
    scope: ExportScope,
    eventId?: string,
    attendanceStatus?: AttendanceFilter,
  ) => {
    setExportError(null)
    setExportLoading(true)
    try {
      let eventIds: string[] | null = null
      if (scope === 'event' && eventId) eventIds = [eventId]

      let query: any = supabase
        .from('event_registrations')
        .select('id, status, checked_in, registered_at, event_id, events(title, chapters(name)), profiles(full_name, email, school_or_company)')
        .neq('status', 'cancelled')

      if (eventIds && eventIds.length === 0) {
        const eventLabel = scope === 'event'
          ? events.find((event) => event.id === eventId)?.title
          : undefined
        const emptyFilename = buildExportFilename('attendance', eventLabel)
        downloadCsv(emptyFilename, buildCsv([
          'registration_id',
          'status',
          'checked_in',
          'registered_at',
          'chapter_name',
          'member_name',
          'member_email',
          'school_or_company',
        ], []))
        setExportLoading(false)
        return
      }

      if (eventIds) query = query.in('event_id', eventIds)
      query = applyAttendanceStatusFilter(query, attendanceStatus ?? 'all') as any

      const { data, error: exportErr } = await query
      if (exportErr) throw new Error(exportErr.message)

      const rows: AttendanceExportRow[] = (data ?? []).map((row: {
        id?: string
        status?: string | null
        checked_in?: boolean | null
        registered_at?: string | null
        events?: unknown
        profiles?: unknown
      }) => {
        const eventData = Array.isArray(row.events) ? row.events[0] : row.events
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        return {
          registration_id: row.id,
          status: row.status ?? '',
          checked_in: row.checked_in ?? false,
          registered_at: row.registered_at ?? '',
          chapter_name: (eventData?.chapters as { name?: string } | null)?.name ?? '',
          member_name: profile?.full_name ?? '',
          member_email: profile?.email ?? '',
          school_or_company: profile?.school_or_company ?? '',
        }
      })

      const headers = [
        'registration_id',
        'status',
        'checked_in',
        'registered_at',
        'chapter_name',
        'member_name',
        'member_email',
        'school_or_company',
      ]

      const csv = buildCsv(headers, rows)
      const eventLabel = scope === 'event'
        ? events.find((event) => event.id === eventId)?.title
        : undefined
      const filename = buildExportFilename('attendance', eventLabel)
      downloadCsv(filename, csv)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export attendance.')
    } finally {
      setExportLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      await apiFetch(`/api/events/${id}`, { method: 'DELETE' })
      setEvents((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Events</h1>
          <p className="text-md3-body-md text-slate-500">View, create, and remove events across all chapters</p>
        </div>
        <button
          onClick={() => setSlideOver({ mode: 'create' })}
          className="flex items-center gap-2 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          Create Event
        </button>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-md3-title-md font-bold text-slate-900">Exports</h2>
            <p className="text-md3-label-md text-slate-400">Download event and attendance data as CSV</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openExportDialog('attendance')}
              disabled={exportLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue text-white text-md3-label-md font-bold hover:bg-blue-dark transition-colors disabled:opacity-60"
            >
              <DownloadOutline className="w-4 h-4" color="white" />
              Export Attendance CSV
            </button>
          </div>
        </div>

        {exportError && (
          <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mt-4">{exportError}</p>
        )}
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading events…</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <table className="w-full text-md3-body-md">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Event</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Chapter</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">XP</th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{event.title}</p>
                    {event.is_external && (
                      <span className="inline-flex items-center text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full mt-1">
                        External
                      </span>
                    )}
                    {event.location && (
                      <p className="text-md3-label-md text-slate-400 flex items-center gap-1 mt-0.5">
                        <MapPointOutline className="w-3 h-3 shrink-0" />
                        {event.location}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md">{event.chapter_id === null ? 'HQ — All Chapters' : (event.chapters?.name ?? '—')}</td>
                  <td className="px-4 py-3 text-slate-500 text-md3-label-md whitespace-nowrap">
                    {event.event_date
                      ? new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'TBA'}
                  </td>
                  <td className="px-4 py-3">
                    {event.is_external ? (
                      <span className="inline-flex items-center text-md3-label-md font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        External
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-md3-label-md font-semibold text-blue/80 bg-blue/10 px-2 py-0.5 rounded-full">
                        <BoltOutline className="w-3 h-3" />
                        {event.points_value}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      event.status === 'upcoming' ? 'bg-blue/10 text-blue'
                      : event.status === 'ongoing' ? 'bg-green/10 text-green'
                      : 'bg-slate-100 text-slate-500'
                    }`}>
                      {event.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmDeleteId === event.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-md3-label-md text-slate-500">Sure?</span>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-md3-label-md px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void handleDelete(event.id)}
                          disabled={deletingId === event.id}
                          className="text-md3-label-md px-2 py-1 rounded-lg bg-red text-white disabled:opacity-50"
                        >
                          {deletingId === event.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSlideOver({ mode: 'edit', event })}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue transition-colors"
                        >
                          <PenOutline className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(event.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                        >
                          <TrashBinTrashOutline className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No events found.</p>
          )}
        </div>
      )}

      <AnimatePresence>
        {exportDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeExportDialog}
              className="fixed inset-0 bg-black/30 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="fixed inset-0 z-50 flex items-center justify-center px-4"
            >
              <div className="w-full max-w-[520px] bg-white rounded-2xl border border-slate-200 shadow-2xl">
                <div className="p-5 border-b border-slate-100">
                <h3 className="text-md3-title-md font-bold text-slate-900">
                  Export {exportDialog.kind === 'events' ? 'Events' : 'Attendance'} CSV
                </h3>
                <p className="text-md3-label-md text-slate-400 mt-1">
                  Choose a scope for this export.
                </p>
                </div>

                <div className="p-5 space-y-4">
                <div>
                  <p className="text-md3-label-md font-bold uppercase tracking-wide text-slate-500 mb-2">Scope</p>
                  <div className="flex flex-col gap-2">
                    {(['all', 'event'] as ExportScope[]).map((scope) => (
                      <label key={scope} className="flex items-center gap-2 text-md3-body-md text-slate-700">
                        <input
                          type="radio"
                          name="export-scope"
                          value={scope}
                          checked={exportDialog.scope === scope}
                          onChange={() => setExportDialog((prev) => prev ? { ...prev, scope } : prev)}
                          className="w-4 h-4 accent-blue"
                        />
                        {scope === 'all' && 'All data'}
                        {scope === 'event' && 'Specific event'}
                      </label>
                    ))}
                  </div>
                </div>

                  {exportDialog.scope === 'event' && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Chapter</label>
                          <select
                            value={exportDialog.chapterId}
                            onChange={(event) =>
                              setExportDialog((prev) => prev ? {
                                ...prev,
                                chapterId: event.target.value,
                                eventId: '',
                              } : prev)
                            }
                            className={inputClass}
                          >
                            <option value="">All chapters</option>
                            {chapters.map((chapter) => (
                              <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Event Date</label>
                          <input
                            type="date"
                            value={exportDialog.eventDate}
                            onChange={(event) =>
                              setExportDialog((prev) => prev ? {
                                ...prev,
                                eventDate: event.target.value,
                                eventId: '',
                              } : prev)
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className={labelClass}>Event</label>
                        <input
                          type="text"
                          value={eventSearch}
                          onChange={(event) => setEventSearch(event.target.value)}
                          placeholder="Search events…"
                          className={inputClass}
                        />
                        <select
                          value={exportDialog.eventId}
                          onChange={(event) => setExportDialog((prev) => prev ? { ...prev, eventId: event.target.value } : prev)}
                          className={inputClass}
                        >
                          {filteredEventOptions.length === 0 && (
                            <option value="">No matching events</option>
                          )}
                          {filteredEventOptions.map((event) => (
                            <option key={event.id} value={event.id}>{getEventOptionLabel(event)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {exportDialog.kind === 'attendance' && (
                    <div>
                      <label className={labelClass}>Attendance Status</label>
                      <select
                        value={exportDialog.attendanceStatus}
                        onChange={(event) =>
                          setExportDialog((prev) => prev ? { ...prev, attendanceStatus: event.target.value as AttendanceFilter } : prev)
                        }
                        className={inputClass}
                      >
                        <option value="all">All</option>
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                        <option value="checked_in">Checked in</option>
                        <option value="not_checked_in">Not checked in</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 pb-5">
                  <button
                    type="button"
                    onClick={closeExportDialog}
                    className="px-4 py-2 rounded-xl text-md3-label-md font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      exportLoading ||
                      (exportDialog.scope === 'event' &&
                        (!exportDialog.eventId))
                    }
                    onClick={async () => {
                      if (exportDialog.kind === 'events') {
                        await handleExportEvents(
                          exportDialog.scope,
                          exportDialog.eventId,
                        )
                      } else {
                        await handleExportAttendance(
                          exportDialog.scope,
                          exportDialog.eventId,
                          exportDialog.attendanceStatus,
                        )
                      }
                      closeExportDialog()
                    }}
                    className="px-4 py-2 rounded-xl text-md3-label-md font-bold text-white bg-blue hover:bg-blue-dark transition-colors disabled:opacity-60"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Slide-over panel */}
      <AnimatePresence>
        {slideOver && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSlideOver(null)}
              className="fixed inset-0 bg-black/20 z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl z-50 overflow-y-auto"
            >
              <EventSlideOverForm
                mode={slideOver.mode}
                event={slideOver.event}
                chapters={chapters}
                onClose={() => setSlideOver(null)}
                onSaved={(savedEvent) => {
                  if (slideOver.mode === 'create') {
                    setEvents((prev) => [savedEvent, ...prev])
                  } else {
                    setEvents((prev) => prev.map((e) => e.id === savedEvent.id ? savedEvent : e))
                  }
                  setSlideOver(null)
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
