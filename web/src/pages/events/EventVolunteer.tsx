import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, HeartOutline, CheckCircleOutline, CalendarOutline, MapPointOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect } from 'react'
import { useFormDraft } from '../../hooks/useFormDraft'
import { useEventsStore } from '../../stores/useEventsStore'
import { useVolunteerStore } from '../../stores/useVolunteerStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { getEventThemeStyle } from '../../lib/eventTheme'
import { fadeUp } from '../../lib/animation'
import NotFound from '../NotFound'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

function VolunteerPageHeader({ event, onBack }: { event: { title: string }; onBack: () => void }) {
  return (
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
        <div className="relative z-10 flex items-center gap-3 px-4 pb-2">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
          >
            <ArrowLeftOutline className="w-5 h-5" color="white" />
          </button>
          <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
            Volunteer Application
          </h1>
        </div>
        <div className="px-[76px] pb-4">
          <p className="text-white/70 text-[13px] font-proxima truncate leading-none">
            {event.title}
          </p>
        </div>
      </div>
    </header>
  )
}

const schema = z.object({
  reason: z.string().min(20, 'Please write at least 20 characters'),
  phone_number: z.string().optional(),
  social_media_handle: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function EventVolunteer() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()

  const { events } = useEventsStore()
  const { loadApplications, applyToVolunteer, getApplicationByEventId } = useVolunteerStore()
  const { user } = useAuthStore()

  const event = slug ? events.find((e) => e.slug === slug) : undefined
  const eventId = event?.id
  const existingApp = eventId ? getApplicationByEventId(eventId) : undefined

  const isChapterBlocked = !!(event && user && event.is_chapter_locked === true && event.chapter_id !== user.chapter_id)

  useEffect(() => {
    if (isChapterBlocked && slug) {
      navigate(`/events/${slug}`, { replace: true })
    }
  }, [isChapterBlocked, slug, navigate])

  useEffect(() => {
    loadApplications()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { draft, saveDraft, clearDraft } = useFormDraft<FormValues>(
    `event-volunteer:${slug ?? ''}`,
    'local',
  )

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      reason:              (draft.reason              as string) ?? '',
      phone_number:        (draft.phone_number        as string) ?? '',
      social_media_handle: (draft.social_media_handle as string) ?? '',
    },
  })

  useEffect(() => {
    const { unsubscribe } = watch((values) => {
      saveDraft(values as Partial<FormValues>)
    })
    return unsubscribe
  }, [watch, saveDraft])

  if (!event || !eventId) return <NotFound />
  if (isChapterBlocked) return null

  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleDateString('en-PH', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date TBA'

  // If the user already has an application, show read-only status card
  if (existingApp && !submitted) {
    return (
      <div
        className="min-h-screen bg-slate-50"
        style={getEventThemeStyle(event.devcon_category)}
      >
        <VolunteerPageHeader event={event} onBack={() => navigate(`/events/${slug}`)} />

        <div className="p-4 pb-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="bg-white rounded-2xl p-5 shadow-card space-y-3 text-center"
          >
            <HeartOutline className="w-10 h-10 mx-auto" color="rgb(var(--color-primary))" />
            <p className="text-slate-700 font-semibold">Application Submitted</p>
            <p className="text-md3-body-md text-slate-500">
              Status:{' '}
              <span
                className={
                  existingApp.status === 'approved'
                    ? 'text-green font-semibold'
                    : existingApp.status === 'rejected'
                      ? 'text-red font-semibold'
                      : 'text-yellow-500 font-semibold'
                }
              >
                {existingApp.status.charAt(0).toUpperCase() + existingApp.status.slice(1)}
              </span>
            </p>
          </motion.div>
        </div>
      </div>
    )
  }

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null)
    const result = await applyToVolunteer(eventId, {
      reason: values.reason,
      phone_number: values.phone_number || undefined,
      social_media_handle: values.social_media_handle || undefined,
    })
    if (result.success) {
      clearDraft()
      setSubmitted(true)
    } else {
      setSubmitError(result.error ?? 'Something went wrong. Please try again.')
    }
  }

  // Success state — replace form with confirmation card
  if (submitted) {
    return (
      <div
        className="min-h-screen bg-slate-50"
        style={getEventThemeStyle(event.devcon_category)}
      >
        <VolunteerPageHeader event={event} onBack={() => navigate(`/events/${slug}`)} />

        <div className="p-4 pb-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="bg-white rounded-2xl p-6 shadow-card text-center space-y-4"
          >
            <CheckCircleOutline className="w-14 h-14 mx-auto" color="#21C45D" />
            <div>
              <h2 className="text-slate-900 text-md3-title-lg font-bold">Application Submitted!</h2>
              <p className="text-md3-body-md text-slate-500 mt-1 leading-relaxed">
                We'll review your application and notify you soon.
              </p>
            </div>
            <div className="bg-primary/10 rounded-xl px-4 py-3">
              <p className="text-primary text-md3-body-md font-semibold">
                +{event.points_value + event.volunteer_points} pts when approved!
              </p>
              <p className="text-primary/60 text-md3-label-md mt-0.5">
                {event.points_value} attendance + {event.volunteer_points} volunteer bonus
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate(`/events/${slug}`)}
              className="w-full bg-primary text-white font-bold py-4 rounded-2xl mt-2"
            >
              Back to Event
            </motion.button>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={getEventThemeStyle(event.devcon_category)}
    >
      <VolunteerPageHeader event={event} onBack={() => navigate(-1)} />

      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="p-4 pb-24 space-y-4"
      >
        {/* Event info card — read-only */}
        <div className="bg-white rounded-2xl p-4 shadow-card space-y-2">
          {event.cover_image_url ? (
            <img
              src={event.cover_image_url}
              alt={event.title}
              className="w-full h-32 object-cover rounded-xl mb-3"
            />
          ) : (
            <div className="w-full h-32 bg-primary/10 rounded-xl mb-3 flex items-center justify-center">
              <CalendarOutline className="w-10 h-10" color="rgba(var(--color-primary), 0.3)" />
            </div>
          )}
          <h2 className="text-slate-900 font-bold text-md3-body-lg">{event.title}</h2>
          <p className="text-md3-label-md text-slate-400">{dateStr}</p>
          {event.location && (
            <p className="text-md3-label-md text-slate-500 flex items-center gap-1">
              <MapPointOutline className="w-3 h-3 shrink-0" />
              {event.location}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Reason */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
              Why do you want to volunteer? <span className="text-red">*</span>
            </label>
            <textarea
              {...register('reason')}
              rows={4}
              placeholder="Tell us why you'd like to volunteer for this event (at least 20 characters)…"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md text-slate-700 placeholder-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            {errors.reason && (
              <p className="text-red text-md3-label-md mt-1">{errors.reason.message}</p>
            )}
          </div>

          {/* Phone number */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
              Phone Number <span className="text-slate-400 text-md3-label-md font-normal">(optional)</span>
            </label>
            <input
              {...register('phone_number')}
              type="tel"
              placeholder="+63 900 000 0000"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md text-slate-700 placeholder-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Social media handle */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
              Social Media Handle <span className="text-slate-400 text-md3-label-md font-normal">(optional)</span>
            </label>
            <input
              {...register('social_media_handle')}
              type="text"
              placeholder="@username or profile URL"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md text-slate-700 placeholder-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Submit error */}
          {submitError && (
            <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          {/* Submit button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <HeartOutline className="w-5 h-5" />
                Submit Volunteer Application
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
