import { useState } from 'react'
import { createPortal } from 'react-dom'
import { RocketOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { backdrop, slideUp } from '../lib/animation'

interface Props {
  onClose: () => void
  feature?: string
}

export default function ComingSoonModal({ onClose, feature = 'This feature' }: Props) {
  const [visible, setVisible] = useState(true)

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 220)
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
              <div className="flex justify-center mb-3">
                <RocketOutline className="w-12 h-12" color="rgb(var(--color-primary))" />
              </div>
              <h2 className="text-md3-title-lg font-bold text-slate-900 mb-1">Coming Soon</h2>
              <p className="text-md3-body-md text-slate-500 mb-6">{feature} is launching soon. Stay tuned!</p>
              <button
                onClick={handleClose}
                className="w-full bg-primary text-white text-md3-body-md font-bold py-3 rounded-xl transition-opacity hover:opacity-90"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
