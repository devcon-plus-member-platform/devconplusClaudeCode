import { useEffect, useState } from 'react'
import { PenOutline, CheckCircleOutline, CloseCircleLineDuotone, AddCircleOutline, TrashBinTrashOutline } from 'solar-icon-set'
import { apiFetch, publicFetch } from '../../lib/api'
import { usePagination } from '../../hooks/usePagination'
import Pagination from '../../components/Pagination'
import type { Chapter, Region } from '@devcon-plus/supabase'

const REGIONS: Region[] = ['Luzon', 'Visayas', 'Mindanao']

interface ChapterStatsRow {
  chapter_id: string
  chapter: string
  members: number
  events: number
  xp: number
}

interface ChapterStats {
  members: number
  events: number
  xp: number
}

function regionBadgeClass(region: string | null | undefined): string {
  switch (region) {
    case 'Luzon': return 'bg-blue/10 text-blue'
    case 'Visayas': return 'bg-gold/10 text-gold'
    case 'Mindanao': return 'bg-green/10 text-green'
    default: return 'bg-slate-100 text-slate-400'
  }
}

export default function AdminChapters() {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageItems, ...pagination } = usePagination(chapters, 10)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRegion, setEditRegion] = useState<Region>('Luzon')
  const [saving, setSaving] = useState(false)

  // Add state
  const [addName, setAddName] = useState('')
  const [addRegion, setAddRegion] = useState<Region>('Luzon')
  const [adding, setAdding] = useState(false)

  // Delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [statsLookup, setStatsLookup] = useState<Record<string, ChapterStats>>({})

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [chapterRows, statsRows] = await Promise.all([
          publicFetch<Chapter[]>('/api/chapters'),
          apiFetch<ChapterStatsRow[]>('/api/chapters/stats'),
        ])

        setChapters(chapterRows)
        const lookup: Record<string, ChapterStats> = {}
        statsRows.forEach(({ chapter_id, members, events, xp }) => {
          lookup[chapter_id] = { members, events, xp }
        })
        setStatsLookup(lookup)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chapters')
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [])

  const startEdit = (chapter: Chapter) => {
    setEditingId(chapter.id)
    setEditName(chapter.name)
    setEditRegion((chapter.region as Region) ?? 'Luzon')
    setError(null)
  }

  const cancelEdit = () => { setEditingId(null) }

  const saveEdit = async (id: string) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await apiFetch<Chapter>(`/api/chapters/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, region: editRegion }),
      })
      setChapters((prev) => prev.map((c) => c.id === id ? updated : c))
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  const addChapter = async () => {
    if (!addName.trim()) return
    setAdding(true)
    setError(null)
    try {
      const created = await apiFetch<Chapter>('/api/chapters', {
        method: 'POST',
        body: JSON.stringify({ name: addName.trim(), region: addRegion }),
      })

      setChapters((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      )
      setAddName('')
      setAddRegion('Luzon')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setAdding(false)
    }
  }

  const deleteChapter = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      await apiFetch<void>(`/api/chapters/${id}`, { method: 'DELETE' })
      setChapters((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="p-4 pt-6 md:p-8 h-full flex flex-col">
      <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Chapters</h1>
      <p className="text-md3-body-md text-slate-500 mb-6">Manage DEVCON chapters</p>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {/* Add chapter form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 shadow-card flex flex-col sm:flex-row sm:items-end gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Chapter Name</label>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addChapter()}
            placeholder="e.g. Batangas"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div className="sm:w-auto">
          <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Region</label>
          <select
            value={addRegion}
            onChange={(e) => setAddRegion(e.target.value as Region)}
            className="w-full sm:w-auto border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
          >
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button
          onClick={() => void addChapter()}
          disabled={adding || !addName.trim()}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark disabled:opacity-60 transition-colors shrink-0"
        >
          <AddCircleOutline className="w-4 h-4" />
          {adding ? 'Adding…' : 'Add Chapter'}
        </button>
      </div>

      {/* Chapters table */}
      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading chapters…</p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full min-w-[640px] text-md3-body-md">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="sticky left-0 z-20 bg-slate-50 border-r border-slate-100 text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">
                    Chapter
                  </th>
                  <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Region</th>
                  <th className="text-right px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Members</th>
                  <th className="text-right px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Events</th>
                  <th className="text-right px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">XP</th>
                  <th className="text-left px-4 py-3 text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((chapter) => {
                  const stats = statsLookup[chapter.id]
                  const memberCount = stats?.members ?? 0
                  const eventCount = stats?.events ?? 0
                  const xp = stats?.xp ?? 0
                  const isEditing = editingId === chapter.id

                  return (
                    <tr key={chapter.id} className="bg-white border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="sticky left-0 z-[5] bg-inherit border-r border-slate-100 px-4 py-3 font-semibold text-slate-900">
                        {isEditing ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="border border-slate-200 rounded-lg px-2 py-1.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue w-36"
                            autoFocus
                          />
                        ) : (
                          chapter.name
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editRegion}
                            onChange={(e) => setEditRegion(e.target.value as Region)}
                            className="border border-slate-200 rounded-lg px-2 py-1.5 text-md3-label-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
                          >
                            {REGIONS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${regionBadgeClass(chapter.region)}`}>
                            {chapter.region ?? '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 font-semibold">{memberCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-slate-700 font-semibold">{eventCount}</td>
                      <td className="px-4 py-3 text-right text-gold font-bold">{(xp / 1000).toFixed(0)}K</td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(chapter.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => void saveEdit(chapter.id)}
                              disabled={saving || !editName.trim()}
                              className="p-1.5 rounded-lg bg-green/10 text-green hover:bg-green/20 disabled:opacity-50"
                            >
                              <CheckCircleOutline className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
                            >
                              <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
                            </button>
                          </div>
                        ) : confirmDeleteId === chapter.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-md3-label-md text-slate-500">Sure?</span>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-md3-label-md px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => void deleteChapter(chapter.id)}
                              disabled={deletingId === chapter.id}
                              className="text-md3-label-md px-2 py-1 rounded-lg bg-red text-white disabled:opacity-50 hover:bg-red/80 transition-colors"
                            >
                              {deletingId === chapter.id ? '…' : 'Delete'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(chapter)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue transition-colors"
                            >
                              <PenOutline className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(chapter.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                            >
                              <TrashBinTrashOutline className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {chapters.length === 0 && (
              <p className="text-center py-10 text-slate-400 text-md3-body-md">No chapters found.</p>
            )}
          </div>
          <Pagination controller={pagination} itemLabel="chapter" className="border-t border-slate-100 shrink-0" />
        </div>
      )}
    </div>
  )
}
