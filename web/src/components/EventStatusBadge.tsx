interface EventStatusBadgeProps {
  /** The raw `events.status` value (`'upcoming' | 'ongoing' | 'past'`). */
  status: string | null | undefined
}

const CONFIG = {
  upcoming: { label: 'Upcoming', className: 'bg-blue/10 text-blue'       },
  ongoing:  { label: 'Ongoing',  className: 'bg-green/10 text-green'     },
  past:     { label: 'Past',     className: 'bg-slate-100 text-slate-400' },
} as const

type EventStatus = keyof typeof CONFIG

function normalize(status: string | null | undefined): EventStatus {
  return status === 'ongoing' || status === 'past' ? status : 'upcoming'
}

/**
 * Badge for an event's lifecycle status (upcoming / ongoing / past).
 *
 * Distinct from `<StatusBadge />`, which renders registration-approval states
 * (pending / approved / rejected). Do not conflate the two — an upcoming event
 * is not "pending approval".
 */
export function EventStatusBadge({ status }: EventStatusBadgeProps) {
  const { label, className } = CONFIG[normalize(status)]
  return (
    <span className={`backdrop-blur-[16px] rounded-[100px] px-[12px] py-[6px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase whitespace-nowrap inline-flex items-center justify-center leading-[13.5px] ${className}`}>
      {label}
    </span>
  )
}
