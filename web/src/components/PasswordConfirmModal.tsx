import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { EyeOutline, EyeClosedOutline } from 'solar-icon-set'
import { backdrop, slideUp } from '../lib/animation'

interface Props {
  title: string
  description: string
  confirmLabel?: string
  onConfirm: (password: string) => Promise<void>
  onClose: () => void
}

export default function PasswordConfirmModal({
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onClose,
}: Props) {
  const [visible, setVisible] = useState(true)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 220)
  }

  const handleConfirm = async () => {
    if (!password) { setError('Password is required'); return }
    setError(null)
    setIsLoading(true)
    try {
      await onConfirm(password)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-[60]"
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl p-6 pb-10"
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
            <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">{title}</h2>
            <p className="text-md3-body-md text-slate-500 mb-5">{description}</p>

            <div className="relative mb-3">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your current password"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirm() }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                tabIndex={-1}
              >
                {showPassword ? <EyeClosedOutline className="w-4 h-4" /> : <EyeOutline className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={handleClose}
                disabled={isLoading}
                className="flex-1 py-3 bg-slate-100 text-slate-700 text-md3-body-md font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleConfirm()}
                disabled={isLoading}
                className="flex-1 bg-primary text-white text-md3-body-md font-bold py-3 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {isLoading ? 'Verifying…' : confirmLabel}
              </button>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
