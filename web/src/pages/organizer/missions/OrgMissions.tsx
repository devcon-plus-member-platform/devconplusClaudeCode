import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AddCircleOutline,
  AltArrowDownOutline,
  AltArrowLeftOutline,
  ClipboardListOutline,
  MagniferOutline,
  PenOutline,
} from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase'
import { fadeUp } from '../../../lib/animation'

// ── Types ─────────────────────────────────────────────────────────────────────

type SubmissionType = 'self_attest' | 'link' | 'proof_upload'
type StatusFilter = 'all' | 'active' | 'inactive'
type TypeFilter = 'all' | SubmissionType

interface MissionRow {
  id: string
  title: string
  description: string | null
  xp_reward: number
  difficulty: string
  submission_type: SubmissionType
  github_url: string | null
  is_active: boolean
  joined_count: number
  submitted_count: number
}

interface FormState {
  title: string
  xp_reward: number | ''
  difficulty: 'easy' | 'medium' | 'hard' | ''
  submission_type: SubmissionType | ''
  description: string
  github_url: string
}

interface FormErrors {
  title?: string
  xp_reward?: string
  difficulty?: string
  submission_type?: string
  description?: string
  github_url?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_FORM: FormState = {
  title: '',
  xp_reward: '',
  difficulty: '',
  submission_type: '',
  description: '',
  github_url: '',
}

const SUBMISSION_LABELS: Record<SubmissionType, string> = {
  self_attest: 'Self-Attest',
  link: 'Auto-Link',
  proof_upload: 'Proof Upload',
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Active / Inactive' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'self_attest', label: 'Self-Attest' },
  { value: 'link', label: 'Auto-Link' },
  { value: 'proof_upload', label: 'Proof Upload' },
]

// ── Helper ────────────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-red text-md3-label-md mt-1.5 font-medium">{msg}</p>
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrgMissions() {
  const navigate = useNavigate()

  // List state
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [openDropdown, setOpenDropdown] = useState<'status' | 'type' | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Form sheet state
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editMission, setEditMission] = useState<MissionRow | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [initialForm, setInitialForm] = useState<FormState>(DEFAULT_FORM)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  const isDirty = useMemo(
    () => (Object.keys(form) as Array<keyof FormState>).some((k) => form[k] !== initialForm[k]),
    [form, initialForm],
  )

  // Confirm-hide dialog
  const [confirmToggle, setConfirmToggle] = useState<MissionRow | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────

  const loadMissions = useCallback(async () => {
    setIsLoading(true)

    let query = supabase
      .from('missions')
      .select('id, title, description, xp_reward, difficulty, submission_type, github_url, is_active')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('is_active', statusFilter === 'active')
    }

    const { data: missionData } = await query
    const rows = missionData ?? []
    const ids = rows.map((m) => m.id)

    const [{ data: partData }, { data: subData }] = await Promise.all([
      supabase.from('mission_participants').select('mission_id').in('mission_id', ids),
      supabase.from('mission_submissions').select('mission_id').in('mission_id', ids),
    ])

    const joinedMap: Record<string, number> = {}
    const submittedMap: Record<string, number> = {}
    for (const p of partData ?? []) joinedMap[p.mission_id] = (joinedMap[p.mission_id] ?? 0) + 1
    for (const s of subData ?? []) {
      if (s.mission_id) submittedMap[s.mission_id] = (submittedMap[s.mission_id] ?? 0) + 1
    }

    setMissions(
      rows.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        xp_reward: m.xp_reward ?? 100,
        difficulty: m.difficulty ?? 'easy',
        submission_type: (m.submission_type ?? 'self_attest') as SubmissionType,
        github_url: m.github_url,
        is_active: m.is_active ?? true,
        joined_count: joinedMap[m.id] ?? 0,
        submitted_count: submittedMap[m.id] ?? 0,
      }))
    )
    setIsLoading(false)
  }, [statusFilter])

  useEffect(() => { void loadMissions() }, [loadMissions])

  // ── Toggle ────────────────────────────────────────────────────────────────

  const handleToggleRequest = (mission: MissionRow) => {
    if (togglingId) return
    if (mission.is_active && mission.joined_count > 0) {
      setConfirmToggle(mission)
      return
    }
    void doToggle(mission)
  }

  const doToggle = async (mission: MissionRow) => {
    setTogglingId(mission.id)
    setConfirmToggle(null)
    const newActive = !mission.is_active
    // When viewing all statuses, update in-place; otherwise remove from filtered view
    if (statusFilter === 'all') {
      setMissions((prev) =>
        prev.map((m) => (m.id === mission.id ? { ...m, is_active: newActive } : m))
      )
    } else {
      setMissions((prev) => prev.filter((m) => m.id !== mission.id))
    }
    const { error } = await supabase
      .from('missions')
      .update({ is_active: newActive })
      .eq('id', mission.id)
    if (error) void loadMissions()
    setTogglingId(null)
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditMission(null)
    setForm(DEFAULT_FORM)
    setInitialForm(DEFAULT_FORM)
    setFormErrors({})
    setSaveError(null)
    setFormMode('create')
  }

  const openEdit = (mission: MissionRow) => {
    const values: FormState = {
      title: mission.title,
      xp_reward: mission.xp_reward,
      difficulty: (mission.difficulty as FormState['difficulty']) ?? 'easy',
      submission_type: mission.submission_type,
      description: mission.description ?? '',
      github_url: mission.github_url ?? '',
    }
    setEditMission(mission)
    setForm(values)
    setInitialForm(values)
    setFormErrors({})
    setSaveError(null)
    setFormMode('edit')
  }

  const closeForm = () => {
    setFormMode(null)
    setEditMission(null)
    setShowDiscardDialog(false)
  }

  const handleBackPress = () => {
    if (isDirty) { setShowDiscardDialog(true) } else { closeForm() }
  }

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFormErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = (): boolean => {
    const errors: FormErrors = {}
    if (!form.title.trim()) errors.title = 'Required field'
    if (!form.xp_reward || Number(form.xp_reward) <= 0) errors.xp_reward = 'Required field'
    if (!form.difficulty) errors.difficulty = 'Required field'
    if (!form.submission_type) errors.submission_type = 'Required field'
    if (!form.description.trim()) errors.description = 'Required field'
    if (form.submission_type === 'link' && !form.github_url.trim())
      errors.github_url = 'Required field'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const hasErrors = Object.values(formErrors).some(Boolean)

  const handleSave = async () => {
    if (!validate()) return
    setIsSaving(true)
    setSaveError(null)
    const base = {
      title: form.title.trim(),
      description: form.description.trim(),
      xp_reward: Number(form.xp_reward),
      difficulty: form.difficulty || 'easy',
      submission_type: form.submission_type || 'self_attest',
      github_url: form.submission_type === 'link' ? form.github_url.trim() : null,
    }
    const { error } =
      formMode === 'create'
        ? await supabase.from('missions').insert({ ...base, is_active: true })
        : await supabase.from('missions').update(base).eq('id', editMission!.id)
    setIsSaving(false)
    if (error) {
      setSaveError('Could not save mission. Check your permissions and try again.')
      return
    }
    toast.success(formMode === 'create' ? 'Mission created.' : 'Mission saved.')
    closeForm()
    void loadMissions()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? 'Active / Inactive'
  const typeLabel =
    typeFilter === 'all' ? 'Type' : TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ?? 'Type'

  const filtered = missions.filter((m) => {
    if (typeFilter !== 'all' && m.submission_type !== typeFilter) return false
    if (searchQuery.trim()) return m.title.toLowerCase().includes(searchQuery.toLowerCase())
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-100 shadow-card">
        <AnimatePresence mode="wait">
          {showSearch ? (
            <motion.div
              key="search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 px-4 py-3.5"
            >
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search missions…"
                className="flex-1 font-proxima text-slate-900 text-md3-body-md outline-none"
              />
              <button
                onClick={() => { setShowSearch(false); setSearchQuery('') }}
                className="font-proxima text-slate-500 text-md3-label-md font-semibold"
              >
                Cancel
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 px-4 py-4"
            >
              <motion.button
                onClick={() => navigate('/organizer')}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100"
                whileTap={{ scale: 0.9 }}
              >
                <AltArrowLeftOutline color="#334155" size={20} />
              </motion.button>
              <h1 className="flex-1 font-proxima font-bold text-slate-900 text-[20px] leading-none">
                Manage Missions
              </h1>
              <motion.button
                onClick={() => setShowSearch(true)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100"
                whileTap={{ scale: 0.9 }}
              >
                <MagniferOutline color="#334155" size={18} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ── Create button ── */}
      <div className="px-4 pt-4">
        <motion.button
          onClick={openCreate}
          className="w-full bg-primary text-white font-proxima font-bold text-md3-label-lg h-11 rounded-full flex items-center justify-center gap-2"
          whileTap={{ scale: 0.97 }}
        >
          <AddCircleOutline color="white" size={18} />
          Create New Mission
        </motion.button>
      </div>

      {/* ── Filter chips ── */}
      {/* Backdrop to close any open dropdown */}
      {openDropdown && (
        <div className="fixed inset-0 z-20" onClick={() => setOpenDropdown(null)} />
      )}

      <div className="px-4 pt-4 pb-3 flex gap-2">

        {/* Status dropdown chip */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-md3-label-md font-proxima font-semibold transition-colors z-30 relative ${
              statusFilter !== 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span>{statusLabel}</span>
            <AltArrowDownOutline
              color={statusFilter !== 'all' ? 'white' : '#334155'}
              size={14}
            />
          </button>
          <AnimatePresence>
            {openDropdown === 'status' && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full mt-1.5 left-0 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); setOpenDropdown(null) }}
                    className={`w-full px-4 py-2.5 text-left text-md3-label-md font-proxima font-semibold transition-colors hover:bg-slate-50 ${
                      statusFilter === opt.value ? 'text-primary' : 'text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Type dropdown chip */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-md3-label-md font-proxima font-semibold transition-colors z-30 relative ${
              typeFilter !== 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span>{typeLabel}</span>
            <AltArrowDownOutline
              color={typeFilter !== 'all' ? 'white' : '#334155'}
              size={14}
            />
          </button>
          <AnimatePresence>
            {openDropdown === 'type' && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full mt-1.5 left-0 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setTypeFilter(opt.value); setOpenDropdown(null) }}
                    className={`w-full px-4 py-2.5 text-left text-md3-label-md font-proxima font-semibold transition-colors hover:bg-slate-50 ${
                      typeFilter === opt.value ? 'text-primary' : 'text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Mission List ── */}
      <div className="px-4 pb-24">
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-4 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-1/2 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="bg-white rounded-2xl border border-slate-200 p-10 flex flex-col items-center text-center"
          >
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <ClipboardListOutline color="#94A3B8" size={26} />
            </div>
            <p className="font-semibold text-slate-500 text-md3-body-md">
              {searchQuery
                ? 'No missions match your search.'
                : 'No missions yet — create your first.'}
            </p>
          </motion.div>
        ) : (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden divide-y divide-slate-100"
          >
            {filtered.map((mission) => (
              <MissionRow
                key={mission.id}
                mission={mission}
                isToggling={togglingId === mission.id}
                onToggle={handleToggleRequest}
                onEdit={openEdit}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* ── Create / Edit Full-Screen Sheet ── */}
      <AnimatePresence>
        {formMode !== null && (
          <motion.div
            className="fixed inset-0 z-[100] bg-slate-50 flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Blue header */}
            <div className="bg-primary shrink-0">
              <div className="flex items-center gap-3 px-4 py-4">
                <motion.button
                  onClick={handleBackPress}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20"
                  whileTap={{ scale: 0.9 }}
                >
                  <AltArrowLeftOutline color="white" size={20} />
                </motion.button>
                <h2 className="flex-1 text-center font-proxima font-bold text-white text-md3-title-lg leading-none pr-9">
                  {formMode === 'create' ? 'Create New Mission' : 'Edit Mission'}
                </h2>
              </div>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-4 pt-5 pb-6 space-y-4">

              {/* Save error */}
              {saveError && (
                <div className="bg-red/5 border border-red/20 rounded-xl px-4 py-3">
                  <p className="text-md3-label-md font-proxima font-semibold text-red">{saveError}</p>
                </div>
              )}

              {/* In-progress warning */}
              {formMode === 'edit' && editMission && editMission.joined_count > 0 && (
                <div className="bg-[#FEF3C7] border border-[#D97706]/30 rounded-xl px-4 py-3">
                  <p className="text-md3-label-md font-proxima font-semibold text-[#92400E]">
                    Editing affects {editMission.joined_count} in-progress{' '}
                    {editMission.joined_count === 1 ? 'member' : 'members'}
                  </p>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block font-proxima font-semibold text-slate-700 text-md3-body-md mb-1.5">
                  Title <span className="text-red">*</span>
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder="e.g., Complete Profile Details"
                  className={`w-full font-proxima text-slate-900 text-md3-body-md bg-white border rounded-xl px-4 py-3 outline-none placeholder:text-slate-300 ${
                    formErrors.title ? 'border-red' : 'border-slate-200'
                  }`}
                />
                <FieldError msg={formErrors.title} />
              </div>

              {/* EXP Reward */}
              <div>
                <label className="block font-proxima font-semibold text-slate-700 text-md3-body-md mb-1.5">
                  EXP Reward <span className="text-red">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.xp_reward}
                  onChange={(e) =>
                    setField('xp_reward', e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="e.g. 100"
                  className={`w-full font-proxima text-slate-900 text-md3-body-md bg-white border rounded-xl px-4 py-3 outline-none placeholder:text-slate-300 ${
                    formErrors.xp_reward ? 'border-red' : 'border-slate-200'
                  }`}
                />
                <FieldError msg={formErrors.xp_reward} />
              </div>

              {/* Category */}
              <div>
                <label className="block font-proxima font-semibold text-slate-700 text-md3-body-md mb-1.5">
                  Category <span className="text-red">*</span>
                </label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setField('difficulty', e.target.value as FormState['difficulty'])}
                  className={`w-full font-proxima text-md3-body-md bg-white border rounded-xl px-4 py-3 outline-none ${
                    form.difficulty ? 'text-slate-900' : 'text-slate-400'
                  } ${formErrors.difficulty ? 'border-red' : 'border-slate-200'}`}
                >
                  <option value="" disabled>Select category</option>
                  <option value="easy">Beginner</option>
                  <option value="medium">Intermediate</option>
                  <option value="hard">Advanced</option>
                </select>
                <FieldError msg={formErrors.difficulty} />
              </div>

              {/* Submission Type */}
              <div>
                <label className="block font-proxima font-semibold text-slate-700 text-md3-body-md mb-1.5">
                  Submission Type <span className="text-red">*</span>
                </label>
                <select
                  value={form.submission_type}
                  onChange={(e) => {
                    setField('submission_type', e.target.value as SubmissionType | '')
                    if (e.target.value !== 'link') setField('github_url', '')
                  }}
                  className={`w-full font-proxima text-md3-body-md bg-white border rounded-xl px-4 py-3 outline-none ${
                    form.submission_type ? 'text-slate-900' : 'text-slate-400'
                  } ${formErrors.submission_type ? 'border-red' : 'border-slate-200'}`}
                >
                  <option value="" disabled>Select submission type</option>
                  <option value="self_attest">Self-Attest</option>
                  <option value="link">Auto-Link</option>
                  <option value="proof_upload">Proof Upload</option>
                </select>
                <FieldError msg={formErrors.submission_type} />
              </div>

              {/* Target URL — Auto-Link only */}
              <AnimatePresence>
                {form.submission_type === 'link' && (
                  <motion.div
                    key="target-url"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                  >
                    <label className="block font-proxima font-semibold text-slate-700 text-md3-body-md mb-1.5">
                      Target URL <span className="text-red">*</span>
                    </label>
                    <input
                      value={form.github_url}
                      onChange={(e) => setField('github_url', e.target.value)}
                      placeholder="https://example.com"
                      className={`w-full font-proxima text-slate-900 text-md3-body-md bg-white border rounded-xl px-4 py-3 outline-none placeholder:text-slate-300 ${
                        formErrors.github_url ? 'border-red' : 'border-slate-200'
                      }`}
                    />
                    <FieldError msg={formErrors.github_url} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Instructions */}
              <div>
                <label className="block font-proxima font-semibold text-slate-700 text-md3-body-md mb-1.5">
                  Instructions <span className="text-red">*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Describe what members need to do…"
                  rows={4}
                  className={`w-full font-proxima text-slate-900 text-md3-body-md bg-white border rounded-xl px-4 py-3 outline-none placeholder:text-slate-300 resize-none ${
                    formErrors.description ? 'border-red' : 'border-slate-200'
                  }`}
                />
                <FieldError msg={formErrors.description} />
              </div>
            </div>

            {/* Save button — flex child pinned to bottom of column */}
            <div className="shrink-0 bg-white border-t border-slate-100 px-4 py-4">
              <motion.button
                onClick={() => void handleSave()}
                disabled={isSaving || hasErrors}
                className="w-full bg-primary text-white font-proxima font-bold text-md3-body-lg h-12 rounded-full disabled:opacity-40 transition-opacity"
                whileTap={{ scale: 0.97 }}
              >
                {isSaving ? 'Saving…' : 'Save & Publish'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Discard Changes Dialog ── */}
      <AnimatePresence>
        {showDiscardDialog && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-[110]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDiscardDialog(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[110] bg-white rounded-t-3xl p-6"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <p className="font-proxima font-bold text-slate-900 text-md3-title-lg mb-2">Discard changes?</p>
              <p className="text-slate-500 text-md3-body-md mb-6">
                You have unsaved changes. They will be lost if you leave now.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDiscardDialog(false)}
                  className="flex-1 h-12 rounded-full border border-slate-200 font-proxima font-semibold text-slate-700 text-md3-label-lg"
                >
                  Stay
                </button>
                <motion.button
                  onClick={closeForm}
                  className="flex-1 h-12 rounded-full bg-red text-white font-proxima font-bold text-md3-label-lg"
                  whileTap={{ scale: 0.97 }}
                >
                  Discard
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Confirm Hide Dialog ── */}
      <AnimatePresence>
        {confirmToggle && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmToggle(null)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl p-6"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <p className="font-proxima font-bold text-slate-900 text-md3-title-lg mb-2">Hide this mission?</p>
              <p className="text-slate-500 text-md3-body-md mb-6">
                This mission has{' '}
                <span className="font-semibold text-slate-700">{confirmToggle.joined_count}</span>{' '}
                {confirmToggle.joined_count === 1 ? 'member' : 'members'} in progress. It will be
                hidden from new members but remain visible to those already participating.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmToggle(null)}
                  className="flex-1 h-12 rounded-full border border-slate-200 font-proxima font-semibold text-slate-700 text-md3-label-lg"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={() => void doToggle(confirmToggle)}
                  className="flex-1 h-12 rounded-full bg-primary text-white font-proxima font-bold text-md3-label-lg"
                  whileTap={{ scale: 0.97 }}
                >
                  Hide from New Members
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Mission Row ───────────────────────────────────────────────────────────────

interface MissionRowProps {
  mission: MissionRow
  isToggling: boolean
  onToggle: (mission: MissionRow) => void
  onEdit: (mission: MissionRow) => void
}

function MissionRow({ mission, isToggling, onToggle, onEdit }: MissionRowProps) {
  const typeLabel = SUBMISSION_LABELS[mission.submission_type]

  return (
    <div className="flex items-center gap-3 px-4 py-4">
      {/* Left: title, badge, stats */}
      <div className="flex-1 min-w-0">
        <p className="font-proxima font-bold text-slate-900 text-md3-body-lg leading-snug">{mission.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-md3-label-sm font-proxima font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {typeLabel}
          </span>
          <span className="text-md3-label-sm font-proxima text-slate-400">
            {mission.joined_count} joined · {mission.submitted_count} submitted
          </span>
        </div>
      </div>

      {/* Right: edit icon + toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <motion.button
          onClick={() => onEdit(mission)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          whileTap={{ scale: 0.9 }}
        >
          <PenOutline color="#94A3B8" size={16} />
        </motion.button>
        <button
          onClick={() => onToggle(mission)}
          disabled={isToggling}
          className={`relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0 ${
            mission.is_active ? 'bg-green' : 'bg-slate-200'
          } disabled:opacity-50`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              mission.is_active ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
