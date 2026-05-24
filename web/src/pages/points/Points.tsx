import { useNavigate } from 'react-router-dom'
import { TicketOutline, Microphone2Outline, HandHeartOutline, CupHotOutline, HeartOutline, ShareOutline, UsersGroupRoundedOutline, StarOutline, BoltOutline, CopyOutline, CheckCircleOutline } from 'solar-icon-set'
import type { SolarIcon } from '../../lib/icons'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../stores/useAuthStore'
import { usePointsStore } from '../../stores/usePointsStore'
import { useReferralsStore } from '../../stores/useReferralsStore'
import { staggerContainer, cardItem } from '../../lib/animation'

const PRESTIGE_THRESHOLD = 3000

const EARN: { Icon: SolarIcon; label: string; pts: string; note?: string }[] = [
  { Icon: TicketOutline,    label: 'Attend an Event',     pts: '5–10 pts',  note: '10 pts with boost' },
  { Icon: HandHeartOutline, label: 'Volunteer at Event',  pts: '+35 pts',   note: '+30 bonus on top of attendance' },
  { Icon: UsersGroupRoundedOutline,     label: 'Refer a Friend',      pts: '+100 pts',  note: 'Max 1,000 pts/year' },
  { Icon: Microphone2Outline,      label: 'Speak at an Event',   pts: '700 pts'    },
  { Icon: CupHotOutline,    label: 'Brown Bag Session',   pts: '250 pts'    },
]

const SHARE: { Icon: SolarIcon; label: string; pts: string }[] = [
  { Icon: HeartOutline,  label: 'Like Content',        pts: '5 pts'     },
  { Icon: ShareOutline, label: 'Share + Submit Link', pts: '10–25 pts' },
]

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function Points() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { spendablePoints, lifetimePoints, prestigeUnlocked, loadTotalPoints } = usePointsStore()
  const { referralCode, referralCount, annualEarnings, loading: referralsLoading, loadReferralData } = useReferralsStore()

  const [tab, setTab] = useState<'earn' | 'share'>('earn')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (user?.id) {
      void loadTotalPoints()
      void loadReferralData()
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const progressPct = Math.min((lifetimePoints / PRESTIGE_THRESHOLD) * 100, 100)

  const handleCopy = () => {
    if (!referralCode) return
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(referralCode).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    } else {
      // Fallback: select the text (best effort)
      setCopied(false)
    }
  }

  const earnItems = tab === 'earn' ? EARN : SHARE

  return (
    <div className="min-h-screen bg-slate-50">
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
          <div className="relative z-10 px-4 pb-4 flex items-center gap-3">
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight flex-1">
              Points+
            </h1>
          </div>
        </div>

        {/* ── Stats Card Overlay ── */}
        <div className="relative z-10 flex flex-col px-4 -mt-[40px] pointer-events-none">
          <div className="bg-white rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] border border-slate-400/30 p-[20px] flex flex-col gap-4 pointer-events-auto">
            {/* Dual balance display */}
            <div className="space-y-3">
              {/* Spendable */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center shrink-0">
                  <StarOutline className="w-6 h-6" color="#F8C630" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[#464646] font-black text-md3-headline-sm leading-none">
                    {spendablePoints.toLocaleString()} XP
                  </span>
                  <span className="text-[#6b7280] text-[11px] font-proxima uppercase tracking-wider mt-1">Available to spend</span>
                </div>
              </div>

              {/* Lifetime */}
              <div className="flex items-center gap-3 pt-1">
                <div className="w-10 h-10 rounded-full bg-blue/5 flex items-center justify-center shrink-0">
                  <BoltOutline className="w-5 h-5" color="rgb(var(--color-primary))" />
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-600 font-bold text-md3-body-md leading-none">
                    {lifetimePoints.toLocaleString()} lifetime XP
                  </span>
                  {prestigeUnlocked ? (
                    <span className="text-gold text-[10px] font-bold uppercase tracking-wider mt-1">Prestige Unlocked!</span>
                  ) : (
                    <span className="text-slate-400 text-[10px] uppercase tracking-wider mt-1">
                      Next: Prestige at {PRESTIGE_THRESHOLD.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Lifetime progress bar */}
              {!prestigeUnlocked && (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabs Wrapper ── */}
        <div className="pt-4 pb-2 px-4 pointer-events-auto">
          <div className="flex gap-[6px] overflow-x-auto no-scrollbar max-w-4xl mx-auto">
            {(['earn', 'share'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`whitespace-nowrap px-[12px] h-[32px] flex-1 flex items-center justify-center rounded-[128px] text-[14px] font-proxima font-bold transition-all shrink-0 ${
                  tab === t
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {t === 'earn' ? 'Ways to Earn' : 'Share & Earn'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Scrollable body ───────────────────────────────────── */}
      <div className="px-4 pt-4 pb-24 md:max-w-4xl md:mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            className="space-y-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            {earnItems.map((item) => (
              <motion.div
                key={item.label}
                variants={cardItem}
                className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <item.Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-900 text-md3-body-md">{item.label}</p>
                      {'note' in item && !!(item as { note?: unknown }).note && (
                        <p className="text-md3-label-md text-slate-400 mt-0.5">{String((item as { note?: string }).note)}</p>
                      )}
                    </div>
                    <span className="text-md3-label-md font-bold text-primary ml-2 shrink-0">{item.pts}</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Redemption note — shown only on earn tab */}
            {tab === 'earn' && (
              <motion.div
                variants={cardItem}
                className="bg-white/60 rounded-2xl px-4 py-3 border border-slate-200"
              >
                <p className="text-md3-label-md text-slate-500 text-center">
                  Redeeming rewards deducts from your{' '}
                  <span className="font-semibold text-slate-700">spendable balance only</span>
                  {' '}— lifetime points are never reduced.
                </p>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Share & Earn referral card (always visible) ──────── */}
        <div className="mt-4 bg-white rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <UsersGroupRoundedOutline className="w-4 h-4" color="rgb(var(--color-primary))" />
            <p className="font-bold text-slate-900 text-md3-body-md">Share & Earn</p>
          </div>
          <p className="text-md3-label-md text-slate-500 mb-3">
            Refer a friend and earn <span className="font-semibold text-primary">100 pts</span> per sign-up
          </p>

          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Your referral code
          </p>

          {referralsLoading ? (
            <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
          ) : referralCode !== null ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 font-mono font-bold text-slate-900 text-md3-body-md tracking-widest">
                {referralCode}
              </div>
              <motion.button
                onClick={handleCopy}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-md3-body-md font-semibold transition-colors ${
                  copied
                    ? 'bg-green/10 text-green'
                    : 'bg-primary text-white'
                }`}
              >
                {copied ? (
                  <>
                    <CheckCircleOutline className="w-4 h-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <CopyOutline className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </motion.button>
            </div>
          ) : (
            <div className="h-10 flex items-center px-3 bg-slate-100 rounded-xl text-md3-body-md text-slate-400">
              Referral code not yet assigned
            </div>
          )}

          {!referralsLoading && (referralCode !== null || referralCount > 0) && (
            <div className="mt-3 flex items-center gap-1.5 text-md3-label-md text-slate-500">
              <UsersGroupRoundedOutline className="w-3.5 h-3.5 shrink-0" color="#94A3B8" />
              <span>
                Referred:{' '}
                <span className="font-semibold text-slate-700">{referralCount} friend{referralCount !== 1 ? 's' : ''}</span>
                {'  '}·{'  '}
                <span className="font-semibold text-primary">{annualEarnings.toLocaleString()} pts earned</span>
                {' '}this year
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/points/history')}
          className="w-full mt-4 bg-white border border-slate-200 text-slate-700 font-semibold py-3 rounded-2xl text-md3-body-md shadow-card"
        >
          View Points History
        </button>
      </div>
    </div>
  )
}
