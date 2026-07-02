import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CloseCircleLineDuotone } from 'solar-icon-set'
import { backdrop, slideUp } from '../../lib/animation'
import ConfirmDialog from '../../components/ConfirmDialog'

// Shared form/dialog primitives for the admin CMS surfaces (AdminCMS + AdminMissions).
// Kept in one module so the stateful RejectModal has a single source of truth —
// it's used by both the CMS "Point Submissions" tab and the Missions review queue.

export const INPUT_CLS = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue'
export const LABEL_CLS = 'text-md3-label-md font-medium text-slate-700 block mb-1'

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-10 h-5 rounded-full transition-colors relative overflow-hidden ${checked ? 'bg-blue' : 'bg-slate-200'}`}
    >
      <span
        className={`absolute top-0.5 left-0 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-md3-body-md text-slate-700">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

interface SlideOverProps {
  title: string
  onClose: () => void
  onSubmit: () => void
  saving: boolean
  submitLabel?: string
  children: ReactNode
}

export function SlideOver({ title, onClose, onSubmit, saving, submitLabel = 'Save', children }: SlideOverProps) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-96 max-w-[88vw] bg-white h-full shadow-2xl overflow-y-auto flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-md3-title-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose}>
            <CloseCircleLineDuotone className="w-4 h-4" color="#EF4444" />
          </button>
        </div>
        <form
          className="flex-1 p-6 space-y-4"
          onSubmit={(e) => { e.preventDefault(); onSubmit() }}
        >
          {children}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-blue text-white text-md3-body-md font-bold rounded-xl hover:bg-blue-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ConfirmDelete({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      title={`Delete ${label}?`}
      message="This action cannot be undone."
      confirmLabel="Delete"
      tone="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

interface RejectModalProps {
  // Structural type — accepts both SubmissionRow (point submissions) and
  // MissionSubmissionRow (mission review queue); only these fields are read.
  sub: { id: string; member_name: string; mission_title: string }
  onConfirm: (subId: string, remarks: string) => Promise<void>
  onClose: () => void
  loading: boolean
}

export function RejectModal({ sub, onConfirm, onClose, loading }: RejectModalProps) {
  const [remarks, setRemarks] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} variants={backdrop} initial="hidden" animate="visible" exit="hidden" />
      <motion.div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 pb-8 z-10"
        variants={slideUp} initial="hidden" animate="visible" exit="hidden"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-md3-title-md font-bold text-slate-900">Reject Submission</h3>
          <button onClick={onClose} className="p-1">
            <CloseCircleLineDuotone color="#EF4444" width={20} height={20} />
          </button>
        </div>
        <p className="text-md3-body-md text-slate-600 mb-5">
          Rejecting <span className="font-semibold text-slate-900">{sub.member_name}</span>'s submission for{' '}
          <span className="font-semibold text-slate-900">{sub.mission_title}</span>. Admin remarks are required.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (remarks.trim()) void onConfirm(sub.id, remarks.trim()) }} className="space-y-4">
          <div>
            <label className="text-md3-label-md font-semibold text-slate-700 block mb-1.5">
              Admin Remarks <span className="text-red">*</span>
            </label>
            <textarea
              ref={textareaRef}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              placeholder="Explain why this submission was rejected…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-red/40 resize-none"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">This will be visible to the member in their notification.</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-slate-200 rounded-xl text-md3-body-md font-semibold text-slate-600">
              Cancel
            </button>
            <motion.button
              type="submit"
              disabled={loading || !remarks.trim()}
              whileTap={{ scale: 0.95 }}
              className="flex-1 py-3 bg-red text-white rounded-xl text-md3-body-md font-bold disabled:opacity-50"
            >
              {loading ? 'Rejecting…' : 'Reject'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
