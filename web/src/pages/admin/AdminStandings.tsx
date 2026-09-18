import { useEffect, useMemo, useState } from 'react'
import { AltArrowDownOutline, AltArrowUpOutline } from 'solar-icon-set'
import { useChapterStandingStore, type ChapterStanding } from '../../stores/useChapterStandingStore'
import { regionBadgeClass } from '../../lib/chapters'
import { formatDate } from '../../lib/dates'

export type StandingSortColumn =
  | 'chapter'
  | 'region'
  | 'participationRate'
  | 'eligibleMembers'
  | 'participants'
  | 'events'
  | 'checkIns'
  | 'avgPerEvent'
  | 'showUpRate'
  | 'newMembers'
  | 'xp'

type SortDir = 'asc' | 'desc'

const DEFAULT_SORT_COLUMN: StandingSortColumn = 'participationRate'
const DEFAULT_SORT_DIR: SortDir = 'desc'

/** Ranked chapters hold positions; unranked ones carry a rate but no position; */
/** chapters with no events this season have no rate at all. */
function statusOrder(status: ChapterStanding['status']): number {
  switch (status) {
    case 'ranked': return 0
    case 'unranked': return 1
    case 'no-events': return 2
  }
}

function compareNumbers(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a - b) * dir
}

export function sortStandings(
  rows: ChapterStanding[],
  column: StandingSortColumn,
  dir: SortDir,
): ChapterStanding[] {
  const d = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    // Participation rate keeps the server's group order (ranked, then
    // unranked, then no events this season) in both directions, so the
    // default view is the same ranking officers see — an unranked chapter
    // never interleaves with ranked chapters however high its rate.
    if (column === 'participationRate') {
      return (
        statusOrder(a.status) - statusOrder(b.status) ||
        compareNumbers(a.participationRate, b.participationRate, d) ||
        a.chapter.localeCompare(b.chapter)
      )
    }
    switch (column) {
      case 'chapter': return a.chapter.localeCompare(b.chapter) * d
      case 'region': return (a.region ?? '').localeCompare(b.region ?? '') * d || a.chapter.localeCompare(b.chapter)
      case 'eligibleMembers': return (a.eligibleMembers - b.eligibleMembers) * d || a.chapter.localeCompare(b.chapter)
      case 'participants': return (a.participants - b.participants) * d || a.chapter.localeCompare(b.chapter)
      case 'events': return (a.events - b.events) * d || a.chapter.localeCompare(b.chapter)
      case 'checkIns': return (a.checkIns - b.checkIns) * d || a.chapter.localeCompare(b.chapter)
      case 'avgPerEvent': return (a.avgPerEvent - b.avgPerEvent) * d || a.chapter.localeCompare(b.chapter)
      case 'showUpRate': return compareNumbers(a.showUpRate, b.showUpRate, d) || a.chapter.localeCompare(b.chapter)
      case 'newMembers': return (a.newMembers - b.newMembers) * d || a.chapter.localeCompare(b.chapter)
      case 'xp': return (a.xp - b.xp) * d || a.chapter.localeCompare(b.chapter)
    }
  })
}

interface Column {
  key: StandingSortColumn
  label: string
  numeric: boolean
}

const COLUMNS: Column[] = [
  { key: 'chapter', label: 'Chapter', numeric: false },
  { key: 'region', label: 'Region', numeric: false },
  { key: 'participationRate', label: 'Participation rate', numeric: true },
  { key: 'eligibleMembers', label: 'Eligible members', numeric: true },
  { key: 'participants', label: 'Checked in', numeric: true },
  { key: 'events', label: 'Events', numeric: true },
  { key: 'checkIns', label: 'Total check-ins', numeric: true },
  { key: 'avgPerEvent', label: 'Avg per event', numeric: true },
  { key: 'showUpRate', label: 'Show-up rate', numeric: true },
  { key: 'newMembers', label: 'New members', numeric: true },
  { key: 'xp', label: 'XP earned', numeric: true },
]

export default function AdminStandings() {
  const { standings, standingsComputedAt, standingsLoading, standingsError, loadStandings } =
    useChapterStandingStore()

  const [sortColumn, setSortColumn] = useState<StandingSortColumn>(DEFAULT_SORT_COLUMN)
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR)

  useEffect(() => {
    void loadStandings()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () => sortStandings(standings, sortColumn, sortDir),
    [standings, sortColumn, sortDir],
  )

  // Click cycles a column: asc → desc → back to the default. The default
  // column needs its own arm: from (participationRate, desc) a plain reset
  // would re-set the state it already has, leaving ascending unreachable.
  const handleSort = (col: StandingSortColumn) => {
    if (sortColumn !== col) { setSortColumn(col); setSortDir('asc') }
    else if (sortDir === 'asc') { setSortDir('desc') }
    else if (col === DEFAULT_SORT_COLUMN) { setSortDir('asc') }
    else { setSortColumn(DEFAULT_SORT_COLUMN); setSortDir(DEFAULT_SORT_DIR) }
  }

  const sortIcon = (col: StandingSortColumn) => {
    if (sortColumn !== col) return null
    return sortDir === 'asc'
      ? <AltArrowUpOutline color="#1152D4" width={14} height={14} />
      : <AltArrowDownOutline color="#1152D4" width={14} height={14} />
  }

  const ariaSort = (col: StandingSortColumn): 'ascending' | 'descending' | 'none' => {
    if (sortColumn !== col) return 'none'
    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  return (
    <div className="p-4 pt-6 md:p-8 h-full flex flex-col">
      <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Chapter Standings</h1>
      <p className="text-md3-body-md text-slate-500 mb-1">Season participation across all chapters</p>
      {standingsComputedAt && (
        <p className="text-md3-label-md text-slate-400 mb-6">
          Updated {formatDate.dateTime(standingsComputedAt)}
        </p>
      )}

      {standingsError && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{standingsError}</p>
      )}

      {/* Standings table */}
      {standingsLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading standings…</p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full min-w-[1100px] text-md3-body-md">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-100 bg-slate-50">
                  {COLUMNS.map(({ key, label, numeric }, index) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={ariaSort(key)}
                      className={`${index === 0 ? 'sticky left-0 z-20 bg-slate-50 border-r border-slate-100 ' : ''}${numeric ? 'text-right' : 'text-left'} px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(key)}
                        className={`inline-flex items-center gap-1 hover:text-slate-700 transition-colors ${numeric ? 'flex-row-reverse' : ''}`}
                      >
                        {label} {sortIcon(key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.chapterId}
                    className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3 font-semibold text-slate-900">
                      {row.chapter}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${regionBadgeClass(row.region)}`}>
                        {row.region ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      {row.status === 'no-events' ? (
                        <span className="font-normal text-slate-400">No events this season</span>
                      ) : (
                        <>
                          {row.participationRate === null ? (
                            <span className="font-normal text-slate-400">—</span>
                          ) : (
                            `${row.participationRate}%`
                          )}
                          {row.status === 'unranked' && (
                            <span className="inline-block ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold/10" style={{ color: '#92700a' }}>
                              Unranked
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">{row.eligibleMembers.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">{row.participants.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">{row.events}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">{row.checkIns.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">{row.avgPerEvent}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">
                      {row.showUpRate === null ? '—' : `${row.showUpRate}%`}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">{row.newMembers.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">{row.xp.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="text-center py-10 text-slate-400 text-md3-body-md">No standings yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
