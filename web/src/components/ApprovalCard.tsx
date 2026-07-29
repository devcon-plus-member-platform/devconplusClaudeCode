import { memo } from 'react'
import { AltArrowRightOutline, CheckCircleOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { StatusBadge } from './StatusBadge'

export interface Registration {
  id: string
  member_name: string
  member_email: string
  school_or_company: string
  event_title: string
  registered_at: string
  status: 'pending' | 'approved' | 'rejected'
  checked_in?: boolean
}

interface ApprovalCardProps {
  registration: Registration
  onClick?: () => void
}

function ApprovalCardComponent({ registration, onClick }: ApprovalCardProps) {
  const initials = registration.member_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const formattedDate = new Date(registration.registered_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <motion.div
      className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-card ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue/10 flex items-center justify-center text-blue text-md3-body-md font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-md3-body-md font-bold text-slate-900 truncate">{registration.member_name}</p>
          <p className="text-md3-label-md text-slate-400 truncate">{registration.member_email}</p>
          <p className="text-md3-label-md text-slate-400 truncate">{registration.school_or_company}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={registration.status} />
          <AltArrowRightOutline color="#CBD5E1" size={16} />
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl px-3 py-2">
        <p className="text-md3-label-md text-slate-400 mb-0.5">Event</p>
        <p className="text-md3-body-md font-semibold text-slate-700 truncate">{registration.event_title}</p>
        <p className="text-md3-label-md text-slate-400 mt-1">Registered {formattedDate}</p>
      </div>

      {registration.status === 'approved' && registration.checked_in && (
        <p className="text-md3-label-md text-green font-semibold text-center pt-3 flex items-center justify-center gap-1">
          <CheckCircleOutline color="#21C45D" size={14} />
          Checked In
        </p>
      )}
    </motion.div>
  )
}

export const ApprovalCard = memo(ApprovalCardComponent)
