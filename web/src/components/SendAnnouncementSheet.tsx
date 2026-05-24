import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { UserSpeakOutline } from 'solar-icon-set'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { useOrganizerUser } from '../stores/useOrgAuthStore'

interface Props {
  eventId: string
  eventTitle: string
  isOpen: boolean
  onClose: () => void
}

export default function SendAnnouncementSheet({ eventId, eventTitle, isOpen, onClose }: Props) {
  const organizerUser = useOrganizerUser()
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const handleClose = () => {
    if (isSending) return
    setMessage('')
    setSendError(null)
    onClose()
  }

  const handleSend = async () => {
    if (!organizerUser || message.trim().length === 0) return
    setIsSending(true)
    setSendError(null)
    const { error } = await supabase
      .from('event_announcements')
      .insert({ event_id: eventId, organizer_id: organizerUser.id, message: message.trim() })
    if (error) {
      setSendError('Failed to send. Please try again.')
      setIsSending(false)
      return
    }
    toast.success('Announcement sent')
    setMessage('')
    setIsSending(false)
    onClose()
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
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl px-4 pt-4 pb-10"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <UserSpeakOutline className="w-4 h-4" color="rgb(var(--color-primary))" />
              <h3 className="text-md3-body-lg font-bold text-slate-900">Send Announcement</h3>
            </div>
            <p className="text-md3-label-md text-slate-400 mb-4">{eventTitle}</p>

            <div className="relative mb-1">
              <textarea
                rows={4}
                maxLength={500}
                value={message}
                onChange={(e) => { setMessage(e.target.value); setSendError(null) }}
                placeholder="Write your announcement…"
                className="w-full border border-slate-200 rounded-xl p-3 text-md3-body-md text-slate-900
                           placeholder-slate-400 resize-none focus:outline-none focus:ring-2
                           focus:ring-blue/30"
              />
              <span className="absolute bottom-3 right-3 text-[10px] text-slate-400">
                {message.length}/500
              </span>
            </div>

            <p className="text-md3-label-md text-slate-400 mb-4">Sends to all approved registrants</p>

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
                disabled={message.trim().length === 0 || isSending}
                className="flex-1 py-3 rounded-xl bg-blue text-white text-md3-body-md font-bold
                           disabled:opacity-50"
              >
                {isSending ? 'Sending…' : 'Send'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
