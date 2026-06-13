import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AltArrowLeftOutline, TrashBin2Outline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { supabase } from '../../../lib/supabase'

interface FormState {
  title: string
  description: string
  xp_reward: number
  difficulty: 'easy' | 'medium' | 'hard'
  submission_type: 'self_attest' | 'proof_upload' | 'link'
  github_url: string
  is_active: boolean
}

const DEFAULT_FORM: FormState = {
  title:           '',
  description:     '',
  xp_reward:       100,
  difficulty:      'easy',
  submission_type: 'self_attest',
  github_url:      '',
  is_active:       true,
}

interface MissionFormProps {
  mode: 'create' | 'edit'
}

export default function MissionForm({ mode }: MissionFormProps) {
  const navigate = useNavigate()
  const { id: missionId } = useParams<{ id: string }>()

  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [isLoading, setIsLoading] = useState(mode === 'edit')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'edit' || !missionId) return
    const load = async () => {
      const { data, error: fetchErr } = await supabase
        .from('missions')
        .select('title, description, xp_reward, difficulty, submission_type, github_url, is_active')
        .eq('id', missionId)
        .single()
      if (fetchErr || !data) {
        setError('Mission not found.')
        setIsLoading(false)
        return
      }
      setForm({
        title:           data.title ?? '',
        description:     data.description ?? '',
        xp_reward:       data.xp_reward ?? 100,
        difficulty:      (data.difficulty as FormState['difficulty']) ?? 'easy',
        submission_type: (data.submission_type as FormState['submission_type']) ?? 'self_attest',
        github_url:      data.github_url ?? '',
        is_active:       data.is_active ?? true,
      })
      setIsLoading(false)
    }
    void load()
  }, [mode, missionId])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }
    if (form.xp_reward <= 0) {
      setError('XP Reward must be greater than 0.')
      return
    }
    setIsSaving(true)
    setError(null)

    const payload = {
      title:           form.title.trim(),
      description:     form.description.trim() || null,
      xp_reward:       form.xp_reward,
      difficulty:      form.difficulty,
      submission_type: form.submission_type,
      github_url:      form.github_url.trim() || null,
      is_active:       form.is_active,
    }

    if (mode === 'create') {
      const { error: insertErr } = await supabase.from('missions').insert(payload)
      if (insertErr) {
        setError(insertErr.message)
        setIsSaving(false)
        return
      }
    } else {
      const { error: updateErr } = await supabase
        .from('missions')
        .update(payload)
        .eq('id', missionId!)
      if (updateErr) {
        setError(updateErr.message)
        setIsSaving(false)
        return
      }
    }

    navigate('/organizer/missions')
  }

  const handleDelete = async () => {
    if (!missionId) return
    const confirmed = window.confirm('Delete this mission? This cannot be undone.')
    if (!confirmed) return
    await supabase.from('missions').delete().eq('id', missionId)
    navigate('/organizer/missions')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3 px-4 py-4">
          <motion.button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100"
            whileTap={{ scale: 0.9 }}
          >
            <AltArrowLeftOutline color="#334155" size={20} />
          </motion.button>
          <h1 className="flex-1 font-proxima font-bold text-slate-900 text-[20px] leading-none">
            {mode === 'create' ? 'New Mission' : 'Edit Mission'}
          </h1>
          {mode === 'edit' && (
            <motion.button
              onClick={() => void handleDelete()}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-red/10"
              whileTap={{ scale: 0.9 }}
            >
              <TrashBin2Outline color="#EF4444" size={18} />
            </motion.button>
          )}
        </div>
      </div>

      <div className="p-4 pb-24 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red/5 border border-red/20 rounded-xl px-4 py-3">
                <p className="text-md3-label-md text-red">{error}</p>
              </div>
            )}

            {/* Title */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-2">
                Title *
              </label>
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Contribute to Open Source"
                className="w-full font-proxima text-slate-900 text-md3-body-md outline-none placeholder:text-slate-300"
              />
            </div>

            {/* Description */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-2">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="What members need to do to complete this mission…"
                rows={3}
                className="w-full font-proxima text-slate-900 text-md3-body-md outline-none placeholder:text-slate-300 resize-none"
              />
            </div>

            {/* XP Reward */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-2">
                XP Reward *
              </label>
              <input
                type="number"
                min={1}
                value={form.xp_reward}
                onChange={(e) => set('xp_reward', Number(e.target.value))}
                className="w-full font-proxima text-slate-900 text-md3-body-md outline-none"
              />
            </div>

            {/* Difficulty */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-3">
                Difficulty
              </label>
              <div className="flex gap-2">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => set('difficulty', d)}
                    className={`flex-1 py-2 rounded-full text-[12px] font-semibold capitalize transition-colors ${
                      form.difficulty === d
                        ? d === 'easy'
                          ? 'bg-green text-white'
                          : d === 'medium'
                          ? 'bg-[#D97706] text-white'
                          : 'bg-red text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Submission Type */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-3">
                Submission Type
              </label>
              <div className="space-y-2">
                {([
                  { value: 'self_attest', label: 'Self Attest', desc: 'Member clicks "Done" — goes to approval queue' },
                  { value: 'proof_upload', label: 'Proof Upload', desc: 'Member submits a link for your review' },
                  { value: 'link', label: 'Link Track', desc: 'Member opens a URL — auto-tracked, no queue' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => set('submission_type', opt.value)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                      form.submission_type === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                      form.submission_type === opt.value ? 'border-primary' : 'border-slate-300'
                    }`}>
                      {form.submission_type === opt.value && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-md3-body-md">{opt.label}</p>
                      <p className="text-md3-label-md text-slate-500">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* GitHub / Link URL — shown for link and proof_upload types */}
            {(form.submission_type === 'link' || form.submission_type === 'proof_upload') && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-2">
                  {form.submission_type === 'link' ? 'Target URL' : 'Reference URL (optional)'}
                </label>
                <input
                  value={form.github_url}
                  onChange={(e) => set('github_url', e.target.value)}
                  placeholder="https://github.com/devcon-plus/..."
                  className="w-full font-proxima text-slate-900 text-md3-body-md outline-none placeholder:text-slate-300"
                />
              </div>
            )}

            {/* Active toggle */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900 text-md3-body-md">Active</p>
                <p className="text-md3-label-md text-slate-400">Visible to members when enabled</p>
              </div>
              <button
                onClick={() => set('is_active', !form.is_active)}
                className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${
                  form.is_active ? 'bg-green' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    form.is_active ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Save button */}
            <motion.button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="w-full bg-primary text-white font-bold py-3 rounded-full shadow-sm disabled:opacity-40 text-md3-label-lg"
              whileTap={{ scale: 0.97 }}
            >
              {isSaving ? 'Saving…' : mode === 'create' ? 'Create Mission' : 'Save Changes'}
            </motion.button>
          </>
        )}
      </div>
    </div>
  )
}
