function S({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />
}

/** Single event card row (compact — dashboard + list) */
export function SkeletonEventCard() {
  return (
    <div className="bg-white rounded-2xl shadow-card p-4 flex items-start gap-3">
      <S className="w-12 h-14 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <S className="h-4 w-3/4" />
        <S className="h-3 w-1/2" />
        <S className="h-5 w-16 rounded-full" />
      </div>
    </div>
  )
}

/** Featured navy event hero card */
export function SkeletonFeaturedEvent() {
  return (
    <div className="bg-slate-200 animate-pulse rounded-2xl h-[300px] relative overflow-hidden">
      <div className="absolute inset-0 bg-slate-300/50" />
      <div className="relative z-10 h-full flex flex-col justify-between p-5 pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <S className="h-7 w-3/4 bg-slate-400/30" />
            <S className="h-7 w-1/2 bg-slate-400/30" />
          </div>
          <div className="flex items-center gap-2">
            <S className="h-3 w-20 bg-slate-400/20" />
            <div className="w-1 h-1 bg-slate-400/20 rounded-full" />
            <S className="h-3 w-32 bg-slate-400/20" />
          </div>
          <div className="flex gap-2">
            <S className="h-5 w-16 rounded-full bg-slate-400/20" />
            <S className="h-5 w-20 rounded-full bg-slate-400/20" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <S className="h-10 w-32 rounded-[24px] bg-slate-400/30" />
          <div className="flex -space-x-2">
            <S className="w-6 h-6 rounded-full bg-slate-400/20" />
            <S className="w-6 h-6 rounded-full bg-slate-400/20" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Horizontal job card for dashboard carousel (compact) */
export function SkeletonJobCardCompact() {
  return (
    <div className="flex-shrink-0 w-52 bg-white rounded-[24px] border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] p-[18px] py-[12px] space-y-2">
      <div className="w-10 h-10 rounded-full bg-primary/20 animate-pulse" />
      <div className="space-y-1.5">
        <S className="h-4 w-full" />
        <S className="h-3 w-2/3" />
      </div>
      <div className="flex gap-2 pt-1">
        <S className="h-5 w-12 rounded-full" />
      </div>
    </div>
  )
}

/** Full-width job card skeleton matching new high-fidelity design */
export function SkeletonJobCard() {
  return (
    <div className="bg-white rounded-[24px] border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] p-[18px] py-[12px] space-y-2">
      <div className="w-12 h-12 rounded-full bg-primary/20 animate-pulse shrink-0" />
      <div className="flex flex-col gap-1">
        <div className="flex flex-col gap-[2px]">
          <S className="h-4 w-3/4" />
          <S className="h-3 w-1/2" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <S className="h-6 w-16 rounded-full" />
          <S className="h-6 w-20 rounded-full" />
          <S className="h-4 w-24" />
        </div>
      </div>
    </div>
  )
}

/** Mission card skeleton */
export function SkeletonMissionCard() {
  return (
    <div className="bg-white border border-[rgba(156,163,175,0.3)] rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] p-[18px] py-4 space-y-3">
      <div className="flex items-center gap-2">
        <S className="h-4 w-16 rounded-full" />
        <S className="h-4 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <S className="h-5 w-3/4" />
        <div className="flex items-center gap-3">
          <S className="h-3 w-20" />
          <S className="h-3 w-20" />
        </div>
      </div>
      <div className="pt-1">
        <S className="h-[34px] w-32 rounded-full" />
      </div>
    </div>
  )
}

/** News card */
export function SkeletonNewsCard() {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <S className="h-32 w-full rounded-none" />
      <div className="p-3 space-y-2">
        <S className="h-4 w-3/4" />
        <S className="h-3 w-1/2" />
      </div>
    </div>
  )
}

/** XP transaction row */
export function SkeletonXPRow({ border = false }: { border?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${border ? 'border-b border-slate-100' : ''}`}>
      <S className="w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <S className="h-3.5 w-2/3" />
        <S className="h-3 w-1/3" />
      </div>
      <S className="h-4 w-14" />
    </div>
  )
}

/** Transaction group (date header + rows) */
export function SkeletonTransactionGroup({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mb-4">
      <S className="h-3 w-40 mb-2" />
      <div className="bg-white rounded-2xl shadow-card px-4 divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonXPRow key={i} />
        ))}
      </div>
    </div>
  )
}

/** Reward card — full-width single column */
export function SkeletonRewardCard() {
  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      <S className="h-40 w-full rounded-none" />
      <div className="p-4 space-y-2">
        <S className="h-4 w-2/3" />
        <S className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-100">
          <S className="h-5 w-24" />
          <S className="h-8 w-20 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
