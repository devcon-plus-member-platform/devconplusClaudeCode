type Status = 'pending' | 'approved' | 'rejected' | 'upcoming' | 'ongoing' | 'past'

const styles: Record<Status, string> = {
  pending:  'bg-yellow-100/90 text-yellow-700',
  approved: 'bg-green/10 text-green',
  rejected: 'bg-red/10 text-red',
  upcoming: 'bg-[rgba(208,224,255,0.9)] text-[#0b46a3]',
  ongoing:  'bg-green/10 text-green',
  past:     'bg-slate-100 text-slate-500',
}

const labels: Record<Status, string> = {
  pending:  'Pending',
  approved: "You're In!",
  rejected: 'Rejected',
  upcoming: 'Upcoming',
  ongoing:  'Ongoing',
  past:     'Past',
}

export default function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`backdrop-blur-[16px] rounded-[100px] px-2 py-0.5 font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase whitespace-nowrap inline-flex items-center justify-center leading-[13.5px] ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
