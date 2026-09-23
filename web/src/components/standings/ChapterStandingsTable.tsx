import { useMemo, useState, type ReactNode } from 'react'
import { AltArrowDownOutline, AltArrowUpOutline } from 'solar-icon-set'
import { regionBadgeClass } from '../../lib/chapters'
import {
  POINTS_TOTAL_LABEL,
  formatRate,
  sortStandings,
  tiedRates,
  type StandingSortColumn,
  type StandingSortDir,
} from '../../lib/standings'
import type { ChapterStanding } from '../../stores/useChapterStandingStore'

type SortDir = StandingSortDir

const DEFAULT_SORT_COLUMN: StandingSortColumn = 'participationRate'
const DEFAULT_SORT_DIR: SortDir = 'desc'

interface Column {
  key: StandingSortColumn | 'rank' | 'totalPoints' | 'pointsEarned'
  label: string
  numeric: boolean
  sortable: boolean
}

/**
 * One shared Chapter Standings table for both audiences — the officer view
 * and the HQ dashboard section render through it, so an officer and HQ
 * always look at the same numbers. 13 columns in the mockup's order; the two
 * points columns never sort, so nobody mistakes points for the basis of rank.
 */
const COLUMNS: Column[] = [
  { key: 'rank', label: '#', numeric: false, sortable: false },
  { key: 'chapter', label: 'Chapter', numeric: false, sortable: true },
  { key: 'region', label: 'Region', numeric: false, sortable: true },
  { key: 'participationRate', label: 'Participation rate', numeric: true, sortable: true },
  { key: 'totalPoints', label: POINTS_TOTAL_LABEL, numeric: true, sortable: false },
  { key: 'eligibleMembers', label: 'Eligible members', numeric: true, sortable: true },
  { key: 'participants', label: 'Checked in', numeric: true, sortable: true },
  { key: 'events', label: 'Events', numeric: true, sortable: true },
  { key: 'checkIns', label: 'Total check-ins', numeric: true, sortable: true },
  { key: 'avgPerEvent', label: 'Avg per event', numeric: true, sortable: true },
  { key: 'showUpRate', label: 'Show-up rate', numeric: true, sortable: true },
  { key: 'newMembers', label: 'New members', numeric: true, sortable: true },
  { key: 'pointsEarned', label: 'Points earned this season', numeric: true, sortable: false },
]

interface Props {
  standings: ChapterStanding[]
  /** Officer's own chapter — highlighted with a "Your chapter" pill. HQ passes none. */
  yourChapterId?: string | null
}

export default function ChapterStandingsTable({ standings, yourChapterId }: Props) {
  const [sortColumn, setSortColumn] = useState<StandingSortColumn>(DEFAULT_SORT_COLUMN)
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR)

  const rows = useMemo(
    () => sortStandings(standings, sortColumn, sortDir),
    [standings, sortColumn, sortDir],
  )
  const ties = useMemo(() => tiedRates(standings), [standings])

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

  const ariaSort = (col: Column): 'ascending' | 'descending' | 'none' => {
    if (!col.sortable || sortColumn !== col.key) return 'none'
    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  const cellFor = (row: ChapterStanding, key: Column['key']): ReactNode => {
    switch (key) {
      case 'rank':
        return <span className="font-bold text-slate-900">{row.rank ?? '—'}</span>
      case 'chapter':
        return (
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{row.chapter}</span>
            {yourChapterId && row.chapterId === yourChapterId && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue text-white">
                Your chapter
              </span>
            )}
          </span>
        )
      case 'region':
        return (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${regionBadgeClass(row.region)}`}>
            {row.region ?? '—'}
          </span>
        )
      case 'participationRate':
        if (row.status === 'no-events' || row.participationRate === null) {
          return row.status === 'no-events'
            ? <span className="font-normal text-slate-400">No events this season</span>
            : <span className="font-normal text-slate-400">—</span>
        }
        return (
          <span className="font-bold text-slate-900">
            {formatRate(row.participationRate)}
            {row.status === 'unranked' && (
              <span className="inline-block ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold/10" style={{ color: '#92700a' }}>
                Unranked
              </span>
            )}
            {row.status === 'ranked' && ties.has(row.participationRate) && (
              <span className="inline-block ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                tied at {formatRate(row.participationRate)} · A–Z
              </span>
            )}
          </span>
        )
      case 'totalPoints':
        // Old API responses (preview builds, stale cache) carry no total —
        // show 0 rather than crashing the whole table.
        return <span className="text-slate-700 font-semibold">{(row.totalPoints ?? 0).toLocaleString()}</span>
      case 'eligibleMembers':
        return <span className="text-slate-700 font-semibold">{row.eligibleMembers.toLocaleString()}</span>
      case 'participants':
        return <span className="text-slate-700 font-semibold">{row.participants.toLocaleString()}</span>
      case 'events':
        return <span className="text-slate-700 font-semibold">{row.events}</span>
      case 'checkIns':
        return <span className="text-slate-700 font-semibold">{row.checkIns.toLocaleString()}</span>
      case 'avgPerEvent':
        return <span className="text-slate-700 font-semibold">{row.avgPerEvent}</span>
      case 'showUpRate':
        return (
          <span className="text-slate-700 font-semibold">
            {row.showUpRate === null ? '—' : `${row.showUpRate}%`}
          </span>
        )
      case 'newMembers':
        return <span className="text-slate-700 font-semibold">{row.newMembers.toLocaleString()}</span>
      case 'pointsEarned':
        return <span className="text-slate-700 font-semibold">{row.xp.toLocaleString()}</span>
    }
  }

  return (
    <div>
      <p className="md:hidden text-md3-label-md text-slate-400 mb-2">
        Swipe the table to see more columns
      </p>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-md3-body-md">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort(col)}
                    className={`${col.key === 'rank' ? 'sticky left-0 z-20 bg-slate-50 w-12 min-w-12 ' : ''}${col.key === 'chapter' ? 'sticky left-12 z-20 bg-slate-50 ' : ''}${col.numeric ? 'text-right' : 'text-left'} px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key as StandingSortColumn)}
                        className={`inline-flex items-center gap-1 hover:text-slate-700 transition-colors ${col.numeric ? 'flex-row-reverse' : ''}`}
                      >
                        {col.label} {sortIcon(col.key as StandingSortColumn)}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOwn = yourChapterId != null && row.chapterId === yourChapterId
                return (
                  <tr
                    key={row.chapterId}
                    className={`${isOwn ? 'bg-blue/5' : 'bg-white'} border-b border-slate-50 transition-colors`}
                  >
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`${col.key === 'rank' ? `sticky left-0 z-[5] w-12 min-w-12 ${isOwn ? 'bg-[#eaf1fe]' : 'bg-white'} ` : ''}${col.key === 'chapter' ? `sticky left-12 z-[5] ${isOwn ? 'bg-[#eaf1fe]' : 'bg-white'} ` : ''}${col.numeric ? 'text-right' : 'text-left'} px-4 py-3`}
                      >
                        {cellFor(row, col.key)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No standings yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
