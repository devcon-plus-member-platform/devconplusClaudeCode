import { memo, useState } from 'react'
import { CheckCircleOutline, CloseCircleLineDuotone, RestartOutline, HeartOutline, AltArrowDownOutline, AltArrowUpOutline, PhoneOutline, LetterOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { StatusBadge } from './StatusBadge'
import type { OrgVolunteerApplication } from '../stores/useOrgVolunteerStore'

interface VolunteerApprovalCardProps {
  application: OrgVolunteerApplication
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onRevert: (id: string) => void
}

function VolunteerApprovalCardComponent({
  application,
  onApprove,
  onReject,
  onRevert,
}: VolunteerApprovalCardProps) {
  const [reasonExpanded, setReasonExpanded] = useState(false)

  const initials = application.member_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const formattedDate = application.applied_at
    ? new Date(application.applied_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-card">
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue/10 flex items-center justify-center text-blue text-md3-body-md font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-md3-body-md font-bold text-slate-900 truncate">{application.member_name}</p>
          <p className="text-md3-label-md text-slate-400 truncate">{application.member_email}</p>
          <p className="text-md3-label-md text-slate-400 truncate">{application.school_or_company}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      {/* Event + date info */}
      <div className="bg-slate-50 rounded-xl px-3 py-2 mb-3">
        <p className="text-md3-label-md text-slate-400 mb-0.5">Event</p>
        <p className="text-md3-body-md font-semibold text-slate-700 truncate">{application.event_title}</p>
        <p className="text-md3-label-md text-slate-400 mt-1">Applied {formattedDate}</p>
      </div>

      {/* Reason */}
      <div className="mb-3">
        <p className="text-md3-label-md text-slate-400 mb-1">Reason</p>
        <p
          className={`text-md3-body-md text-slate-700 leading-relaxed ${
            reasonExpanded ? '' : 'line-clamp-2'
          }`}
        >
          {application.reason}
        </p>
        {application.reason.length > 80 && (
          <button
            onClick={() => setReasonExpanded((v) => !v)}
            className="text-md3-label-md text-blue font-semibold mt-1 flex items-center gap-0.5"
          >
            {reasonExpanded ? (
              <>Show less <AltArrowUpOutline className="w-3 h-3" /></>
            ) : (
              <>Show more <AltArrowDownOutline className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>

      {/* Optional chips */}
      {(application.phone_number || application.social_media_handle) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {application.phone_number && (
            <span className="flex items-center gap-1 text-md3-label-md text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
              <PhoneOutline className="w-3 h-3" />
              {application.phone_number}
            </span>
          )}
          {application.social_media_handle && (
            <span className="flex items-center gap-1 text-md3-label-md text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
              <LetterOutline className="w-3 h-3" />
              {application.social_media_handle}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {application.status === 'pending' && (
        <div className="flex gap-2">
          <motion.button
            onClick={() => onReject(application.id)}
            className="flex-1 py-2 text-md3-body-md font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-red/5 hover:border-red hover:text-red transition-colors flex items-center justify-center gap-1.5"
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <CloseCircleLineDuotone className="w-3.5 h-3.5" color="#EF4444" />
            Reject
          </motion.button>
          <motion.button
            onClick={() => onApprove(application.id)}
            className="flex-1 py-2 text-md3-body-md font-semibold rounded-xl bg-blue text-white hover:bg-blue-dark transition-colors flex items-center justify-center gap-1.5"
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <CheckCircleOutline className="w-3.5 h-3.5" />
            Approve
          </motion.button>
        </div>
      )}

      {(application.status === 'approved' || application.status === 'rejected') && (
        <div className="flex items-center justify-between gap-3">
          <p className={`text-md3-label-md font-semibold flex items-center gap-1 ${
            application.status === 'approved' ? 'text-green' : 'text-red'
          }`}>
            <HeartOutline className="w-3.5 h-3.5 shrink-0" />
            {application.status === 'approved' ? 'Volunteer approved' : 'Application rejected'}
          </p>
          <motion.button
            onClick={() => onRevert(application.id)}
            className="flex items-center gap-1 text-md3-label-md font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <RestartOutline className="w-3 h-3" />
            Undo
          </motion.button>
        </div>
      )}
    </div>
  )
}

export const VolunteerApprovalCard = memo(VolunteerApprovalCardComponent)
