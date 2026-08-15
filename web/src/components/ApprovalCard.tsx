import { memo } from 'react'
import { AltArrowRightOutline, CheckCircleOutline, LetterOutline } from 'solar-icon-set'
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
  mailtoHref?: string | null
  /** Bulk-select mode is on AND this row is actionable. Turns the card into a toggle. */
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

function ApprovalCardComponent({
  registration,
  onClick,
  mailtoHref,
  selectable = false,
  selected = false,
  onToggleSelect,
}: ApprovalCardProps) {
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

  // In select mode the whole card is the tap target — at 390px wide, requiring a
  // hit on a 20px checkbox would be hostile. The checkbox is still rendered (and
  // stops propagation) so keyboard and screen-reader users get a real control.
  const handleRootClick = () => {
    if (selectable) {
      onToggleSelect?.(registration.id)
      return
    }
    onClick?.()
  }
  const isTappable = selectable || Boolean(onClick)

  return (
    <motion.div
      className={`bg-white rounded-2xl border p-4 shadow-card ${isTappable ? 'cursor-pointer' : ''} ${
        selected ? 'border-blue ring-2 ring-blue/20' : 'border-slate-200'
      }`}
      onClick={isTappable ? handleRootClick : undefined}
      whileTap={isTappable ? { scale: 0.97 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className="flex items-start gap-3 mb-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(registration.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${registration.member_name}`}
            className="w-5 h-5 mt-2.5 shrink-0 accent-[#1152D4] cursor-pointer"
          />
        )}
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
          {/* Both are hidden in select mode: the envelope's own stopPropagation
              would swallow the tap and launch a mail client mid-selection, and
              the chevron would promise a navigation that no longer happens. */}
          {!selectable && mailtoHref && (
            <a
              href={mailtoHref}
              onClick={(e) => e.stopPropagation()}
              title="Email registrant"
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-blue/10 flex items-center justify-center transition-colors shrink-0"
            >
              <LetterOutline color="#64748B" size={14} />
            </a>
          )}
          {!selectable && <AltArrowRightOutline color="#CBD5E1" size={16} />}
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
