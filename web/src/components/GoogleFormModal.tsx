import { AnimatePresence, motion } from 'framer-motion'
import { CloseCircleOutline, ArrowRightUpOutline } from 'solar-icon-set'
import { slideUp, backdrop } from '../lib/animation'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  formUrl: string
}

export default function GoogleFormModal({ open, onClose, title, formUrl }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-50"
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
          />

          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 bg-slate-50 rounded-t-3xl h-[90dvh] flex flex-col shadow-2xl md:inset-0 md:m-auto md:bottom-auto md:left-auto md:right-auto md:top-auto md:h-fit md:max-h-[85vh] md:w-full md:max-w-2xl md:rounded-3xl"
            variants={slideUp}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-slate-100 shrink-0">
              <div className="w-9 h-1 bg-slate-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
              <h2 className="text-md3-title-md font-bold text-slate-900 font-proxima pt-2">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors pt-2"
              >
                <CloseCircleOutline color="#94A3B8" size={22} />
              </button>
            </div>

            <div className="px-4 pt-3 pb-2 shrink-0">
              <a
                href={formUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-md3-label-lg font-semibold py-2.5 rounded-full shadow-sm hover:bg-slate-50 transition-colors"
              >
                Open in new tab
                <ArrowRightUpOutline color="#334155" size={16} />
              </a>
            </div>

            <div className="flex-1 overflow-hidden px-4 pb-4">
              <iframe
                src={`${formUrl}?embedded=true`}
                title={title}
                className="w-full h-full rounded-2xl bg-white"
              >
                Loading form…
              </iframe>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
