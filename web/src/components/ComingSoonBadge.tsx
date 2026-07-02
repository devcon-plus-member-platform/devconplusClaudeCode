interface Props {
  /** Renders the shorter "Soon" label for tight containers (e.g. filter pills). */
  compact?: boolean
}

export default function ComingSoonBadge({ compact = false }: Props) {
  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.5px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
      {compact ? 'Soon' : 'Coming soon'}
    </span>
  )
}
