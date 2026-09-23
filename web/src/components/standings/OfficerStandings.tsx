import { useEffect } from 'react'
import { CupStarOutline } from 'solar-icon-set'
import { useAuthStore } from '../../stores/useAuthStore'
import { useChapterStandingStore } from '../../stores/useChapterStandingStore'
import { formatDate } from '../../lib/dates'
import { POINTS_TOTAL_LABEL, formatRate, heroComparison, seasonLabel } from '../../lib/standings'
import ChapterStandingsTable from './ChapterStandingsTable'

/**
 * What a chapter officer sees on the `/admin` dashboard: a hero band for
 * their own chapter, a podium of the top three, and the full shared table
 * with their chapter highlighted. Reads the officer's chapter from the
 * all-chapters list — no separate single-chapter fetch.
 */
export default function OfficerStandings() {
  const { user } = useAuthStore()
  const { standings, standingsComputedAt, standingsLoading, standingsError, loadStandings } =
    useChapterStandingStore()

  useEffect(() => {
    void loadStandings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const chapterId = user?.chapter_id ?? null
  const own = chapterId ? standings.find((s) => s.chapterId === chapterId) : undefined
  const othersCount = Math.max(standings.length - 1, 0)
  const comparison = own ? heroComparison(own, standings) : null
  const podium = standings.filter((s) => s.status === 'ranked' && s.rank !== null && s.rank <= 3)

  return (
    <div className="p-4 pt-6 md:p-8">
      <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Chapter Standings</h1>
      <p className="text-md3-body-md text-slate-500 mb-6">
        Where your chapter stands against the other {othersCount} · {seasonLabel()} · since 24 June
      </p>

      {standingsError && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{standingsError}</p>
      )}

      {standingsLoading && standings.length === 0 ? (
        <p className="text-slate-400 text-md3-body-md">Loading standings…</p>
      ) : (
        <>
          {/* Hero band — the officer's own chapter at a glance */}
          {own && (
            <div className="bg-blue text-white rounded-2xl p-5 md:p-6 mb-4 shadow-card">
              <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
                <div className="flex-1 min-w-0">
                  <p className="text-md3-label-md uppercase tracking-widest text-white/60">{own.chapter}</p>
                  {own.status === 'ranked' && own.rank !== null ? (
                    <p className="text-md3-headline-lg font-black mt-1">#{own.rank}</p>
                  ) : (
                    <p className="text-md3-headline-sm font-black mt-1">
                      {own.status === 'no-events' ? 'No events this season' : 'Unranked'}
                    </p>
                  )}
                  {comparison && (
                    <p className="text-md3-body-md font-bold mt-1">{comparison}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 md:text-right">
                  <p className="text-md3-body-lg font-bold">
                    {own.status === 'no-events'
                      ? 'No check-ins yet'
                      : `Checked in ${own.participants} of ${own.eligibleMembers} eligible members`}
                  </p>
                  <p className="text-md3-body-md text-white/80">
                    {POINTS_TOTAL_LABEL}: {(own.totalPoints ?? 0).toLocaleString()}
                  </p>
                  {own.participationRate !== null && (
                    <p className="text-md3-body-md text-white/80">
                      Participation rate {formatRate(own.participationRate)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Podium — the top three ranked chapters */}
          {podium.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {podium.map((row) => (
                <div
                  key={row.chapterId}
                  className={`bg-white rounded-2xl border p-3 md:p-4 text-center shadow-card ${row.chapterId === chapterId ? 'border-blue' : 'border-slate-200'}`}
                >
                  <div
                    className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center mx-auto font-black text-md3-title-md ${row.rank === 1 ? 'bg-gold text-white' : 'bg-blue/10 text-blue'}`}
                  >
                    {row.rank === 1 ? (
                      <CupStarOutline className="w-5 h-5" color="white" />
                    ) : (
                      row.rank
                    )}
                  </div>
                  <p className="text-md3-body-md font-bold text-slate-900 mt-2 truncate">{row.chapter}</p>
                  <p className="text-md3-body-md font-black text-blue">
                    {row.participationRate !== null ? formatRate(row.participationRate) : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}

          <ChapterStandingsTable standings={standings} yourChapterId={chapterId} />

          {standingsComputedAt && (
            <p className="text-md3-label-md text-slate-400 mt-4">
              Updated {formatDate.dateTime(standingsComputedAt)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
