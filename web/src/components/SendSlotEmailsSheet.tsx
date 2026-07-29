import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LetterOutline, CheckCircleOutline, RefreshOutline } from 'solar-icon-set'
import { apiFetch } from '../lib/api'
import { toast } from 'sonner'

interface Props {
  eventId: string
  eventTitle: string
  isOpen: boolean
  onClose: () => void
  /** Called after a successful send so the parent can refresh notified_at state. */
  onSent: () => void
  /** Approved + pending/rejected registrants eligible for a slot email (non-cancelled). */
  totalNotifiable: number
  /** Subset of totalNotifiable that already has notified_at set. */
  alreadyNotified: number
}

interface NotifyBatchResult {
  confirmedSent: number
  fullSent: number
  alreadyNotified: number
}

export default function SendSlotEmailsSheet({
  eventId,
  eventTitle,
  isOpen,
  onClose,
  onSent,
  totalNotifiable,
  alreadyNotified,
}: Props) {
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [resendAll, setResendAll] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSendError(null)
      setResendAll(false)
    }
  }, [isOpen])

  const newCount = Math.max(totalNotifiable - alreadyNotified, 0)
  const noneToNotify = totalNotifiable === 0
  const allAlreadyNotified = totalNotifiable > 0 && newCount === 0
  const canSend = !noneToNotify && (newCount > 0 || resendAll)
  const force = resendAll || allAlreadyNotified

  const handleClose = () => {
    if (isSending) return
    onClose()
  }

  const handleSend = async () => {
    setIsSending(true)
    setSendError(null)
    try {
      const result = await apiFetch<NotifyBatchResult>(
        `/api/registrations/event/${eventId}/notify${force ? '?force=true' : ''}`,
        { method: 'POST' },
      )
      const total = result.confirmedSent + result.fullSent
      toast.success(
        force
          ? `Resent ${total} email${total === 1 ? '' : 's'} (${result.confirmedSent} confirmation${result.confirmedSent === 1 ? '' : 's'}, ${result.fullSent} full notice${result.fullSent === 1 ? '' : 's'})`
          : `Sent ${result.confirmedSent} confirmation${result.confirmedSent === 1 ? '' : 's'}, ${result.fullSent} full notice${result.fullSent === 1 ? '' : 's'}`
      )
      setIsSending(false)
      onSent()
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
              <LetterOutline width={16} height={16} color="rgb(var(--color-primary))" />
              <h3 className="text-md3-body-lg font-bold text-slate-900">Send Slot Emails</h3>
            </div>
            <p className="text-md3-label-md text-slate-400 mb-4">{eventTitle}</p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 space-y-2">
              <p className="text-md3-body-md text-slate-700">
                This will email all <strong>approved</strong> registrants a <strong>Slot Confirmed</strong> notice,
                and all <strong>pending/rejected</strong> registrants a <strong>Slots Are Full</strong> notice.
              </p>
              <p className="text-md3-label-md text-slate-400">
                Every recipient is BCC'd — no one sees anyone else's email address.
              </p>
            </div>

            {/* Notified-status indicator */}
            {!noneToNotify && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 mb-3">
                <CheckCircleOutline
                  width={16}
                  height={16}
                  color={alreadyNotified > 0 ? '#F8C630' : '#94A3B8'}
                />
                <p className="text-md3-label-md text-slate-600">
                  <span className="font-semibold text-slate-900">{alreadyNotified}</span> of{' '}
                  <span className="font-semibold text-slate-900">{totalNotifiable}</span> registrant
                  {totalNotifiable === 1 ? '' : 's'} already emailed
                  {newCount > 0 && (
                    <> — <span className="font-semibold text-green">{newCount} new</span> will be sent</>
                  )}
                </p>
              </div>
            )}

            {noneToNotify && (
              <p className="text-md3-label-md text-slate-400 mb-3">
                No approved / pending / rejected registrants yet for this event.
              </p>
            )}

            {/* Resend option — only relevant once at least one registrant has been notified */}
            {alreadyNotified > 0 && !noneToNotify && (
              <label
                className={`flex items-start gap-2.5 rounded-xl border p-3 mb-3 cursor-pointer transition-colors ${
                  resendAll ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={resendAll}
                  onChange={(e) => setResendAll(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-blue rounded shrink-0"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-md3-body-md font-semibold text-slate-900">
                    <RefreshOutline width={14} height={14} color="rgb(var(--color-primary))" />
                    Resend to already-emailed registrants too
                  </span>
                  <span className="block text-md3-label-md text-slate-400 mt-0.5">
                    {allAlreadyNotified
                      ? 'Everyone has already been emailed for this event — check this to resend anyway.'
                      : `Also re-sends to the ${alreadyNotified} registrant${alreadyNotified === 1 ? '' : 's'} already notified, not just new ones.`}
                  </span>
                </span>
              </label>
            )}

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
                disabled={isSending || !canSend}
                className="flex-1 py-3 rounded-xl bg-blue text-white text-md3-body-md font-bold
                           disabled:opacity-50"
              >
                {isSending
                  ? 'Sending…'
                  : force
                    ? `Resend to All (${totalNotifiable})`
                    : `Send${newCount > 0 ? ` (${newCount})` : ''}`}
              </motion.button>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
