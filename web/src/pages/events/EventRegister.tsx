import { useState, useEffect } from 'react'
import LegalModal, { type LegalModalType } from '../../components/LegalModal'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftOutline } from 'solar-icon-set'
import { useEventsStore } from '../../stores/useEventsStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { supabase, getBridgeToken } from '../../lib/supabase'
import { useFormDraft } from '../../hooks/useFormDraft'

// ── Custom form field types ───────────────────────────────────────────────────

type CustomFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'radio'

interface CustomFormField {
  id: string
  label: string
  type: CustomFieldType
  required: boolean
  options: string[]
}

// ── Confirmation email builder ────────────────────────────────────────────────

interface EmailParams { memberName: string; eventTitle: string; eventDate: string; eventLocation?: string; pointsValue: number; ticketUrl: string }
function buildConfirmationEmail({ memberName, eventTitle, eventDate, eventLocation, pointsValue, ticketUrl }: EmailParams): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><style>body{margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.w{max-width:390px;margin:0 auto}.hd{background:#1E2A56;padding:28px 24px;text-align:center;color:#fff;font-size:22px;font-weight:900}.bd{background:#fff;padding:28px 24px}.ft{background:#1E2A56;padding:20px 24px;text-align:center}h2{color:#0F172A;font-size:20px;font-weight:800;margin:0 0 8px}p{color:#334155;font-size:14px;line-height:1.65;margin:0 0 16px}.row{font-size:13px;margin-bottom:10px}.lbl{color:#94A3B8;font-size:12px;margin-right:8px}.val{color:#0F172A;font-weight:600}.badge{display:inline-block;background:#DCFCE7;color:#16A34A;font-weight:700;font-size:13px;padding:4px 12px;border-radius:99px}.cta{display:block;background:#1152D4;color:#fff;font-weight:700;font-size:15px;text-align:center;text-decoration:none;padding:14px 24px;border-radius:14px;margin-top:24px}.ft p{color:rgba(255,255,255,.45);font-size:11px;margin:0}hr{border:none;border-top:1px solid #E2E8F0;margin:20px 0}</style></head><body><div class="w"><div class="hd">DEVCON<span style="color:#EA641D">+</span></div><div class="bd"><h2>You're registered! 🎉</h2><p>Hi ${memberName},</p><p>Your spot has been confirmed for <strong>${eventTitle}</strong>. See you there!</p><hr/><div class="row"><span class="lbl">Event</span><span class="val">${eventTitle}</span></div><div class="row"><span class="lbl">Date</span><span class="val">${eventDate}</span></div>${eventLocation ? `<div class="row"><span class="lbl">Location</span><span class="val">${eventLocation}</span></div>` : ''}<div class="row"><span class="lbl">Points</span><span class="badge">+${pointsValue} XP on attendance</span></div><hr/><p style="font-size:13px;color:#64748B">Show your QR ticket at the venue entrance to check in.</p><a href="${ticketUrl}" class="cta">View My Ticket</a></div><div class="ft"><p>&copy; 2026 DEVCON+ Philippines. All rights reserved.</p></div></div></body></html>`
}

// ── Dynamic field renderer ────────────────────────────────────────────────────

const inputCls = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-white text-slate-900 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20'

function renderField(
  field: CustomFormField,
  value: string | string[],
  onChange: (val: string | string[]) => void,
) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={value as string}
          onChange={e => onChange(e.target.value)}
          placeholder={`Enter ${field.label.toLowerCase()}`}
          className={inputCls}
        />
      )
    case 'textarea':
      return (
        <textarea
          value={value as string}
          onChange={e => onChange(e.target.value)}
          rows={3}
          placeholder={`Enter ${field.label.toLowerCase()}`}
          className={`${inputCls} resize-none`}
        />
      )
    case 'select':
      return (
        <select
          value={value as string}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">Select an option…</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    case 'radio':
      return (
        <div className="space-y-2 pt-1">
          {field.options.map(opt => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-md3-body-md text-slate-700">{opt}</span>
            </label>
          ))}
        </div>
      )
    case 'checkbox': {
      const checked = Array.isArray(value) ? value : []
      return (
        <div className="space-y-2 pt-1">
          {field.options.map(opt => (
            <label key={opt} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checked.includes(opt)}
                onChange={e => onChange(
                  e.target.checked
                    ? [...checked, opt]
                    : checked.filter(v => v !== opt)
                )}
                className="w-4 h-4 accent-primary rounded"
              />
              <span className="text-md3-body-md text-slate-700">{opt}</span>
            </label>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function EventRegister() {
  const { slug } = useParams<{ slug: string }>()
  const { draft, saveDraft, clearDraft } = useFormDraft<{
    formResponses: Record<string, string | string[]>
    agreed: boolean
    schoolValue: string
  }>(`event-register:${slug ?? ''}`, 'local')
  const navigate = useNavigate()
  const { events, registrations, register } = useEventsStore()
  const { user } = useAuthStore()
  const [agreed, setAgreed] = useState<boolean>((draft.agreed as boolean) ?? false)
  const [legalModal, setLegalModal] = useState<LegalModalType | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schoolValue, setSchoolValue] = useState<string>(
    (draft.schoolValue as string) ?? user?.school_or_company ?? ''
  )

  // Sync school field if profile loads after mount and draft has no override
  useEffect(() => {
    if (user?.school_or_company && !(draft.schoolValue as string)) {
      setSchoolValue(user.school_or_company)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.school_or_company])

  const [formResponses, setFormResponses] = useState<Record<string, string | string[]>>(
    (draft.formResponses as Record<string, string | string[]>) ?? {},
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const event   = events.find((e) => e.slug === slug)
  const eventId = event?.id ?? ''

  // custom_form_schema is returned by the store's select('*') since the column now exists.
  // Derive it directly — no extra fetch needed.
  const customSchema: CustomFormField[] = Array.isArray(event?.custom_form_schema)
    ? (event.custom_form_schema as CustomFormField[])
    : []

  const existingReg = registrations.find((r) => r.event_id === eventId)
  const isExternal = event?.is_external === true
  const externalUrl = event?.external_registration_url ?? ''

  const isChapterBlocked = !!(
    event && user &&
    event.is_chapter_locked === true &&
    event.chapter_id !== null &&
    event.chapter_id !== user.chapter_id
  )
  const hasSchoolOnProfile = !!user?.school_or_company?.trim()

  useEffect(() => {
    if (!event || !user) return
    if (event.is_external) {
      if (externalUrl && externalUrl !== 'tba') {
        window.open(externalUrl, '_blank', 'noopener,noreferrer')
      }
      navigate(`/events/${slug}`, { replace: true })
      return
    }
    if (isChapterBlocked) {
      navigate(`/events/${slug}`, { replace: true })
      return
    }
    if (existingReg) {
      const destination = existingReg.status === 'approved'
        ? `/events/${slug}/ticket`
        : existingReg.status === 'rejected'
          ? `/events/${slug}`
          : `/events/${slug}/pending`
      navigate(destination, { replace: true })
    }
  }, [isChapterBlocked, existingReg, event, user, slug, navigate, externalUrl])

  if (!event || !user) return null
  if (isExternal || isChapterBlocked || existingReg) return null

  const setResponse = (fieldId: string, value: string | string[]) => {
    const next = { ...formResponses, [fieldId]: value }
    setFormResponses(next)
    if (fieldErrors[fieldId]) setFieldErrors(prev => ({ ...prev, [fieldId]: '' }))
    saveDraft({ formResponses: next, agreed, schoolValue })
  }

  const validateCustomFields = (): boolean => {
    const errors: Record<string, string> = {}
    for (const field of customSchema) {
      if (!field.required) continue
      const val = formResponses[field.id]
      const isEmpty = !val || (Array.isArray(val) ? val.length === 0 : val.trim() === '')
      if (isEmpty) errors[field.id] = 'This field is required'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isExternal) return
    if (!agreed) return
    if (!validateCustomFields()) return

    setSubmitting(true)
    setError(null)
    try {
      // Persist school/company to profile if the user added or changed it
      const trimmedSchool = schoolValue.trim()
      if (trimmedSchool && trimmedSchool !== (user.school_or_company ?? '')) {
        await useAuthStore.getState().updateProfile({ school_or_company: trimmedSchool })
      }

      await register(eventId, user.id)
      const reg = useEventsStore.getState().registrations.find((r) => r.event_id === eventId)
      const destination = reg?.status === 'approved'
        ? `/events/${slug}/ticket`
        : `/events/${slug}/pending`

      // Save form responses to the registration row
      if (reg && customSchema.length > 0 && Object.keys(formResponses).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- form_responses not yet in generated DB types
        await (supabase as any)
          .from('event_registrations')
          .update({ form_responses: formResponses })
          .eq('id', reg.id)
      }

      // Fire-and-forget confirmation email for auto-approved registrations
      if (reg?.status === 'approved') {
        const accessToken = getBridgeToken()
        if (accessToken) {
          const eventDate = event.event_date
            ? new Date(event.event_date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            : 'Date TBA'
          const ticketUrl = `${window.location.origin}/events/${slug}/ticket`
          void supabase.functions.invoke('send-email', {
            body: {
              to: user.email,
              subject: `You're registered for ${event.title}!`,
              html: buildConfirmationEmail({ memberName: user.full_name, eventTitle: event.title, eventDate, eventLocation: event.location ?? undefined, pointsValue: event.points_value ?? 100, ticketUrl }),
            },
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        }
      }

      clearDraft()
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Back + Title */}
          <div className="relative z-10 px-4 pb-2 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >
              <ArrowLeftOutline className="w-5 h-5" color="white" />
            </button>
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              Register
            </h1>
          </div>
          <div className="px-[76px] pb-2">
            <p className="text-white/70 text-[13px] font-proxima truncate leading-none">
              {event.title}
            </p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 pb-24">
        {/* Pre-filled profile fields */}
        <p className="text-md3-label-md text-slate-400 font-semibold uppercase tracking-wide">Your Details</p>

        {/* Read-only: Full Name */}
        <div>
          <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Full Name</label>
          <input
            value={user.full_name}
            readOnly
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-slate-100 text-slate-500 cursor-default"
          />
        </div>

        {/* Read-only: Email */}
        <div>
          <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Email</label>
          <input
            value={user.email}
            readOnly
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-slate-100 text-slate-500 cursor-default"
          />
        </div>

        {/* School / Company — read-only if already on profile, editable only when empty */}
        <div>
          <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
            School / Company
          </label>
          {hasSchoolOnProfile ? (
            <input
              value={user.school_or_company ?? ''}
              readOnly
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-slate-100 text-slate-500 cursor-default"
            />
          ) : (
            <input
              type="text"
              value={schoolValue}
              onChange={(e) => {
                setSchoolValue(e.target.value)
                saveDraft({ formResponses, agreed, schoolValue: e.target.value })
              }}
              placeholder="e.g. University of the Philippines"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-white text-slate-900 focus:outline-none focus:ring-1 focus:border-primary focus:ring-primary/20"
            />
          )}
        </div>

        {/* Reminder: details are managed in settings */}
        <p className="text-md3-label-md text-slate-400">
          Need to change a detail? Update it anytime in your profile settings.
        </p>

        {/* Dynamic custom fields */}
        {customSchema.length > 0 && (
          <>
            <p className="text-md3-label-md text-slate-400 font-semibold uppercase tracking-wide pt-2">
              Additional Information
            </p>
            {customSchema.map(field => (
              <div key={field.id}>
                <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
                  {field.label}
                  {field.required && <span className="text-red ml-1">*</span>}
                </label>
                {renderField(
                  field,
                  formResponses[field.id] ?? (field.type === 'checkbox' ? [] : ''),
                  val => setResponse(field.id, val),
                )}
                {fieldErrors[field.id] && (
                  <p className="text-md3-label-md text-red mt-1">{fieldErrors[field.id]}</p>
                )}
              </div>
            ))}
          </>
        )}

        {/* T&C consent */}
        <label className="flex items-start gap-3 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              const checked = e.target.checked
              setAgreed(checked)
              saveDraft({ formResponses, agreed: checked })
            }}
            className="mt-0.5 accent-blue"
          />
          <span className="text-md3-body-md text-slate-600">
            I agree to the{' '}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLegalModal('safespace') }}
              className="text-primary underline underline-offset-2"
            >
              Safe Space
            </button>
            {', '}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLegalModal('terms') }}
              className="text-primary underline underline-offset-2"
            >
              Terms &amp; Conditions
            </button>
            {', and '}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLegalModal('privacy') }}
              className="text-primary underline underline-offset-2"
            >
              Privacy Policy
            </button>
            {' '}for this event.
          </span>
        </label>

        {error && (
          <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!agreed || submitting}
          className="w-full bg-primary text-white font-bold py-3 rounded-full shadow-sm disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : 'Confirm Registration'}
        </button>
      </form>

      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  )
}
