import { useState } from 'react'
import { AddCircleOutline, TrashBinTrashOutline, CloseCircleLineDuotone } from 'solar-icon-set'
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
}

// ── Zod schema ────────────────────────────────────────────────────────────────

// Single source of truth for tag length — used in both schema validation and the UI input
export const TAG_MAX_LENGTH = 20

export const schema = z
  .object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be under 100 characters'),
    description: z.string().min(10, 'Description must be at least 10 characters').max(1000, 'Description must be under 1,000 characters'),
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
    points_value: z
      .number({ coerce: true })
      .min(1, 'Minimum 1 XP')
      .max(1000, 'Maximum 1000 XP'),
    volunteer_points: z
      .number({ coerce: true })
      .min(0, 'Cannot be negative')
      .max(1000, 'Maximum 1000 XP'),
    requires_approval: z.boolean(),
    is_chapter_locked: z.boolean(),
    chapter_id: z.string().min(1, 'Chapter is required'),
    cover_image_url: z.string().url().optional().or(z.literal('')),
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
      { id: Math.random().toString(36).substring(2, 11), label: '', type: 'text', required: false, options: [] },
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

  const hasOptions = (type: CustomFieldType) =>
    type === 'select' || type === 'radio' || type === 'checkbox'

  return (
    <div className="space-y-3">
      {customFields.map((field, idx) => (
        <div key={field.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-md3-label-md font-bold text-slate-400 uppercase tracking-wide">
              Question {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => removeField(field.id)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red hover:bg-red/10 transition-colors"
            >
              <TrashBinTrashOutline className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Label */}
          <input
            value={field.label}
            onChange={e => updateField(field.id, { label: e.target.value })}
            placeholder="Question label"
            className={inputClass}
          />

          {/* Type + Required row */}
          <div className="flex gap-2">
            <select
              value={field.type}
              onChange={e => updateField(field.id, { type: e.target.value as CustomFieldType, options: [] })}
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
                onChange={e => updateField(field.id, { required: e.target.checked })}
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
                    onClick={() => removeOption(field.id, opt)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-red hover:bg-red/10 transition-colors"
                  >
                    <CloseCircleLineDuotone className="w-3.5 h-3.5" color="#EF4444" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={optionDrafts[field.id] ?? ''}
                  onChange={e => setOptionDrafts(prev => ({ ...prev, [field.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(field.id) } }}
                  placeholder="Add option, press Enter"
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => addOption(field.id)}
                  className="w-9 h-9 rounded-xl bg-blue text-white flex items-center justify-center shrink-0"
                >
                  <AddCircleOutline className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

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
