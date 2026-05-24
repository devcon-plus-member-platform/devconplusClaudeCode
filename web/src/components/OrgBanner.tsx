interface StatItem {
  label: string
  value: string | number
}

interface OrgBannerProps {
  chapterName: string
  role: string
  stats: StatItem[]
}

export function OrgBanner({ chapterName, role, stats }: OrgBannerProps) {
  return (
    <div className="text-white">
      <p className="text-md3-label-md font-bold uppercase tracking-widest text-white/60 mb-1">
        DEVCON Philippines
      </p>
      <h1 className="text-md3-headline-sm font-black mb-0.5">{chapterName} Chapter</h1>
      <p className="text-md3-body-md text-white/70 mb-5">{role}</p>

      <div className="flex gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex-1 bg-white rounded-xl px-4 py-3"
          >
            <p className="text-md3-headline-sm font-black leading-none mb-1 text-blue">{stat.value}</p>
            <p className="text-md3-label-md text-slate-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
