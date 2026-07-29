import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LetterOutline } from 'solar-icon-set'
import { apiFetch } from '../lib/api'
import { toast } from 'sonner'

interface Props {
  eventId: string
  eventTitle: string
  isOpen: boolean
  onClose: () => void
}

interface NotifyBatchResult {
  confirmedSent: number
  fullSent: number
}

export default function SendSlotEmailsSheet({ eventId, eventTitle, isOpen, onClose }: Props) {
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const handleClose = () => {
    if (isSending) return
    setSendError(null)
    onClose()
  }

  const handleSend = async () => {
    setIsSending(true)
    setSendError(null)
    try {
      const result = await apiFetch<NotifyBatchResult>(`/api/registrations/event/${eventId}/notify`, {
        method: 'POST',
      })
      toast.success(
        `Sent ${result.confirmedSent} confirmation${result.confirmedSent === 1 ? '' : 's'}, ${result.fullSent} full notice${result.fullSent === 1 ? '' : 's'}`
      )
      setIsSending(false)
      onClose()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send. Please try again.')
      setIsSending(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <div className="fixed inset-0 z-[70] flex flex-col justify-end md:items-center md:justify-center pointer-events-none">
          <motion.div
            className="pointer-events-auto w-full bg-white rounded-t-3xl px-4 pt-4 pb-10 md:max-h-[85vh] md:max-w-md md:rounded-3xl md:overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <LetterOutline className="w-4 h-4" color="rgb(var(--color-primary))" />
              <h3 className="text-md3-body-lg font-bold text-slate-900">Send Slot Emails</h3>
            </div>
            <p className="text-md3-label-md text-slate-400 mb-4">{eventTitle}</p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 space-y-2">
              <p className="text-md3-body-md text-slate-700">
                This will email all <strong>approved</strong> registrants a <strong>Slot Confirmed</strong> notice,
                and all <strong>pending/rejected</strong> registrants a <strong>Slots Are Full</strong> notice.
              </p>
              <p className="text-md3-label-md text-slate-400">
                Every recipient is BCC'd — no one sees anyone else's email address. Registrants already notified are skipped.
              </p>
            </div>

            {sendError && (
              <p className="text-md3-label-md text-red mb-3">{sendError}</p>
            )}

            <div className="flex gap-3">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleClose}
                disabled={isSending}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 text-md3-body-md font-bold
                           disabled:opacity-50"
              >
                Cancel
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleSend}
                disabled={isSending}
                className="flex-1 py-3 rounded-xl bg-blue text-white text-md3-body-md font-bold
                           disabled:opacity-50"
              >
                {isSending ? 'Sending…' : 'Send'}
              </motion.button>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
