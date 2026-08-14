import { useState } from 'react'
import {
  Controller,
  type Control,
  type UseFormRegister,
  type FieldErrors,
  type UseFormWatch,
  type UseFormSetValue,
} from 'react-hook-form'
import { Reorder, useDragControls } from 'framer-motion'
import {
  AddCircleOutline,
  TrashBinTrashOutline,
  CloseCircleLineDuotone,
  HamburgerMenuOutline,
} from 'solar-icon-set'
import { z } from 'zod'
import type { DevconCategory } from '@devcon-plus/supabase'

// ── Points defaults by category ───────────────────────────────────────────────
export const ATTENDANCE_PTS = {
  tech_talk:   5,
  networking:  5,
  social:      5,
  code_camp:   50,
  workshop:    150,
  brown_bag:   150,
  hackathon:   150,
  summit:      500,
} as const

export const DEFAULT_VOLUNTEER_POINTS = 500

// ── Custom form field types ───────────────────────────────────────────────────

export type CustomFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'radio'

export interface CustomFormField {
  id: string
  label: string
  type: CustomFieldType
  required: boolean
  options: string[]
  /** For choice fields (select/radio/checkbox): show an "Other" choice that reveals a free-text input. */
  allowOther?: boolean
}

// ── Zod schema ────────────────────────────────────────────────────────────────

// Single source of truth for tag length — used in both schema validation and the UI input
export const TAG_MAX_LENGTH = 20

// Single source of truth for description length — MUST match the NestJS gateway's
// @MaxLength(5000) on CreateEventDto.description, so the client blocks + indicates the
// same ceiling the backend enforces (otherwise an over-limit description 400s silently).
export const DESCRIPTION_MAX_LENGTH = 5000
export const DESCRIPTION_MIN_LENGTH = 30

// Attendance-XP ceilings by role. Admins keep the original ceiling; chapter
// officers are capped lower so they can't over-award points.
export const MAX_XP_ADMIN = 1000
export const MAX_XP_OFFICER = 350

// The schema is parameterized by the XP ceiling so each organizer page can build
// a role-scoped validator (chapter officers cap at 350, admins at 1000).
export function makeEventSchema(xpMax: number) {
  return z
  .object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be under 100 characters'),
    description: z.string().min(DESCRIPTION_MIN_LENGTH, `Description must be at least ${DESCRIPTION_MIN_LENGTH} characters`).max(DESCRIPTION_MAX_LENGTH, 'Description must be under 5,000 characters'),
    location: z.string().min(2, 'Location is required').max(200, 'Location must be under 200 characters'),
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
    ], { required_error: 'Category is required' }),
    devcon_category: z.enum(['devcon', 'she', 'kids', 'campus']).optional().nullable(),
    tags: z.array(z.string().max(TAG_MAX_LENGTH)).max(10).default([]),
    visibility: z.enum(['public', 'unlisted', 'draft']).default('public'),
    is_free: z.boolean().default(true),
    ticket_price_php: z.number({ coerce: true }).int().min(0).max(100000, 'Price cannot exceed ₱100,000').default(0),
    capacity: z.preprocess(
      (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
      z.number().int().positive().max(100000, 'Capacity cannot exceed 100,000').optional()
    ),
    no_show_buffer: z.preprocess(
      (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
      z.number().int().min(0).max(10000, 'Buffer cannot exceed 10,000').optional()
    ).default(10),
    registration_closed: z.boolean().default(false),
    points_value: z
      .number({ coerce: true })
      .min(1, 'Minimum 1 XP')
      .max(xpMax, `Maximum ${xpMax} XP`),
    volunteer_points: z
      .number({ coerce: true })
      .min(0, 'Cannot be negative')
      .max(1000, 'Maximum 1000 XP'),
    requires_approval: z.boolean(),
    is_chapter_locked: z.boolean(),
    chapter_id: z.string(),
    cover_image_url: z.string().url().optional().or(z.literal('')),
    poster_image_url: z.string().url().optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.end_date && data.event_date && data.end_date <= data.event_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'End time must be after start time',
      })
    }
  })
}

// Default instance drives the FormData type and is the admin ceiling.
export const schema = makeEventSchema(MAX_XP_ADMIN)

export type FormData = z.infer<typeof schema>

// ── Styles ────────────────────────────────────────────────────────────────────

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-md3-body-md text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/20'

export const labelClass = 'block text-md3-label-md font-bold uppercase tracking-wide text-slate-500 mb-1.5'

// ── Options ───────────────────────────────────────────────────────────────────

export const CATEGORY_OPTIONS: { value: FormData['category']; label: string }[] = [
  { value: 'tech_talk',  label: 'Tech Talk'  },
  { value: 'hackathon',  label: 'Hackathon'  },
  { value: 'workshop',   label: 'Workshop'   },
  { value: 'brown_bag',  label: 'Brown Bag'  },
  { value: 'code_camp',  label: 'Code Camp'  },
  { value: 'summit',     label: 'Summit'     },
  { value: 'social',     label: 'Social'     },
  { value: 'networking', label: 'Networking' },
]

export const DEVCON_PROGRAM_OPTIONS: {
  value: DevconCategory
  label: string
  hex: string
  darkText?: boolean
}[] = [
  { value: 'devcon', label: 'DEVCON',        hex: '#1152D4' },
  { value: 'she',    label: '#SheIsDEVCON',  hex: '#EC4899' },
  { value: 'kids',   label: 'DEVCON Kids',   hex: '#21C45D' },
  { value: 'campus', label: 'Campus DEVCON', hex: '#F8C630', darkText: true },
]

export const VISIBILITY_OPTIONS: { value: FormData['visibility']; label: string }[] = [
  { value: 'public',   label: 'Public'   },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'draft',    label: 'Draft'    },
]

// ── TicketPriceField ───────────────────────────────────────────────────────────
// Shared Free/Paid control. Paid is a permanent "Coming Soon" placeholder — ticket
// sales aren't live yet on either the organizer or admin event forms. Kept as a
// disabled option (rather than removed) so the toggle communicates the roadmap
// intent and an already-paid legacy event still shows its stored price below.

export function TicketPriceField({
  control,
  register,
  errors,
  isFree,
}: {
  control: Control<FormData>
  register: UseFormRegister<FormData>
  errors: FieldErrors<FormData>
  isFree: boolean
}) {
  return (
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
              placeholder="0"
            />
          </div>
          {errors.ticket_price_php && (
            <p className="text-md3-label-md text-red mt-1">{errors.ticket_price_php.message}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── NoShowBufferField ─────────────────────────────────────────────────────────
// Toggle + number input. Off = no_show_buffer stored as 0 (buffer disabled — see
// EventRegistrants.tsx, which already hides all buffer UI when no_show_buffer is 0).
// On = restores the last-entered amount (default 10) into the visible number field.

export function NoShowBufferField({
  register,
  errors,
  watch,
  setValue,
}: {
  register: UseFormRegister<FormData>
  errors: FieldErrors<FormData>
  watch: UseFormWatch<FormData>
  setValue: UseFormSetValue<FormData>
}) {
  const bufferValue = watch('no_show_buffer')
  const enabled = !!bufferValue && bufferValue > 0
  const [lastValue, setLastValue] = useState(enabled ? bufferValue! : 10)

  return (
    <div>
      <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
        <input
          type="checkbox"
          id="no_show_buffer_enabled"
          checked={enabled}
          onChange={(e) => {
            if (e.target.checked) {
              setValue('no_show_buffer', lastValue || 10, { shouldValidate: true, shouldDirty: true })
            } else {
              if (bufferValue) setLastValue(bufferValue)
              setValue('no_show_buffer', 0, { shouldValidate: true, shouldDirty: true })
            }
          }}
          className="w-4 h-4 accent-blue rounded"
        />
        <div>
          <label
            htmlFor="no_show_buffer_enabled"
            className="text-md3-body-md font-semibold text-slate-900 cursor-pointer"
          >
            Enable No-Show Buffer
          </label>
          <p className="text-md3-label-md text-slate-400 mt-0.5">
            Let officers keep approving a few registrations past Capacity, to cover expected no-shows.
          </p>
        </div>
      </div>

      {enabled && (
        <div className="mt-3">
          <label className={labelClass}>No-Show Buffer</label>
          <input
            {...register('no_show_buffer')}
            type="number"
            min={1}
            step={1}
            className={inputClass}
            placeholder="10"
          />
          {errors.no_show_buffer && (
            <p className="text-md3-label-md text-red mt-1">{errors.no_show_buffer.message}</p>
          )}
          <p className="text-md3-label-md text-slate-400 mt-1">
            Officers can still approve this many registrations past Capacity. Approvals stop once
            Capacity + Buffer is reached.
          </p>
        </div>
      )}
    </div>
  )
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-t border-slate-100 pt-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">{title}</p>
    </div>
  )
}

// ── CustomFieldsBuilder ────────────────────────────────────────────────────────
// Shared controlled component used by EventCreate and EventEdit.
// Parent owns `customFields` state; this component manages option draft inputs internally.

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text',     label: 'Short Text'   },
  { value: 'textarea', label: 'Long Text'    },
  { value: 'select',   label: 'Dropdown'     },
  { value: 'radio',    label: 'Radio'        },
  { value: 'checkbox', label: 'Checkboxes'   },
]

const hasOptions = (type: CustomFieldType) =>
  type === 'select' || type === 'radio' || type === 'checkbox'

// One reorderable question card. Extracted so each card can own its own
// `useDragControls()` — drag is started ONLY from the handle (`dragListener={false}`),
// so the label input / select / option chips stay normally interactive.
function QuestionCard({
  field,
  index,
  optionDraft,
  onOptionDraftChange,
  onUpdate,
  onRemove,
  onAddOption,
  onRemoveOption,
  onMove,
}: {
  field: CustomFormField
  index: number
  optionDraft: string
  onOptionDraftChange: (value: string) => void
  onUpdate: (patch: Partial<CustomFormField>) => void
  onRemove: () => void
  onAddOption: () => void
  onRemoveOption: (opt: string) => void
  onMove: (from: number, to: number) => void
}) {
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      as="div"
      value={field.id}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(15,23,42,0.14)', zIndex: 20 }}
      className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {/* Drag handle — pointer drag + arrow-key reorder for keyboard users */}
          <button
            type="button"
            title="Drag to reorder (or focus and use ↑ / ↓)"
            aria-label={`Reorder question ${index + 1}. Press arrow up or arrow down to move it.`}
            onPointerDown={(e) => {
              e.preventDefault()
              dragControls.start(e)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                onMove(index, index - 1)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                onMove(index, index + 1)
              }
            }}
            className="w-6 h-6 -ml-1 rounded-md flex items-center justify-center touch-none cursor-grab active:cursor-grabbing hover:bg-blue/10 focus:outline-none focus:ring-1 focus:ring-blue/40 transition-colors"
          >
            <HamburgerMenuOutline className="w-3.5 h-3.5" color="#94A3B8" />
          </button>
          <span className="text-md3-label-md font-bold text-slate-400 uppercase tracking-wide">
            Question {index + 1}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red hover:bg-red/10 transition-colors"
        >
          <TrashBinTrashOutline className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Label */}
      <input
        value={field.label}
        onChange={e => onUpdate({ label: e.target.value })}
        placeholder="Question label"
        className={inputClass}
      />

      {/* Type + Required row */}
      <div className="flex gap-2">
        <select
          value={field.type}
          onChange={e => onUpdate({ type: e.target.value as CustomFieldType, options: [], allowOther: false })}
          className={`${inputClass} flex-1`}
        >
          {FIELD_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-md3-label-md text-slate-600 font-medium shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={e => onUpdate({ required: e.target.checked })}
            className="w-3.5 h-3.5 accent-blue"
          />
          Required
        </label>
      </div>

      {/* Options (select / radio / checkbox only) */}
      {hasOptions(field.type) && (
        <div className="space-y-2">
          {field.options.map(opt => (
            <div key={opt} className="flex items-center gap-2">
              <span className="flex-1 text-md3-body-md text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                {opt}
              </span>
              <button
                type="button"
                onClick={() => onRemoveOption(opt)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red hover:bg-red/10 transition-colors"
              >
                <CloseCircleLineDuotone className="w-3.5 h-3.5" color="#EF4444" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={optionDraft}
              onChange={e => onOptionDraftChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddOption() } }}
              placeholder="Add option, press Enter"
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={onAddOption}
              className="w-9 h-9 rounded-xl bg-blue text-white flex items-center justify-center shrink-0"
            >
              <AddCircleOutline className="w-4 h-4" />
            </button>
          </div>

          {/* Allow "Other" free-text choice */}
          <label className="flex items-center gap-1.5 text-md3-label-md text-slate-600 font-medium cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={field.allowOther ?? false}
              onChange={e => onUpdate({ allowOther: e.target.checked })}
              className="w-3.5 h-3.5 accent-blue"
            />
            Add an “Other…” option (lets people type their own answer)
          </label>
        </div>
      )}
    </Reorder.Item>
  )
}

export function CustomFieldsBuilder({
  customFields,
  setCustomFields,
}: {
  customFields: CustomFormField[]
  setCustomFields: React.Dispatch<React.SetStateAction<CustomFormField[]>>
}) {
  // Per-field option draft inputs (keyed by field id)
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({})

  const addField = () => {
    setCustomFields(prev => [
      ...prev,
      { id: Math.random().toString(36).substring(2, 11), label: '', type: 'text', required: false, options: [], allowOther: false },
    ])
  }

  const removeField = (id: string) => {
    setCustomFields(prev => prev.filter(f => f.id !== id))
    setOptionDrafts(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  const updateField = (id: string, patch: Partial<CustomFormField>) => {
    setCustomFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  }

  const addOption = (fieldId: string) => {
    const val = (optionDrafts[fieldId] ?? '').trim()
    if (!val) return
    updateField(fieldId, {
      options: [...(customFields.find(f => f.id === fieldId)?.options ?? []), val],
    })
    setOptionDrafts(prev => ({ ...prev, [fieldId]: '' }))
  }

  const removeOption = (fieldId: string, opt: string) => {
    updateField(fieldId, {
      options: (customFields.find(f => f.id === fieldId)?.options ?? []).filter(o => o !== opt),
    })
  }

  // Drag-and-drop reorder. Reorder.Group tracks ids (not the field objects) so
  // editing a field mid-list never breaks the identity framer-motion reorders by.
  const reorderFields = (ids: string[]) => {
    setCustomFields(prev => {
      const byId = new Map(prev.map(f => [f.id, f]))
      return ids
        .map(id => byId.get(id))
        .filter((f): f is CustomFormField => f !== undefined)
    })
  }

  // Keyboard reorder (↑ / ↓ on the focused drag handle)
  const moveField = (from: number, to: number) => {
    setCustomFields(prev => {
      if (from === to || to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {customFields.length > 1 && (
        <p className="text-md3-label-md text-slate-400">
          Drag the handle to reorder questions — members see them in this order.
        </p>
      )}

      <Reorder.Group
        as="div"
        axis="y"
        values={customFields.map(f => f.id)}
        onReorder={reorderFields}
        className="space-y-3"
      >
        {customFields.map((field, idx) => (
          <QuestionCard
            key={field.id}
            field={field}
            index={idx}
            optionDraft={optionDrafts[field.id] ?? ''}
            onOptionDraftChange={value => setOptionDrafts(prev => ({ ...prev, [field.id]: value }))}
            onUpdate={patch => updateField(field.id, patch)}
            onRemove={() => removeField(field.id)}
            onAddOption={() => addOption(field.id)}
            onRemoveOption={opt => removeOption(field.id, opt)}
            onMove={moveField}
          />
        ))}
      </Reorder.Group>

      <button
        type="button"
        onClick={addField}
        className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-blue hover:text-blue text-md3-label-md font-semibold flex items-center justify-center gap-1.5 transition-colors"
      >
        <AddCircleOutline className="w-3.5 h-3.5" />
        Add Question
      </button>
    </div>
  )
}
