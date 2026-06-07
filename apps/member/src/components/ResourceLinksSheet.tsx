import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRightUpOutline, DocumentTextOutline, CloseCircleOutline } from 'solar-icon-set'
import { staggerContainer, cardItem } from '../lib/animation'
import type { OfficerLink } from '../lib/officerResources'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  links: OfficerLink[]
}

/**
 * Responsive link picker — used by the officer dashboard's "Review Resources"
 * and "View Training Archive" CTAs.
 *   • Mobile: slide-up bottom sheet (mirrors <AddToCalendarSheet />).
 *   • Desktop (md+): centered modal dialog.
 * Both share one panel; only the flex alignment + rounding/handle differ.
 */
export default function ResourceLinksSheet({ isOpen, onClose, title, subtitle, links }: Props) {
  const open = (href: string) => {
    if (!href) return
    window.open(href, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Alignment switch: docked to bottom on mobile, centered on desktop */}
          <div className="fixed inset-0 z-[70] flex justify-center items-end md:items-center md:p-4 pointer-events-none">
            <motion.div
              className="relative w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl px-4 pt-4 pb-10 md:pb-6 max-h-[85vh] md:max-h-[80vh] flex flex-col pointer-events-auto shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Grab handle — mobile only */}
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200 shrink-0 md:hidden" />

              {/* Close button — desktop only */}
              <button
                onClick={onClose}
                className="hidden md:flex absolute top-4 right-4 w-9 h-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <CloseCircleOutline className="w-6 h-6" color="#94A3B8" />
              </button>

              <h3 className="text-md3-body-lg font-bold text-slate-900 mb-1 shrink-0 md:pr-10">{title}</h3>
              {subtitle && <p className="text-md3-body-md text-slate-400 mb-4 shrink-0">{subtitle}</p>}

              {links.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue/10 flex items-center justify-center mb-3">
                    <DocumentTextOutline className="w-6 h-6" color="#1152D4" />
                  </div>
                  <p className="text-md3-body-md font-semibold text-slate-700">Nothing here yet</p>
                  <p className="text-md3-label-md text-slate-400 mt-1">Check back soon — resources are on the way.</p>
                </div>
              ) : (
                <motion.div
                  className="space-y-3 overflow-y-auto"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {links.map((link) => (
                    <motion.button
                      key={link.title}
                      variants={cardItem}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => open(link.href)}
                      className="w-full flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:bg-slate-100 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
                        <DocumentTextOutline className="w-5 h-5" color="#1152D4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-md3-body-md font-semibold text-slate-900 leading-snug">{link.title}</p>
                        {link.subtitle && (
                          <p className="text-md3-label-md text-slate-400 mt-0.5">{link.subtitle}</p>
                        )}
                      </div>
                      <ArrowRightUpOutline className="w-4 h-4 shrink-0" color="#94A3B8" />
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
