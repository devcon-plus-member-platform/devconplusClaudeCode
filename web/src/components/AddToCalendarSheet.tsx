// apps/member/src/components/AddToCalendarSheet.tsx
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarOutline, DownloadOutline, ShareOutline } from 'solar-icon-set'
import type { Event } from '@devcon-plus/supabase'

interface Props {
  event: Event
  isOpen: boolean
  onClose: () => void
}

/** Convert a UTC Date to Asia/Manila (UTC+8) and format as YYYYMMDDTHHmmss */
function toManilaLocal(date: Date): string {
  const manilaOffset = 8 * 60 * 60 * 1000
  const local = new Date(date.getTime() + manilaOffset)
  return local.toISOString().replace(/[-:]/g, '').slice(0, 15)
}

/** Format a Date as YYYYMMDDTHHmmssZ (UTC, for Google CalendarOutline) */
function toUTCCompact(date: Date): string {
  return date.toISOString().replace(/[:\-.]/g, '').slice(0, 15) + 'Z'
}

export default function AddToCalendarSheet({ event, isOpen, onClose }: Props) {
  if (!event.event_date) return null

  const start = new Date(event.event_date)
  const end = event.end_date
    ? new Date(event.end_date)
    : new Date(start.getTime() + 2 * 60 * 60 * 1000)

  const handleGoogleCalendar = () => {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: `${toUTCCompact(start)}/${toUTCCompact(end)}`,
      details: event.description ?? '',
      location: event.location ?? '',
      ctz: 'Asia/Manila',
    })
    window.open(
      `https://calendar.google.com/calendar/render?${params.toString()}`,
      '_blank',
      'noopener,noreferrer'
    )
    onClose()
  }

  const handleIcal = () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DEVCON+//Events//EN',
      'BEGIN:VEVENT',
      `UID:${event.id}@devconplus`,
      `DTSTART;TZID=Asia/Manila:${toManilaLocal(start)}`,
      `DTEND;TZID=Asia/Manila:${toManilaLocal(end)}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${(event.description ?? '').replace(/\n/g, '\\n')}`,
      `LOCATION:${event.location ?? ''}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event.title.toLowerCase().replace(/\s+/g, '-')}.ics`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 100)
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
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl px-4 pt-4 pb-10"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-md3-body-lg font-bold text-slate-900 mb-1">Add to Calendar</h3>
            <p className="text-md3-body-md text-slate-400 mb-5">{event.title}</p>

            <div className="space-y-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleGoogleCalendar}
                className="w-full flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarOutline className="w-5 h-5" color="rgb(var(--color-primary))" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-md3-body-md font-semibold text-slate-900">Google Calendar</p>
                  <p className="text-md3-label-md text-slate-400">Opens in browser</p>
                </div>
                <ShareOutline className="w-4 h-4" color="#CBD5E1" />
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleIcal}
                className="w-full flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <DownloadOutline className="w-5 h-5" color="#64748B" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-md3-body-md font-semibold text-slate-900">iCal / Other Calendars</p>
                  <p className="text-md3-label-md text-slate-400">Downloads .ics — Apple Calendar, Outlook</p>
                </div>
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
