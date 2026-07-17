import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapPointOutline, TrashBinTrashOutline, BoltOutline, AddCircleOutline, PenOutline, CloseCircleLineDuotone, DownloadOutline, ConfettiOutline, ClipboardListOutline, AltArrowDownOutline, CheckCircleOutline, ShareOutline, EyeOutline, MagniferOutline, AltArrowUpOutline } from 'solar-icon-set'
import { AnimatePresence, motion } from 'framer-motion'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { apiFetch, publicFetch } from '../../lib/api'
import type { Event } from '@devcon-plus/supabase'
import { useChaptersStore } from '../../stores/useChaptersStore'
import { formatDate, toDatetimeLocalValue, fromDatetimeLocalValue, computeEventStatus } from '../../lib/dates'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import CoverImageUpload from '../../components/CoverImageUpload'
import { EventStatusBadge } from '../../components/EventStatusBadge'
import { DESCRIPTION_MIN_LENGTH, DESCRIPTION_MAX_LENGTH } from '../organizer/events/eventFormConstants'

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

// Custom registration form field (subset of events.custom_form_schema JSONB).
interface CustomFormField {
  id: string
  label: string
}

// Free-text "Other" answers are stored tagged with this prefix by EventRegister.
const OTHER_PREFIX = '__other__:'

// Unwrap a single stored response value, turning the "Other" prefix into readable text.
const formatResponseValue = (v: unknown): string => {
  const str = String(v)
  if (str.startsWith(OTHER_PREFIX)) {
    const text = str.slice(OTHER_PREFIX.length).trim()
    return text ? `${text} (Other)` : 'Other'
  }
  return str
}

// Flatten one registrant's stored answer for a field into a single CSV cell.
const formatResponseAnswer = (answer: unknown): string => {
  if (answer === undefined || answer === null || answer === '') return ''
  if (Array.isArray(answer)) return answer.map(formatResponseValue).join(', ')
  return formatResponseValue(answer)
}

const parseFormSchema = (raw: unknown): CustomFormField[] =>
  Array.isArray(raw)
    ? (raw as unknown[]).filter(
        (f): f is CustomFormField =>
          !!f && typeof f === 'object' && 'id' in f && 'label' in f,
      )
    : []

// ── Zod schema ─────────────────────────────────────────────────────────────────

const eventSchema = z
  .object({
    chapter_id: z.string().min(1, 'Chapter is required'),
    title: z.string().min(3, 'Title must be at least 3 characters'),
    description: z.string().min(DESCRIPTION_MIN_LENGTH, `Description must be at least ${DESCRIPTION_MIN_LENGTH} characters`).max(DESCRIPTION_MAX_LENGTH, 'Description must be under 5,000 characters'),
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
      'code_camp',
    ], { errorMap: () => ({ message: 'Please select a category' }) }),
    is_external: z.boolean().default(false),
    external_registration_url: z
      .string()
      .url('Enter a valid URL')
      .optional()
      .or(z.literal('')),
    url_is_tba: z.boolean().default(false),
    visibility: z.enum(['public', 'unlisted', 'draft']).default('public'),
    is_free: z.boolean().default(true),
    ticket_price_php: z.preprocess(
      (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
      z.number().int().positive('Price must be at least ₱1').optional()
    ),
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
    // End date is optional; when provided it must be after the start date.
    if (data.end_date && data.event_date && data.end_date <= data.event_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'End date must be after the start date',
      })
    }
    // Paid events must carry a price of at least ₱1.
    if (!data.is_external && !data.is_free && (data.ticket_price_php === undefined || data.ticket_price_php < 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ticket_price_php'],
        message: 'Price must be at least ₱1',
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

// ── Sort ───────────────────────────────────────────────────────────────────────

type SortColumn = 'title' | 'chapter' | 'date' | 'created' | 'creator' | 'xp' | 'status'
type SortDir = 'asc' | 'desc'

// Default ordering: newest first by event date, falling back to created_at.
const defaultEventTime = (event: EventWithChapter): number => {
  const value = event.event_date ?? event.created_at
  return value ? new Date(value).getTime() : 0
}

const eventTime = (value?: string | null): number => (value ? new Date(value).getTime() : 0)

const chapterLabel = (event: EventWithChapter): string =>
  event.chapter_id === null ? 'HQ — All Chapters' : (event.chapters?.name ?? '')

// ── Constants ──────────────────────────────────────────────────────────────────

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md3-body-md text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20'
const labelClass = 'block text-md3-label-md font-bold uppercase tracking-wide text-slate-500 mb-1.5'

const CATEGORY_OPTIONS: { value: EventFormData['category']; label: string }[] = [
  { value: 'tech_talk',  label: 'Tech Talk'  },
  { value: 'hackathon',  label: 'Hackathon'  },
  { value: 'workshop',   label: 'Workshop'   },
  { value: 'brown_bag',  label: 'Brown Bag'  },
  { value: 'code_camp',  label: 'Code Camp'  },
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

  // ── Scroll affordance ────────────────────────────────────────────────────
  // The panel is long; show a fading gradient + chevron at the bottom whenever
  // there is more content below the fold, hiding it once scrolled to the end.
  const scrollRef = useRef<HTMLFormElement>(null)
  const [showScrollHint, setShowScrollHint] = useState(false)

  const updateScrollHint = () => {
    const el = scrollRef.current
    if (!el) return
    setShowScrollHint(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
  }

  // ── Custom form fields state ─────────────────────────────────────────────────
  const [customFields, setCustomFields] = useState<CustomFormField[]>(() => {
    const raw = event?.custom_form_schema
    return Array.isArray(raw) ? (raw as CustomFormField[]) : []
  })
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({})

  // ── Cover image (managed by <CoverImageUpload />, kept here for submit) ────
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(event?.cover_image_url ?? null)

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
          event_date:        toDatetimeLocalValue(event.event_date),
          end_date:          toDatetimeLocalValue(event.end_date),
          category:          event.category ?? 'tech_talk',
          is_external:       event.is_external ?? false,
          external_registration_url: normalizeExternalUrl(event.external_registration_url),
          url_is_tba:        normalizeExternalUrl(event.external_registration_url) === '',
          visibility:        event.visibility ?? 'public',
          is_free:           event.is_free ?? true,
          ticket_price_php:  event.ticket_price_php || undefined,
          capacity:          event.capacity ?? undefined,
          points_value:      event.points_value ?? 200,
          requires_approval: event.requires_approval ?? false,
        }
      : {
          points_value:      200,
          requires_approval: false,
          is_free:           true,
          ticket_price_php:  undefined,
          is_external:       false,
          external_registration_url: '',
          url_is_tba:        true,
          visibility:        'public',
        },
  })

  const isFree = watch('is_free')
  const isExternal = watch('is_external')
  const descriptionLength = (watch('description') ?? '').length
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

  // Recompute the scroll affordance whenever the form's height changes
  // (sections toggle with isExternal / isFree, questions are added/removed).
  useEffect(() => {
    updateScrollHint()
  }, [isExternal, isFree, customFields.length, coverPreview])

  const onSubmit = async (data: EventFormData) => {
    setSubmitError(null)
    setCoverUploadError(null)
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
        // datetime-local values are naive local wall-clock — convert to a UTC ISO
        // instant so the event doesn't shift a day when rendered in local time.
        event_date: fromDatetimeLocalValue(data.event_date) ?? data.event_date,
        end_date: fromDatetimeLocalValue(data.end_date),
        capacity: data.capacity ?? null,
        ticket_price_php: data.is_free ? 0 : (data.ticket_price_php ?? 0),
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
    <div className="relative flex flex-col h-full">
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
      <form
        ref={scrollRef}
        noValidate
        onScroll={updateScrollHint}
        onSubmit={handleSubmit(onSubmit)}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >

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
            <div className="flex justify-end mt-1">
              <span
                className={`text-md3-label-sm font-mono ${
                  descriptionLength > DESCRIPTION_MAX_LENGTH ? 'text-red font-semibold' : 'text-slate-400'
                }`}
              >
                {descriptionLength > 0 && descriptionLength < DESCRIPTION_MIN_LENGTH && (
                  <span>min {DESCRIPTION_MIN_LENGTH} · </span>
                )}
                {descriptionLength} / {DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
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

          <CoverImageUpload
            initialPreviewUrl={event?.cover_image_url}
            onChange={({ file, previewUrl }) => {
              setCoverFile(file)
              setCoverPreview(previewUrl)
            }}
            error={coverUploadError}
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
                  No link yet — members will see a disabled{' '}
                  <span className="font-semibold">“Registration Coming Soon”</span> button on the
                  event page until you add one.
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
              <label className={labelClass}>Start Date & Time <span className="text-red normal-case">*</span></label>
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
              <label className={labelClass}>
                End Date & Time{' '}
                <span className="text-slate-300 normal-case font-normal">optional</span>
              </label>
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
                      disabled
                      title="Coming soon"
                      className="flex-1 py-2 rounded-xl text-md3-label-md font-semibold border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      Paid
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber/15 text-amber">
                        Soon
                      </span>
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
                    placeholder="500"
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
            <label className={labelClass}>XP Points Value <span className="text-red normal-case">*</span></label>
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
              <div className="flex flex-col items-center justify-center text-center py-6 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                  <ClipboardListOutline color="#94A3B8" width={20} height={20} />
                </div>
                <p className="text-md3-body-md font-semibold text-slate-500">No extra questions yet</p>
                <p className="text-md3-label-md text-slate-400 mt-0.5">
                  Only name, email, and school/company will be collected. Add a question to gather more.
                </p>
              </div>
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

      {/* Scroll affordance — fades in when more content sits below the fold */}
      <div
        aria-hidden="true"
        style={{ opacity: showScrollHint ? 1 : 0 }}
        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-gradient-to-t from-white via-white/85 to-transparent transition-opacity duration-300"
      >
        <span className="animate-bounce pb-3">
          <AltArrowDownOutline color="#94A3B8" width={20} height={20} />
        </span>
      </div>
    </div>
  )
}

// ── AdminEvents ────────────────────────────────────────────────────────────────

export default function AdminEvents() {
  const [events, setEvents] = useState<EventWithChapter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EventWithChapter | null>(null)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [slideOver, setSlideOver] = useState<{ mode: 'create' | 'edit'; event?: EventWithChapter } | null>(null)
  const [createdEvent, setCreatedEvent] = useState<EventWithChapter | null>(null)
  const [shareCopiedId, setShareCopiedId] = useState<string | null>(null)
  const { chapters, fetchChapters } = useChaptersStore()
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({})
  const creatorLabel = (event: EventWithChapter): string => creatorNames[event.created_by ?? ''] ?? '—'
  const [exportDialog, setExportDialog] = useState<ExportDialogState | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [eventSearch, setEventSearch] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  // Auto-open the create slide-over when arriving from the Admin Dashboard's
  // "Create Event" button (navigate('/admin/events', { state: { openCreate: true } })).
  // Clear the router state afterwards so a refresh/back doesn't reopen it.
  useEffect(() => {
    if ((location.state as { openCreate?: boolean } | null)?.openCreate) {
      setSlideOver({ mode: 'create' })
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

  // Table tab (DEVCON vs external), search + sort (separate from the export
  // dialog's `eventSearch`).
  const [eventTab, setEventTab] = useState<'devcon' | 'external'>('devcon')
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const devconCount = events.filter((e) => !e.is_external).length
  const externalCount = events.filter((e) => e.is_external).length

  // Split by tab, then filter by title/chapter/location/category/status, then
  // sort. With no active column the list stays newest-first; clicking a header
  // sorts by that column.
  const visibleEvents = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = events.filter((e) => (eventTab === 'external' ? !!e.is_external : !e.is_external))
    const matched = q
      ? base.filter((e) =>
          e.title.toLowerCase().includes(q) ||
          chapterLabel(e).toLowerCase().includes(q) ||
          (e.location ?? '').toLowerCase().includes(q) ||
          (e.category ?? '').toLowerCase().includes(q) ||
          computeEventStatus(e).includes(q) ||
          creatorLabel(e).toLowerCase().includes(q),
        )
      : base
    return [...matched].sort((a, b) => {
      if (sortColumn === null) return defaultEventTime(b) - defaultEventTime(a)
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortColumn) {
        case 'title': return a.title.localeCompare(b.title) * dir
        case 'chapter': return chapterLabel(a).localeCompare(chapterLabel(b)) * dir
        case 'date': return (eventTime(a.event_date) - eventTime(b.event_date)) * dir
        case 'created': return (eventTime(a.created_at) - eventTime(b.created_at)) * dir
        case 'creator': return creatorLabel(a).localeCompare(creatorLabel(b)) * dir
        case 'xp': return (a.points_value - b.points_value) * dir
        case 'status': return computeEventStatus(a).localeCompare(computeEventStatus(b)) * dir
        default: return 0
      }
    })
  }, [events, search, sortColumn, sortDir, eventTab, creatorNames])

  const { pageItems, ...pagination } = usePagination(visibleEvents, 10)

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

  // Public, member-facing URL for an event (matches the /events/:slug route).
  const buildEventUrl = (event: EventWithChapter) =>
    `${window.location.origin}/events/${event.slug ?? event.id}`

  // Share an event link — native share sheet where available, clipboard fallback
  // otherwise (mirrors the member-side EventDetail share behaviour).
  const shareEvent = async (event: EventWithChapter) => {
    const url = buildEventUrl(event)
    if ('share' in navigator) {
      try {
        await navigator.share({ title: event.title, text: `${event.title} — DEVCON+`, url })
      } catch {
        // user cancelled — do nothing
      }
    } else {
      try {
        await (navigator as Navigator).clipboard.writeText(url)
        setShareCopiedId(event.id)
        setTimeout(() => setShareCopiedId((id) => (id === event.id ? null : id)), 2500)
      } catch {
        // clipboard unavailable
      }
    }
  }

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

        const [eventRows, chapterRows, creatorRows] = await Promise.all([
          publicFetch<Event[]>('/api/events'),
          publicFetch<{ id: string; name: string }[]>('/api/chapters'),
          apiFetch<{ id: string; full_name: string }[]>('/api/admin/events/creators'),
        ])
        setEvents(eventRows.map((event) => attachChapterName(event, chapterRows)))
        setCreatorNames(Object.fromEntries(creatorRows.map((c) => [c.id, c.full_name])))
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
        .select('event_date, end_date, location, category, visibility, is_free, ticket_price_php, capacity, points_value, requires_approval, is_external, external_registration_url, created_at, chapters(name)')
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
        status: computeEventStatus(event),
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
        .select('id, status, checked_in, registered_at, event_id, form_responses, events(title, custom_form_schema, chapters(name)), profiles(full_name, email, school_or_company)')
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

      const dataRows = (data ?? []) as Array<{
        id?: string
        status?: string | null
        checked_in?: boolean | null
        registered_at?: string | null
        form_responses?: Record<string, unknown> | null
        events?: unknown
        profiles?: unknown
      }>

      const baseHeaders = [
        'registration_id',
        'status',
        'checked_in',
        'registered_at',
        'chapter_name',
        'member_name',
        'member_email',
        'school_or_company',
      ]

      const toBaseRow = (row: (typeof dataRows)[number]): AttendanceExportRow => {
        const eventData = Array.isArray(row.events) ? row.events[0] : row.events
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        return {
          registration_id: row.id ?? '',
          status: row.status ?? '',
          checked_in: row.checked_in ?? false,
          registered_at: row.registered_at ?? '',
          chapter_name: (eventData as { chapters?: { name?: string } | null } | null)?.chapters?.name ?? '',
          member_name: (profile as { full_name?: string } | null)?.full_name ?? '',
          member_email: (profile as { email?: string } | null)?.email ?? '',
          school_or_company: (profile as { school_or_company?: string } | null)?.school_or_company ?? '',
        }
      }

      const schemaOf = (row: (typeof dataRows)[number]): CustomFormField[] => {
        const eventData = Array.isArray(row.events) ? row.events[0] : row.events
        return parseFormSchema((eventData as { custom_form_schema?: unknown } | null)?.custom_form_schema)
      }

      let headers: string[]
      let rows: AttendanceExportRow[]

      if (scope === 'event') {
        // Single event → one column per custom question (header = question label).
        const schema = dataRows.length ? schemaOf(dataRows[0]) : []
        // De-dupe labels so headers stay unique and don't collide with base columns.
        const used = new Set(baseHeaders)
        const columns = schema.map((field) => {
          const original = field.label || field.id
          let header = original
          let n = 2
          while (used.has(header)) header = `${original} (${n++})`
          used.add(header)
          return { id: field.id, header }
        })
        headers = [...baseHeaders, ...columns.map((c) => c.header)]
        rows = dataRows.map((row) => {
          const base = toBaseRow(row)
          const responses = row.form_responses ?? {}
          for (const col of columns) base[col.header] = formatResponseAnswer(responses[col.id])
          return base
        })
      } else {
        // All events → schemas differ per event, so collapse answers into one column.
        headers = [...baseHeaders, 'responses']
        rows = dataRows.map((row) => {
          const base = toBaseRow(row)
          const responses = row.form_responses ?? {}
          base.responses = schemaOf(row)
            .map((field) => {
              const answer = formatResponseAnswer(responses[field.id])
              return answer ? `${field.label}: ${answer}` : null
            })
            .filter(Boolean)
            .join(' | ')
          return base
        })
      }

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
      setDeleteTarget(null)
      setDeleteConfirmInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Events</h1>
          <p className="text-md3-body-md text-slate-500">View, create, and remove events across all chapters</p>
        </div>
        <button
          onClick={() => setSlideOver({ mode: 'create' })}
          className="flex items-center gap-2.5 px-4 sm:px-6 py-3 bg-blue text-white text-md3-body-lg font-bold rounded-xl hover:bg-blue-dark active:scale-95 transition-colors"
        >
          <AddCircleOutline className="w-6 h-6" />
          <span className="hidden sm:inline">Create Event</span>
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
              className="flex items-center gap-2.5 px-4 sm:px-6 py-3 rounded-xl bg-blue text-white text-md3-body-lg font-bold hover:bg-blue-dark active:scale-95 transition-colors disabled:opacity-60"
            >
              <DownloadOutline className="w-6 h-6" color="white" />
              <span className="hidden sm:inline">Export Attendance CSV</span>
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
        <>
        <div className="flex items-center gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit shrink-0">
          {([['devcon', 'DEVCON Events', devconCount], ['external', 'External Events', externalCount]] as const).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setEventTab(key); pagination.setPage(1) }}
              className={`px-4 py-1.5 rounded-lg text-md3-label-md font-bold transition-colors ${
                eventTab === key ? 'bg-white text-blue shadow-card' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
              <span className="ml-1.5 text-md3-label-sm font-semibold opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <div className="relative mb-4 shrink-0">
          <MagniferOutline color="#94A3B8" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Search by title, chapter, or location…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); pagination.setPage(1) }}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue/30 bg-white"
          />
        </div>
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('title')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Event {sortIcon('title')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('chapter')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Chapter {sortIcon('chapter')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('date')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Date {sortIcon('date')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('created')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Created {sortIcon('created')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('creator')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Created By {sortIcon('creator')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('xp')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">XP {sortIcon('xp')}</button>
                </th>
                <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-slate-700 transition-colors">Status {sortIcon('status')}</button>
                </th>
                <th className="text-right px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((event) => (
                <tr key={event.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3">
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
                  <td className="px-4 py-3 text-slate-500 text-md3-label-md whitespace-nowrap">
                    {event.created_at ? formatDate.short(event.created_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-md3-label-md whitespace-nowrap">
                    {creatorLabel(event)}
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
                    <EventStatusBadge status={computeEventStatus(event)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => void shareEvent(event)}
                        title={shareCopiedId === event.id ? 'Link copied!' : 'Share event link'}
                        aria-label={shareCopiedId === event.id ? 'Link copied!' : 'Share event link'}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue transition-colors"
                      >
                        {shareCopiedId === event.id
                          ? <CheckCircleOutline className="w-4 h-4" color="#21C45D" />
                          : <ShareOutline className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => window.open(`/wheel/${event.id}`, '_blank', 'noopener')}
                        title="Open raffle wheel"
                        aria-label="Open raffle wheel"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        <ConfettiOutline className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSlideOver({ mode: 'edit', event })}
                        title="Edit event"
                        aria-label="Edit event"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue transition-colors"
                      >
                        <PenOutline className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(event); setDeleteConfirmInput('') }}
                        title="Delete event"
                        aria-label="Delete event"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                      >
                        <TrashBinTrashOutline className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleEvents.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">
              {search.trim()
                ? `No events match "${search.trim()}".`
                : eventTab === 'external' ? 'No external events yet.' : 'No DEVCON events yet.'}
            </p>
          )}
          </div>
          <Pagination controller={pagination} itemLabel="event" className="border-t border-slate-100 shrink-0" />
        </div>
        </>
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
                  const wasCreate = slideOver.mode === 'create'
                  if (wasCreate) {
                    setEvents((prev) => [savedEvent, ...prev])
                  } else {
                    setEvents((prev) => prev.map((e) => e.id === savedEvent.id ? savedEvent : e))
                  }
                  setSlideOver(null)
                  if (wasCreate) setCreatedEvent(savedEvent)
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create-success modal */}
      <AnimatePresence>
        {createdEvent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreatedEvent(null)}
              className="fixed inset-0 bg-black/40 z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', damping: 26, stiffness: 360 }}
              onClick={() => setCreatedEvent(null)}
              className="fixed inset-0 z-[61] flex items-center justify-center p-4"
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                className="w-[90vw] max-w-sm bg-white rounded-3xl shadow-2xl p-6"
              >
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-green/10 flex items-center justify-center mb-3">
                  <CheckCircleOutline color="#21C45D" width={32} height={32} />
                </div>
                <h2 className="text-md3-headline-sm font-bold text-slate-900">Event created!</h2>
                <p className="text-md3-body-md text-slate-500 mt-1">
                  <span className="font-semibold text-slate-700">{createdEvent.title}</span> is live. What next?
                </p>
              </div>

              <div className="mt-5 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const ev = createdEvent
                    setCreatedEvent(null)
                    setSlideOver({ mode: 'edit', event: ev })
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 text-left hover:border-blue hover:bg-blue/5 transition-colors"
                >
                  <span className="w-9 h-9 rounded-lg bg-blue/10 flex items-center justify-center shrink-0">
                    <PenOutline color="#1152D4" width={18} height={18} />
                  </span>
                  <span>
                    <span className="block text-md3-body-md font-semibold text-slate-900">Edit event</span>
                    <span className="block text-md3-label-md text-slate-400">Tweak the details you just saved</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void shareEvent(createdEvent)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 text-left hover:border-blue hover:bg-blue/5 transition-colors"
                >
                  <span className="w-9 h-9 rounded-lg bg-blue/10 flex items-center justify-center shrink-0">
                    <ShareOutline color="#1152D4" width={18} height={18} />
                  </span>
                  <span>
                    <span className="block text-md3-body-md font-semibold text-slate-900">
                      {shareCopiedId === createdEvent.id ? 'Link copied!' : 'Share event link'}
                    </span>
                    <span className="block text-md3-label-md text-slate-400">Send the public event page to members</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => window.open(buildEventUrl(createdEvent), '_blank', 'noopener')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 text-left hover:border-blue hover:bg-blue/5 transition-colors"
                >
                  <span className="w-9 h-9 rounded-lg bg-blue/10 flex items-center justify-center shrink-0">
                    <EyeOutline color="#1152D4" width={18} height={18} />
                  </span>
                  <span>
                    <span className="block text-md3-body-md font-semibold text-slate-900">View event page</span>
                    <span className="block text-md3-label-md text-slate-400">Preview how members will see it</span>
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCreatedEvent(null)}
                className="w-full mt-3 py-3 text-md3-label-lg font-bold text-slate-500 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Done
              </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete-confirmation modal */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (deletingId !== deleteTarget.id) { setDeleteTarget(null); setDeleteConfirmInput('') } }}
              className="fixed inset-0 bg-black/40 z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', damping: 26, stiffness: 360 }}
              className="fixed inset-0 z-[61] flex items-center justify-center p-4"
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                className="w-[90vw] max-w-sm bg-white rounded-3xl shadow-2xl p-6"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-full bg-red/10 flex items-center justify-center mb-3">
                    <TrashBinTrashOutline color="#EF4444" width={28} height={28} />
                  </div>
                  <h2 className="text-md3-headline-sm font-bold text-slate-900">Delete this event?</h2>
                  <p className="text-md3-body-md text-slate-500 mt-1">
                    You will permanently lose <span className="font-semibold text-slate-700">{deleteTarget.title}</span>{' '}
                    and all of its registrations, QR tickets, volunteer applications, and announcements. This cannot be undone.
                  </p>
                </div>

                <div className="mt-5">
                  <label className="block text-md3-label-md font-semibold text-slate-500 mb-1.5">
                    Type <span className="font-bold text-slate-700">{deleteTarget.title}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    placeholder={deleteTarget.title}
                    autoFocus
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-md3-body-md focus:outline-none focus:ring-2 focus:ring-red/30"
                  />
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setDeleteTarget(null); setDeleteConfirmInput('') }}
                    disabled={deletingId === deleteTarget.id}
                    className="flex-1 py-3 text-md3-label-lg font-bold text-slate-600 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(deleteTarget.id)}
                    disabled={deleteConfirmInput !== deleteTarget.title || deletingId === deleteTarget.id}
                    className="flex-1 py-3 text-md3-label-lg font-bold text-white rounded-xl bg-red hover:bg-red/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deletingId === deleteTarget.id ? 'Deleting…' : 'Delete event'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
