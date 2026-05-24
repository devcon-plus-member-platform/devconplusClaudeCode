import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, BoltOutline, StarOutline } from 'solar-icon-set'
import { useAuthStore } from '../../stores/useAuthStore'
import { usePointsStore } from '../../stores/usePointsStore'
import TransactionRow from '../../components/TransactionRow'
import { SkeletonTransactionGroup } from '../../components/Skeleton'
import type { PointTransaction } from '@devcon-plus/supabase'

// Flower-of-life pattern matching Rewards/Dashboard
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

type SourceFilter =
  | 'all'
  | 'event_attendance'
  | 'volunteering'
  | 'referral'
  | 'speaking'
  | 'brown_bag'
  | 'redemption'
  | 'signup'
  | 'bonus'

const FILTER_CHIPS: { id: SourceFilter; label: string }[] = [
  { id: 'all',              label: 'All'          },
  { id: 'event_attendance', label: 'Events'       },
  { id: 'volunteering',     label: 'Volunteering' },
  { id: 'referral',         label: 'Referrals'    },
  { id: 'speaking',         label: 'Speaking'     },
  { id: 'brown_bag',        label: 'Brown Bag'    },
  { id: 'redemption',       label: 'Redeemed'     },
  { id: 'signup',           label: 'Sign-up'      },
  { id: 'bonus',            label: 'Bonus'        },
]

function groupByDate(txs: PointTransaction[]): Array<[string, PointTransaction[]]> {
  const groups: Record<string, PointTransaction[]> = {}
  for (const tx of txs) {
    const day = new Date(tx.created_at ?? '').toLocaleDateString('en-PH', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
    if (!groups[day]) groups[day] = []
    groups[day].push(tx)
  }
  return Object.entries(groups)
}

export default function PointsHistory() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    transactions,
    spendablePoints,
    lifetimePoints,
    loadTransactions,
    loadTotalPoints,
    isLoading,
  } = usePointsStore()

  const [activeFilter, setActiveFilter] = useState<SourceFilter>('all')

  useEffect(() => {
    if (user?.id) {
      void loadTransactions()
      void loadTotalPoints()
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime()
  )

  const filtered =
    activeFilter === 'all'
      ? sorted
      : sorted.filter((tx) => tx.source === activeFilter)

  const groups = groupByDate(filtered)

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Glassmorphism Background ── */}
        <div className="absolute inset-0 backdrop-blur-md bg-slate-50/80 pointer-events-auto -z-10" />

        {/* ── Blue Background Container ── */}
        <div 
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[64px] pt-14"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Icons */}
          <div className="relative z-10 flex items-center gap-3 px-4 pb-2">
            <button
              onClick={() => navigate(-1)}
              className="bg-white/20 size-[42px] flex items-center justify-center rounded-full border border-white/30 backdrop-blur-md transition-colors active:bg-white/40 shadow-lg shrink-0"
            >
              <ArrowLeftOutline className="w-[18px] h-[18px]" color="white" />
            </button>
            <h1 className="font-proxima font-semibold text-[24px] text-white leading-none tracking-tight">
              Points History
            </h1>
          </div>
        </div>

        {/* ── Points Card Overlay ── */}
        <div className="relative z-10 flex flex-col px-4 -mt-[40px] pointer-events-none">
          <div className="bg-white rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] border border-slate-400/30 h-[100px] flex items-center pointer-events-auto">
            {/* Spendable */}
            <div className="flex-1 flex items-center gap-[10px] pl-[20px]">
              <div className="shrink-0 size-[40px] bg-gold/10 rounded-full flex items-center justify-center">
                <StarOutline color="#F8C630" size={22} />
              </div>
              <div className="flex flex-col justify-center translate-y-px">
                <p className="font-proxima text-[#6b7280] text-[12px] leading-none mb-[6px]">
                  Spendable
                </p>
                <div className="flex items-baseline gap-1">
                  <p className="font-proxima font-extrabold text-[24px] text-[#464646] leading-none tracking-tight">
                    {spendablePoints.toLocaleString()}
                  </p>
                  <p className="font-proxima font-semibold text-[14px] text-[#464646] leading-none">
                    XP
                  </p>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-[50px] bg-slate-100" />

            {/* Lifetime */}
            <div className="flex-1 flex items-center gap-[10px] pl-[20px]">
              <div className="shrink-0 size-[40px] bg-slate-50 rounded-full flex items-center justify-center">
                <BoltOutline className="size-5" color="rgb(var(--color-primary))" />
              </div>
              <div className="flex flex-col justify-center translate-y-px">
                <p className="font-proxima text-[#6b7280] text-[12px] leading-none mb-[6px]">
                  Lifetime
                </p>
                <div className="flex items-baseline gap-1">
                  <p className="font-proxima font-extrabold text-[24px] text-[#464646] leading-none tracking-tight">
                    {lifetimePoints.toLocaleString()}
                  </p>
                  <p className="font-proxima font-semibold text-[14px] text-[#464646] leading-none">
                    XP
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs Wrapper ── */}
        <div className="pt-4 pb-2 px-4 pointer-events-auto">
          <div className="flex gap-[6px] overflow-x-auto no-scrollbar max-w-4xl mx-auto">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.id}
                onClick={() => setActiveFilter(chip.id)}
                className={`whitespace-nowrap px-[12px] h-[32px] flex items-center justify-center rounded-[128px] text-[14px] font-proxima font-bold transition-all shrink-0 ${
                  activeFilter === chip.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Transaction list ───────────────────────────────────── */}
      <div className="md:max-w-4xl md:mx-auto px-4 pt-4 pb-28">
        {isLoading ? (
          <>
            <SkeletonTransactionGroup rows={3} />
            <SkeletonTransactionGroup rows={2} />
          </>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <BoltOutline className="w-8 h-8" color="rgba(var(--color-primary), 0.5)" />
            </div>
            <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">No transactions yet</h2>
            <p className="text-md3-body-md text-slate-500">
              {activeFilter === 'all' ? 'Your history is empty.' : `No ${activeFilter.replace('_', ' ')} transactions found.`}
            </p>
          </div>
        ) : (
          groups.map(([date, txs]) => (
            <div key={date} className="mb-6">
              <p className="font-proxima text-[#6b7280] text-[10px] uppercase tracking-wider mb-2 font-bold px-1">{date}</p>
              <div className="bg-white rounded-2xl border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] px-4">
                {txs.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {groups.length > 0 && (
          <p className="text-center text-md3-label-md text-slate-400 mt-6 pb-4">That's it!</p>
        )}
      </div>
    </div>
  )
}
