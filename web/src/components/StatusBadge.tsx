interface StatusBadgeProps {
  status: 'pending' | 'approved' | 'rejected'
}

const CONFIG = {
  pending:  { label: 'Pending',  className: 'bg-yellow-100/90 text-yellow-700' },
  approved: { label: 'Approved', className: 'bg-green/10 text-green'           },
  rejected: { label: 'Rejected', className: 'bg-red/10 text-red'               },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, className } = CONFIG[status]
  return (
    <span className={`backdrop-blur-[16px] rounded-[100px] px-[12px] py-[6px] font-proxima font-semibold text-[9px] tracking-[0.9px] uppercase whitespace-nowrap inline-flex items-center justify-center leading-[13.5px] ${className}`}>
      {label}
    </span>
  )
}
