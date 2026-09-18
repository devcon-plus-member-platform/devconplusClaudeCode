import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, UsersGroupRoundedOutline, CheckCircleOutline, CupStarOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../../stores/useAuthStore'
import { useChapterStandingStore, type ChapterStanding } from '../../../stores/useChapterStandingStore'
import { fadeUp, staggerContainer, cardItem } from '../../../lib/animation'
import { regionBadgeClass } from '../../../lib/chapters'
import { formatDate } from '../../../lib/dates'
import logoMark from '../../../assets/logos/logo-mark.svg'

// Flower-of-life pattern matching the organizer header branding
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

type TabId = 'standings' | 'my-chapter'

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function StandingRow({ row, isOwn }: { row: ChapterStanding; isOwn: boolean }) {
  return (
    <motion.div
      variants={cardItem}
      className={`bg-white rounded-2xl border p-4 flex items-center gap-3 ${
        isOwn ? 'border-blue shadow-blue' : 'border-slate-200'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black text-md3-title-md ${
          row.rank !== null ? 'bg-blue text-white' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {row.rank ?? '—'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-md3-body-lg font-bold text-slate-900 truncate">{row.chapter}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${regionBadgeClass(row.region)}`}>
            {row.region ?? 'No region'}
          </span>
          {isOwn && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue text-white">
              Your chapter
            </span>
          )}
        </div>
        {row.status === 'no-events' ? (
          <p className="text-md3-body-sm text-slate-400 mt-0.5">No events this season</p>
        ) : (
          <p className="text-md3-body-sm text-slate-500 mt-0.5">
            {row.participants}/{row.eligibleMembers} checked in · {row.events} event{row.events !== 1 ? 's' : ''}
            {row.status === 'unranked' && <span className="text-slate-400"> · Unranked</span>}
          </p>
        )}
      </div>
      {row.participationRate !== null && (
        <p className="text-md3-headline-sm font-black text-blue shrink-0">
          {row.participationRate}%
        </p>
      )}
    </motion.div>
  )
}

export function MyChapter() {
  const navigate = useNavigate()
  const { user: profile } = useAuthStore()
  const {
    standing, loading, error, loadMyChapter,
    standings, standingsComputedAt, standingsLoading, standingsError, loadStandings,
  } = useChapterStandingStore()
  const [activeTab, setActiveTab] = useState<TabId>('standings')

  const chapterId = profile?.chapter_id ?? null

  useEffect(() => {
    void loadStandings()
    if (chapterId) void loadMyChapter(chapterId)
  }, [chapterId]) // eslint-disable-line react-hooks/exhaustive-deps

  const rankedCount = standings.filter((s) => s.status === 'ranked').length
  const ownRow = chapterId ? standings.find((s) => s.chapterId === chapterId) : undefined

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        <div
          className="bg-[#1152d4] relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat',
          }}
        >
          <div className="relative z-10 px-4 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                aria-label="Go back"
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
              >
                <ArrowLeftOutline className="w-5 h-5" color="white" />
              </button>
              <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
                Chapter Standings
              </h1>
            </div>
            <img src={logoMark} alt="DEVCON+" className="h-[26px] w-[44px] object-contain opacity-80" />
          </div>
        </div>
      </header>

      <motion.div
        className="p-4 pb-24"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={fadeUp} className="bg-[#eef4ff] inline-flex self-start items-center p-1 rounded-full mb-4">
          {(['standings', 'my-chapter'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center justify-center px-5 py-1.5 rounded-full transition-all duration-300 ${
                activeTab === tab
                  ? 'bg-[#1152d4] text-white shadow-sm'
                  : 'text-black hover:bg-[#dbeafe]/50'
              }`}
            >
              <span className="font-proxima font-bold text-[16px]">
                {tab === 'standings' ? 'Standings' : 'My Chapter'}
              </span>
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {activeTab === 'standings' && (
            <motion.div
              key="standings"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {standingsLoading && standings.length === 0 && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-slate-100 rounded w-32" />
                          <div className="h-3 bg-slate-100 rounded w-48" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {standingsError && !standingsLoading && (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                  <p className="text-md3-body-lg font-bold text-slate-700">Couldn&apos;t load the standings.</p>
                  <p className="text-md3-body-md text-slate-400 mt-1">{standingsError}</p>
                  <motion.button
                    onClick={() => void loadStandings()}
                    className="mt-4 px-6 h-11 rounded-full bg-[#1152d4] text-white text-md3-label-lg font-semibold"
                    whileTap={{ scale: 0.95 }}
                  >
                    Try again
                  </motion.button>
                </div>
              )}

              {!standingsLoading && !standingsError && standings.length > 0 && (
                <motion.div variants={staggerContainer} initial="hidden" animate="visible">
                  {ownRow?.rank !== null && ownRow?.rank !== undefined && (
                    <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-blue p-4 mb-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
                        <CupStarOutline className="w-5 h-5" color="#1152D4" />
                      </div>
                      <p className="text-md3-body-md text-slate-700">
                        <span className="font-black text-blue">{ordinal(ownRow.rank)} of {rankedCount}</span>
                        {' '}— your chapter, {ownRow.chapter}
                      </p>
                    </motion.div>
                  )}
                  {ownRow && ownRow.rank === null && (
                    <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                      <p className="text-md3-body-md text-slate-500">
                        Your chapter, {ownRow.chapter}, is{' '}
                        {ownRow.status === 'no-events'
                          ? 'yet to hold an event this season'
                          : 'unranked this season (fewer than 25 eligible members)'}.
                      </p>
                    </motion.div>
                  )}
                  <div className="space-y-3">
                    {standings.map((row) => (
                      <StandingRow key={row.chapterId} row={row} isOwn={row.chapterId === chapterId} />
                    ))}
                  </div>
                  {standingsComputedAt && (
                    <p className="text-md3-label-sm text-slate-400 text-center mt-4">
                      Updated {formatDate.dateTime(standingsComputedAt)} · Refreshes hourly
                    </p>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'my-chapter' && (
            <motion.div
              key="my-chapter"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {loading && !standing && (
                <div className="space-y-3">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse">
                    <div className="h-10 bg-slate-100 rounded w-32 mx-auto" />
                    <div className="h-3 bg-slate-100 rounded w-48 mx-auto mt-3" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                        <div className="h-6 bg-slate-100 rounded w-16 mx-auto" />
                        <div className="h-3 bg-slate-100 rounded w-24 mx-auto mt-2" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && !loading && (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                  <p className="text-md3-body-lg font-bold text-slate-700">Couldn&apos;t load your chapter&apos;s numbers.</p>
                  <p className="text-md3-body-md text-slate-400 mt-1">{error}</p>
                  <motion.button
                    onClick={() => chapterId && void loadMyChapter(chapterId)}
                    className="mt-4 px-6 h-11 rounded-full bg-[#1152d4] text-white text-md3-label-lg font-semibold"
                    whileTap={{ scale: 0.95 }}
                  >
                    Try again
                  </motion.button>
                </div>
              )}

              {!loading && !error && !standing && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-blue/10 flex items-center justify-center mx-auto mb-3">
                    <UsersGroupRoundedOutline className="w-7 h-7" color="#1152D4" />
                  </div>
                  <p className="text-md3-body-lg font-bold text-slate-700">No chapter figures yet.</p>
                  <p className="text-md3-body-md text-slate-400 mt-1">Your profile isn&apos;t linked to a chapter.</p>
                </div>
              )}

              {standing && (
                <>
                  <motion.div
                    variants={fadeUp}
                    className="bg-white rounded-2xl border border-slate-200 p-6 text-center mb-3"
                  >
                    <p className="text-md3-label-md text-slate-400 uppercase tracking-wide">
                      {standing.chapter} · Participation rate
                    </p>
                    {standing.status === 'no-events' ? (
                      <>
                        <p className="text-md3-headline-sm font-black text-slate-700 mt-2">
                          No events this season
                        </p>
                        <p className="text-md3-body-md text-slate-400 mt-1">
                          Your chapter hasn&apos;t held an event yet this season, so there&apos;s no rate to show.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[48px] leading-none font-black text-blue mt-2">
                          {standing.participationRate}%
                        </p>
                        <p className="text-md3-body-md text-slate-400 mt-2">
                          of eligible members checked in to at least one event this season
                        </p>
                        {standing.status === 'unranked' && (
                          <span className="inline-block mt-3 bg-gold/10 text-md3-label-md font-bold px-3 py-1.5 rounded-full" style={{ color: '#92700a' }}>
                            Unranked — fewer than 25 eligible members
                          </span>
                        )}
                      </>
                    )}
                    <p className="text-md3-label-sm text-slate-400 mt-3">
                      Updated {formatDate.dateTime(standing.computedAt)}
                    </p>
                  </motion.div>

                  {standing.status !== 'no-events' && (
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Eligible members', hint: 'Had at least one event to attend', value: standing.eligibleMembers, color: 'text-blue' },
                          { label: 'Checked in', hint: 'Distinct members who showed up', value: standing.participants, color: 'text-green' },
                          { label: 'Events held', hint: 'Events this season', value: standing.events, color: 'text-blue' },
                          { label: 'Total check-ins', hint: 'Every attendance counted', value: standing.checkIns, color: 'text-blue' },
                          { label: 'Avg per event', hint: 'Average check-ins per event', value: standing.avgPerEvent, color: 'text-blue' },
                          { label: 'Show-up rate', hint: 'Check-ins as a share of approved registrations', value: standing.showUpRate === null ? '—' : `${standing.showUpRate}%`, color: 'text-blue' },
                          { label: 'New members', hint: 'Joined this season — outside the rate', value: standing.newMembers, color: 'text-blue' },
                          { label: 'XP earned', hint: 'Points earned this season', value: standing.xp, color: 'text-blue' },
                        ].map(({ label, hint, value, color }) => (
                          <motion.div key={label} variants={cardItem} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                            <p className={`text-md3-headline-sm font-black ${color}`}>{value}</p>
                            <p className="text-md3-label-md font-bold text-slate-700 mt-1">{label}</p>
                            <p className="text-md3-label-sm text-slate-400 mt-0.5">{hint}</p>
                          </motion.div>
                        ))}
                      </div>

                      <motion.div variants={fadeUp} className="mt-3 bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green/10 flex items-center justify-center shrink-0">
                          <CheckCircleOutline className="w-5 h-5" color="#21C45D" />
                        </div>
                        <p className="text-md3-body-sm text-slate-500">
                          Only physical check-ins count — approved registrations that never showed up don&apos;t move the
                          rate. Recruiting stays neutral: members who joined after your most recent event aren&apos;t counted
                          for or against you.
                        </p>
                      </motion.div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
