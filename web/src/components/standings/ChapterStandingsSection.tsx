import { useEffect } from 'react'
import { useChapterStandingStore } from '../../stores/useChapterStandingStore'
import { formatDate } from '../../lib/dates'
import ChapterStandingsTable from './ChapterStandingsTable'

/**
 * HQ dashboard section: the same shared standings table officers see, with
 * no hero band or podium — HQ has no chapter of its own.
 */
export default function ChapterStandingsSection() {
  const { standings, standingsComputedAt, standingsLoading, standingsError, loadStandings } =
    useChapterStandingStore()

  useEffect(() => {
    void loadStandings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="Chapter Standings" className="mt-4">
      <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">Chapter Standings</h2>
      <p className="text-md3-body-md text-slate-500 mb-3">Season participation across all chapters</p>
      {standingsComputedAt && (
        <p className="text-md3-label-md text-slate-400 mb-3">
          Updated {formatDate.dateTime(standingsComputedAt)}
        </p>
      )}

      {standingsError && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{standingsError}</p>
      )}

      {standingsLoading && standings.length === 0 ? (
        <p className="text-slate-400 text-md3-body-md">Loading standings…</p>
      ) : (
        <ChapterStandingsTable standings={standings} />
      )}
    </section>
  )
}
