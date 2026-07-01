import { useEffect, useState } from 'react'
import {
  AddCircleOutline,
  PowerOutline,
  TrashBinTrashOutline,
  PenNewSquareOutline,
  AltArrowUpOutline,
  AltArrowDownOutline,
  LinkOutline,
} from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import {
  OFFICER_CATEGORY_LABELS,
  type OfficerResourceCategory,
} from '../../lib/officerResources'
import ConfirmDialog from '../../components/ConfirmDialog'

interface ResourceRow {
  id: string
  category: OfficerResourceCategory
  title: string
  subtitle: string | null
  href: string
  group_label: string | null
  sort_order: number
  is_active: boolean
}

interface Draft {
  id: string | null            // null = creating
  category: OfficerResourceCategory
  title: string
  subtitle: string
  href: string
  group: string                // subgroup heading; '' = ungrouped
  is_active: boolean
}

const CATEGORIES: OfficerResourceCategory[] = ['resource', 'training', 'seed_funds']

const CATEGORY_HINT: Record<OfficerResourceCategory, string> = {
  resource: 'Cards shown in the "Review Resources" slider on the officer dashboard.',
  training: 'Cards shown in the "Training and Policy" slider.',
  seed_funds: 'Cards shown in the "Seed Fund Request" slider (seed funds, liquidation, planning guides).',
}

const emptyDraft = (category: OfficerResourceCategory): Draft => ({
  id: null,
  category,
  title: '',
  subtitle: '',
  href: '',
  group: '',
  is_active: true,
})

// Bucket a category's rows into subgroups by group_label, preserving sort_order
// (first-appearance) order. Ungrouped rows lead, under a null label.
const groupRows = (items: ResourceRow[]): { label: string | null; rows: ResourceRow[] }[] => {
  const order: string[] = []
  const map = new Map<string, ResourceRow[]>()
  const ungrouped: ResourceRow[] = []
  for (const r of items) {
    const g = r.group_label?.trim()
    if (!g) { ungrouped.push(r); continue }
    if (!map.has(g)) { map.set(g, []); order.push(g) }
    map.get(g)!.push(r)
  }
  const labelled = order.map((label) => ({ label, rows: map.get(label)! }))
  return ungrouped.length ? [{ label: null, rows: ungrouped }, ...labelled] : labelled
}

const isValidUrl = (value: string): boolean => {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export default function AdminOfficerResources() {
  const [rows, setRows] = useState<ResourceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    const { data, error: dbErr } = await supabase
      .from('officer_resources')
      .select('id, category, title, subtitle, href, group_label, sort_order, is_active')
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })
    if (dbErr) setError(dbErr.message)
    setRows((data ?? []) as ResourceRow[])
    setIsLoading(false)
  }

  useEffect(() => { void load() }, [])

  const byCategory = (c: OfficerResourceCategory) =>
    rows.filter((r) => r.category === c).sort((a, b) => a.sort_order - b.sort_order)

  const handleSave = async () => {
    if (!draft) return
    setError(null)

    if (!draft.title.trim()) {
      setError('Title is required.')
      return
    }
    if (draft.href.trim() && !isValidUrl(draft.href.trim())) {
      setError('URL must start with http:// or https://')
      return
    }
    if (draft.is_active && !draft.href.trim()) {
      setError('Active links need a URL. Add a link or save it as inactive.')
      return
    }

    setSaving(true)
    if (draft.id) {
      const { data, error: dbErr } = await supabase
        .from('officer_resources')
        .update({
          title: draft.title.trim(),
          subtitle: draft.subtitle.trim() || null,
          href: draft.href.trim(),
          group_label: draft.group.trim() || null,
          is_active: draft.is_active,
        })
        .eq('id', draft.id)
        .select('id, category, title, subtitle, href, group_label, sort_order, is_active')
        .single()
      setSaving(false)
      if (dbErr) { setError(dbErr.message); return }
      setRows((prev) => prev.map((r) => (r.id === draft.id ? (data as ResourceRow) : r)))
    } else {
      // New rows append to the end of their category.
      const nextOrder =
        byCategory(draft.category).reduce((max, r) => Math.max(max, r.sort_order), -1) + 1
      const { data, error: dbErr } = await supabase
        .from('officer_resources')
        .insert({
          category: draft.category,
          title: draft.title.trim(),
          subtitle: draft.subtitle.trim() || null,
          href: draft.href.trim(),
          group_label: draft.group.trim() || null,
          is_active: draft.is_active,
          sort_order: nextOrder,
        })
        .select('id, category, title, subtitle, href, group_label, sort_order, is_active')
        .single()
      setSaving(false)
      if (dbErr) { setError(dbErr.message); return }
      setRows((prev) => [...prev, data as ResourceRow])
    }
    setDraft(null)
  }

  const [hideTarget, setHideTarget] = useState<ResourceRow | null>(null)

  const handleToggle = async (row: ResourceRow) => {
    // Don't allow activating a link with no URL.
    if (!row.is_active && !row.href.trim()) {
      setError('Add a URL before activating this link.')
      return
    }
    setBusyId(row.id)
    const { error: dbErr } = await supabase
      .from('officer_resources')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)
    setBusyId(null)
    if (dbErr) { setError(dbErr.message); return }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)))
  }

  const handleDelete = async (id: string) => {
    setBusyId(id)
    const { error: dbErr } = await supabase.from('officer_resources').delete().eq('id', id)
    setBusyId(null)
    setConfirmDeleteId(null)
    if (dbErr) { setError(dbErr.message); return }
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  // Swap sort_order with the adjacent row in the same category.
  const handleMove = async (row: ResourceRow, dir: -1 | 1) => {
    const siblings = byCategory(row.category)
    const idx = siblings.findIndex((r) => r.id === row.id)
    const swapWith = siblings[idx + dir]
    if (!swapWith) return

    setBusyId(row.id)
    const [resA, resB] = await Promise.all([
      supabase.from('officer_resources').update({ sort_order: swapWith.sort_order }).eq('id', row.id),
      supabase.from('officer_resources').update({ sort_order: row.sort_order }).eq('id', swapWith.id),
    ])
    setBusyId(null)
    const swapErr = resA.error || resB.error
    if (swapErr) { setError(swapErr.message); return }

    setRows((prev) =>
      prev.map((r) => {
        if (r.id === row.id) return { ...r, sort_order: swapWith.sort_order }
        if (r.id === swapWith.id) return { ...r, sort_order: row.sort_order }
        return r
      })
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-md3-headline-sm font-black text-slate-900">Officer Resources</h1>
        <p className="text-md3-body-md text-slate-500 mt-0.5">
          Manage the links shown in the officer dashboard's Review Resources, Training and Policy, and Seed Fund Request actions.
        </p>
      </div>

      {error && (
        <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {isLoading ? (
        <p className="text-slate-400 text-md3-body-md">Loading links…</p>
      ) : (
        <div className="space-y-8">
          {CATEGORIES.map((category) => {
            const items = byCategory(category)
            return (
              <section key={category}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-md3-title-md font-bold text-slate-900">{OFFICER_CATEGORY_LABELS[category]}</h2>
                    <p className="text-md3-label-md text-slate-400">{CATEGORY_HINT[category]}</p>
                  </div>
                  <button
                    onClick={() => { setError(null); setDraft(emptyDraft(category)) }}
                    className="flex items-center gap-2 px-3 py-2 bg-blue text-white text-md3-label-md font-bold rounded-xl hover:bg-blue-dark transition-colors shrink-0"
                  >
                    <AddCircleOutline className="w-4 h-4" />
                    Add link
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
                  {groupRows(items).map((group) => (
                    <div key={group.label ?? '__ungrouped__'}>
                      {group.label && (
                        <div className="px-4 py-2 bg-slate-50 border-y border-slate-100 first:border-t-0">
                          <p className="text-md3-label-sm font-bold text-slate-500 uppercase tracking-wide">{group.label}</p>
                        </div>
                      )}
                      <div className="divide-y divide-slate-100">
                        {group.rows.map((row) => {
                          // Global index within the category — the reorder swap and
                          // its bounds operate on the whole category's sort_order, not
                          // the subgroup, so a row can be nudged across a group edge.
                          const idx = items.indexOf(row)
                          return (
                            <div key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                              {/* Reorder */}
                              <div className="flex flex-col">
                                <button
                                  onClick={() => void handleMove(row, -1)}
                                  disabled={idx === 0 || busyId === row.id}
                                  className="text-slate-300 hover:text-blue disabled:opacity-30 disabled:hover:text-slate-300 transition-colors"
                                  title="Move up"
                                >
                                  <AltArrowUpOutline className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => void handleMove(row, 1)}
                                  disabled={idx === items.length - 1 || busyId === row.id}
                                  className="text-slate-300 hover:text-blue disabled:opacity-30 disabled:hover:text-slate-300 transition-colors"
                                  title="Move down"
                                >
                                  <AltArrowDownOutline className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-md3-body-md font-semibold text-slate-900 truncate">{row.title}</p>
                                {row.subtitle && (
                                  <p className="text-md3-label-md text-slate-400 truncate">{row.subtitle}</p>
                                )}
                                {row.href ? (
                                  <a
                                    href={row.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-md3-label-md text-blue hover:underline truncate max-w-full"
                                  >
                                    <LinkOutline className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{row.href}</span>
                                  </a>
                                ) : (
                                  <span className="text-md3-label-md text-promoted">No URL set</span>
                                )}
                              </div>

                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                row.is_active ? 'bg-green/10 text-green' : 'bg-slate-100 text-slate-400'
                              }`}>
                                {row.is_active ? 'Active' : 'Hidden'}
                              </span>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => { if (row.is_active) setHideTarget(row); else void handleToggle(row) }}
                                  disabled={busyId === row.id}
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue disabled:opacity-40 transition-colors"
                                  title={row.is_active ? 'Hide from officers' : 'Show to officers'}
                                >
                                  <PowerOutline className="w-5 h-5" color={row.is_active ? '#21C45D' : undefined} />
                                </button>
                                <button
                                  onClick={() => {
                                    setError(null)
                                    setDraft({
                                      id: row.id,
                                      category: row.category,
                                      title: row.title,
                                      subtitle: row.subtitle ?? '',
                                      href: row.href,
                                      group: row.group_label ?? '',
                                      is_active: row.is_active,
                                    })
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-blue/10 hover:text-blue transition-colors"
                                  title="Edit"
                                >
                                  <PenNewSquareOutline className="w-4 h-4" />
                                </button>
                                {confirmDeleteId === row.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="text-md3-label-md px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                                    >Cancel</button>
                                    <button
                                      onClick={() => void handleDelete(row.id)}
                                      disabled={busyId === row.id}
                                      className="text-md3-label-md px-2 py-1 rounded-lg bg-red text-white disabled:opacity-50 hover:bg-red/80 transition-colors"
                                    >{busyId === row.id ? '…' : 'Delete'}</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDeleteId(row.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red/10 hover:text-red transition-colors"
                                    title="Delete"
                                  >
                                    <TrashBinTrashOutline className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-center py-8 text-slate-400 text-md3-body-md">No links yet.</p>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Create / edit modal */}
      {draft && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40" onClick={() => setDraft(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-md3-title-md font-bold text-slate-900">
                {draft.id ? 'Edit link' : 'New link'}
              </h2>
              <p className="text-md3-label-md text-slate-400">{OFFICER_CATEGORY_LABELS[draft.category]}</p>
            </div>

            <div>
              <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Title</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. 2026 Chapter Leaders Playbook"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>

            <div>
              <label className="text-md3-label-md font-medium text-slate-700 block mb-1">Subtitle <span className="text-slate-400 font-normal">(optional)</span></label>
              <input
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                placeholder="Short context line"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>

            <div>
              <label className="text-md3-label-md font-medium text-slate-700 block mb-1">
                Group <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                value={draft.group}
                onChange={(e) => setDraft({ ...draft, group: e.target.value })}
                list="officer-resource-groups"
                placeholder="e.g. Funding Requests"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
              {/* Existing group names in this category — pick one to keep links together. */}
              <datalist id="officer-resource-groups">
                {Array.from(
                  new Set(
                    byCategory(draft.category)
                      .map((r) => r.group_label)
                      .filter((g): g is string => !!g),
                  ),
                ).map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <p className="text-md3-label-sm text-slate-400 mt-1">
                Links with the same group name are shown together under that heading. Leave blank to keep ungrouped.
              </p>
            </div>

            <div>
              <label className="text-md3-label-md font-medium text-slate-700 block mb-1">URL</label>
              <input
                value={draft.href}
                onChange={(e) => setDraft({ ...draft, href: e.target.value })}
                placeholder="https://…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-md3-body-md font-mono focus:outline-none focus:ring-2 focus:ring-blue"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                className="w-4 h-4 accent-blue"
              />
              <span className="text-md3-label-md text-slate-700">Visible to officers</span>
            </label>

            {error && <p className="text-red text-md3-label-md">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-4 py-2 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add link'}
              </button>
              <button
                onClick={() => { setDraft(null); setError(null) }}
                className="px-4 py-2 bg-slate-100 text-slate-600 text-md3-body-md font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {hideTarget && (
        <ConfirmDialog
          title="Hide this resource?"
          message={`"${hideTarget.title}" will be hidden from officers until you show it again.`}
          confirmLabel="Hide"
          tone="danger"
          loading={busyId === hideTarget.id}
          onConfirm={() => { void handleToggle(hideTarget); setHideTarget(null) }}
          onCancel={() => setHideTarget(null)}
        />
      )}
    </div>
  )
}
