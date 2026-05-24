import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ClockCircleOutline, CloseCircleOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useEventsStore } from '../../stores/useEventsStore'
import { useAuthStore } from '../../stores/useAuthStore'

export default function EventPending() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { events, registrations, subscribeToRegistration } = useEventsStore()
  const { user } = useAuthStore()

  const event = events.find((e) => e.slug === slug)
  const eventId = event?.id
  const reg = registrations.find((r) => r.event_id === eventId && r.user_id === user?.id)

  const [isRejected, setIsRejected] = useState(false)

  // If already approved (page refresh after approval), go straight to ticket
  useEffect(() => {
    if (reg?.status === 'approved') {
      navigate(`/events/${slug}/ticket`, { replace: true })
    }
    if (reg?.status === 'cancelled') {
      navigate('/events', { replace: true })
    }
  }, [reg?.status, slug, navigate])

  // Realtime: watch for approval or rejection
  useEffect(() => {
    if (!reg?.id) return
    const unsubscribe = subscribeToRegistration(reg.id, (status) => {
      if (status === 'approved') {
        navigate(`/events/${slug}/ticket`, { replace: true })
      } else if (status === 'rejected') {
        setIsRejected(true)
      }
    })
    return unsubscribe
  }, [reg?.id, slug, navigate, subscribeToRegistration])

  // ── Rejection screen ──────────────────────────────────────────────────────
  if (isRejected) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="w-20 h-20 rounded-full bg-red/10 flex items-center justify-center mb-4"
        >
          <CloseCircleOutline className="w-10 h-10" color="#EF4444" />
        </motion.div>
        <h1 className="text-md3-title-lg font-bold text-slate-900 mb-2">Registration Declined</h1>
        <p className="text-md3-body-md text-slate-500 mb-8">
          Your registration for <strong>{event?.title}</strong> was not approved by the chapter officer.
        </p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/events')}
          className="w-full max-w-xs bg-primary text-white font-bold py-4 rounded-2xl"
        >
          Back to Events
        </motion.button>
      </div>
    )
  }

  // ── Main pending screen ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 text-center pb-24">

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center mb-5"
      >
        <ClockCircleOutline className="w-9 h-9" color="#EAB308" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h1 className="text-md3-title-lg font-bold text-slate-900 mb-2">Awaiting Approval</h1>
        <p className="text-md3-body-md text-slate-500 max-w-[280px] leading-relaxed mb-6">
          Your registration for <strong>{event?.title}</strong> is pending review by a chapter officer.
          You'll be notified once it's approved.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="w-full max-w-xs bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-4 mb-8 text-left"
      >
        <p className="text-md3-label-md font-semibold text-yellow-700 uppercase tracking-widest mb-1">What happens next</p>
        <ul className="text-md3-body-md text-yellow-800 space-y-1 list-disc list-inside">
          <li>An officer will review your registration</li>
          <li>You'll receive a QR ticket once approved</li>
          <li>Present your ticket at the event entrance</li>
        </ul>
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate('/events')}
        className="w-full max-w-xs border border-slate-200 text-slate-600 font-semibold py-3 rounded-2xl text-md3-body-md"
      >
        Back to Events
      </motion.button>
    </div>
  )
}
