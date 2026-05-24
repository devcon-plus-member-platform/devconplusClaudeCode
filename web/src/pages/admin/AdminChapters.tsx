import { useEffect, useState } from 'react'
import { PenOutline, CheckCircleOutline, CloseCircleLineDuotone, AddCircleOutline, TrashBinTrashOutline, AltArrowDownOutline } from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import type { Chapter, Region } from '@devcon-plus/supabase'

const REGIONS: Region[] = ['Luzon', 'Visayas', 'Mindanao']

// ─── ChapterCard ────────────────────────────────────────────────────────────

interface ChapterCardProps {
  chapter: Chapter
  xp: number
  isExpanded: boolean
  onToggle: () => void
  editingId: string | null
  editName: string
  editRegion: Region
  onEditNameChange: (v: string) => void
  onEditRegionChange: (v: Region) => void
  onEdit: (chapter: Chapter) => void
  onSaveEdit: (id: string) => Promise<void>
  onCancelEdit: () => void
  saving: boolean
  confirmDeleteId: string | null
  onDelete: (id: string) => void
  onConfirmDelete: (id: string) => Promise<void>
  onCancelDelete: () => void
  deletingId: string | null
}

function ChapterCard({
  chapter,
  xp,
  isExpanded,
  onToggle,
  editingId,
  editName,
  editRegion,
  onEditNameChange,
  onEditRegionChange,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  saving,
  confirmDeleteId,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  deletingId,
}: ChapterCardProps) {
  const memberCount = Math.floor(xp / 80)
  const eventCount = Math.floor(xp / 35000)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
      {/* Card header — collapsed view */}
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        {/* Left: chapter name + region badge */}
        <div className="flex-1 min-w-0">
          {editingId === chapter.id ? (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                value={editName}
                onChange={(e) => onEditNameChange(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue w-44"
                autoFocus
              />
              <select
                value={editRegion}
                onChange={(e) => onEditRegionChange(e.target.value as Region)}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-md3-label-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button
                onClick={() => void onSaveEdit(chapter.id)}
                disabled={saving || !editName.trim()}
                className="p-1.5 rounded-lg bg-green/10 text-green hover:bg-green/20 disabled:opacity-50"
              >
                <CheckCircleOutline className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">{chapter.name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                chapter.region === 'Luzon'    ? 'bg-blue/10 text-blue'   :
                chapter.region === 'Visayas'  ? 'bg-gold/10 text-gold'   :
                chapter.region === 'Mindanao' ? 'bg-green/10 text-green' :
                'bg-slate-100 text-slate-400'
              }`}>
                {chapter.region ?? '—'}
              </span>
            </div>
          )}
        </div>

        {/* Center: 3 inline stats (hidden while editing) */}
        {editingId !== chapter.id && (
          <div className="flex items-center gap-6 text-center shrink-0">
            <div>
              <p className="text-md3-body-md font-bold text-slate-900">{memberCount.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400">Members</p>
            </div>
            <div>
              <p className="text-md3-body-md font-bold text-slate-900">{eventCount}</p>
              <p className="text-[10px] text-slate-400">Events</p>
            </div>
            <div>
              <p className="text-md3-body-md font-bold text-slate-900">{(xp / 1000).toFixed(0)}K</p>
              <p className="text-[10px] text-slate-400">XP</p>
            </div>
          </div>
        )}

        {/* Right: Edit / Delete actions + expand chevron (hidden while editing) */}
        {editingId !== chapter.id && (
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmDeleteId === chapter.id ? (
              <div className="flex items-center gap-2">
                <span className="text-md3-label-md text-slate-500">Sure?</span>
                <button
                  onClick={() => onCancelDelete()}
                  className="text-md3-label-md px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void onConfirmDelete(chapter.id)}
                  disabled={deletingId === chapter.id}
                  className="text-md3-label-md px-2 py-1 rounded-lg bg-red text-white disabled:opacity-50"
                >
                  {deletingId === chapter.id ? '…' : 'Delete'}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onEdit(chapter)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue transition-colors"
                >
                  <PenOutline className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(chapter.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                >
                  <TrashBinTrashOutline className="w-4 h-4" />
                </button>
              </>
            )}
            <AltArrowDownOutline
              className={`w-4 h-4 text-slate-400 ml-2 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && editingId !== chapter.id && (
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50">
          <div className="grid grid-cols-2 gap-4">
            {/* XP visualization */}
            <div>
              <p className="text-md3-label-md font-bold uppercase tracking-wide text-slate-400 mb-3">XP Overview</p>
              <div className="space-y-2">
                <div className="flex justify-between text-md3-body-md">
                  <span className="text-slate-600">Total XP Awarded</span>
                  <span className="font-bold text-gold">{xp.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold rounded-full"
                    style={{ width: `${Math.min(100, (xp / 820000) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400">vs. top chapter (Manila: 820K XP)</p>
              </div>
            </div>

            {/* Quick stats */}
            <div>
              <p className="text-md3-label-md font-bold uppercase tracking-wide text-slate-400 mb-3">Quick Stats</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-md3-body-md">
                  <span className="text-slate-500">Avg XP / Member</span>
                  <span className="font-semibold text-slate-700">
                    {memberCount > 0 ? Math.round(xp / memberCount).toLocaleString() : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-md3-body-md">
                  <span className="text-slate-500">Region</span>
                  <span className="font-semibold text-slate-700">{chapter.region ?? '—'}</span>
                </div>
                <div className="flex justify-between text-md3-body-md">
                  <span className="text-slate-500">Created</span>
                  <span className="font-semibold text-slate-700">
                    {new Date(chapter.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AdminChapters ───────────────────────────────────────────────────────────

export default function AdminChapters() {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Expand state
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  const [xpLookup, setXpLookup] = useState<Record<string, number>>({})

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      const [chaptersRes, xpRes] = await Promise.all([
        supabase.from('chapters').select('*').order('name'),
        supabase.rpc('get_xp_by_chapter'),
      ])
      if (chaptersRes.error) { setError(chaptersRes.error.message); setIsLoading(false); return }
      setChapters((chaptersRes.data ?? []) as Chapter[])
      const lookup: Record<string, number> = {}
      ;((xpRes.data ?? []) as { chapter: string; xp: number }[]).forEach(({ chapter, xp }) => {
        lookup[chapter] = xp
      })
      setXpLookup(lookup)
      setIsLoading(false)
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
    const { error: dbErr } = await supabase
      .from('chapters')
      .update({ name: editName, region: editRegion })
      .eq('id', id)
    setSaving(false)
    if (dbErr) { setError(dbErr.message); return }
    setChapters((prev) =>
      prev.map((c) => c.id === id ? { ...c, name: editName, region: editRegion } : c)
    )
    setEditingId(null)
  }

  const addChapter = async () => {
    if (!addName.trim()) return
    setAdding(true)
    setError(null)
    const { data, error: dbErr } = await supabase
      .from('chapters')
      .insert({ name: addName.trim(), region: addRegion })
      .select()
      .single()
    setAdding(false)
    if (dbErr) { setError(dbErr.message); return }
    setChapters((prev) =>
      [...prev, data as Chapter].sort((a, b) => a.name.localeCompare(b.name))
    )
    setAddName('')
    setAddRegion('Luzon')
  }

  const deleteChapter = async (id: string) => {
    setDeletingId(id)
    setError(null)
    const { error: dbErr } = await supabase.from('chapters').delete().eq('id', id)
    setDeletingId(null)
    setConfirmDeleteId(null)
    if (dbErr) { setError(dbErr.message); return }
    setChapters((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-md3-headline-sm font-black text-slate-900 mb-1">Chapters</h1>
          <p className="text-md3-body-md text-slate-500">Manage DEVCON chapters</p>
        </div>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {/* Add chapter form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 shadow-card flex items-end gap-3">
        <div className="flex-1">
          <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Chapter Name</label>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addChapter()}
            placeholder="e.g. Batangas"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
          />
        </div>
        <div>
          <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Region</label>
          <select
            value={addRegion}
            onChange={(e) => setAddRegion(e.target.value as Region)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
          >
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button
          onClick={() => void addChapter()}
          disabled={adding || !addName.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark disabled:opacity-60 transition-colors"
        >
          <AddCircleOutline className="w-4 h-4" />
          {adding ? 'Adding…' : 'Add Chapter'}
        </button>
      </div>

      {/* Chapter cards */}
      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading chapters…</p>
      ) : (
        <div className="space-y-3">
          {chapters.map((chapter) => (
            <ChapterCard
              key={chapter.id}
              chapter={chapter}
              xp={xpLookup[chapter.name] ?? 0}
              isExpanded={expandedId === chapter.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === chapter.id ? null : chapter.id))
              }
              editingId={editingId}
              editName={editName}
              editRegion={editRegion}
              onEditNameChange={setEditName}
              onEditRegionChange={setEditRegion}
              onEdit={startEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              saving={saving}
              confirmDeleteId={confirmDeleteId}
              onDelete={(id) => setConfirmDeleteId(id)}
              onConfirmDelete={deleteChapter}
              onCancelDelete={() => setConfirmDeleteId(null)}
              deletingId={deletingId}
            />
          ))}
          {chapters.length === 0 && (
            <p className="text-center py-10 text-slate-400 text-md3-body-md">No chapters found.</p>
          )}
        </div>
      )}
    </div>
  )
}
