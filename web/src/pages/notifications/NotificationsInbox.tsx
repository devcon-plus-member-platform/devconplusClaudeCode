import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, BellOffOutline, CloseCircleLineDuotone, TrashBinTrashOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotificationsStore } from '../../stores/useNotificationsStore'
import { formatDate } from '../../lib/dates'
import { cardItem, staggerContainer } from '../../lib/animation'

// Flower-of-life pattern matching Rewards/Dashboard/Jobs
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

interface NotificationsInboxProps {
  /** Pass true when rendered inside the organizer layout so the header uses bg-blue instead of bg-primary */
  isOrganizer?: boolean
}

export default function NotificationsInbox({ isOrganizer = false }: NotificationsInboxProps) {
  const navigate = useNavigate()
  const { notifications, markAllRead, dismiss, clearAll } = useNotificationsStore()

  // Mark all as read when inbox is opened
  useEffect(() => {
    markAllRead()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundColor: isOrganizer ? '#1d4ed8' : 'rgb(var(--color-primary))',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Title + Back Button + Clear All */}
          <div className="relative z-10 flex items-center justify-between px-4 pb-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigate(-1)}
                className="bg-white/20 backdrop-blur-md size-[42px] flex items-center justify-center rounded-full border border-white/30 transition-colors active:bg-white/40 shadow-lg shrink-0"
                aria-label="Back"
              >
                <ArrowLeftOutline className="w-[18px] h-[18px]" color="white" />
              </button>
              <h1 className="font-proxima font-semibold text-[24px] text-white leading-none tracking-tight">
                Notifications
              </h1>
            </div>

            {notifications.length > 0 && (
              <button 
                onClick={clearAll}
                className="bg-white/20 backdrop-blur-md size-[42px] flex items-center justify-center rounded-full border border-white/30 transition-colors active:bg-white/40 shadow-lg"
                aria-label="Clear all"
              >
                <TrashBinTrashOutline className="w-[18px] h-[18px]" color="white" />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="md:max-w-4xl md:mx-auto px-4 pt-4 pb-28">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 pt-20 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-5">
              <BellOffOutline className="w-9 h-9" color="#CBD5E1" />
            </div>
            <p className="text-md3-body-lg font-bold text-slate-700">No announcements yet</p>
            <p className="text-md3-body-md text-slate-400 mt-2 leading-relaxed">
              Event updates from organizers will appear here.
            </p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex flex-col"
          >
            <AnimatePresence mode="popLayout">
              {notifications.map((n) => (
                <motion.div
                  key={n.id}
                  variants={cardItem}
                  exit={{ x: 40, opacity: 0, transition: { duration: 0.2 } }}
                  className="relative bg-white rounded-2xl border border-[rgba(156,163,175,0.3)] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] p-4 mb-3 overflow-hidden"
                >
                  <motion.button
                    onClick={() => dismiss(n.id)}
                    whileTap={{ scale: 0.95 }}
                    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-slate-300 active:text-slate-500"
                    aria-label="Dismiss notification"
                  >
                    <CloseCircleLineDuotone className="w-3.5 h-3.5" color="#EF4444" />
                  </motion.button>
                  <div className="flex items-center justify-between mb-2 pr-6">
                    <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                      {n.event_title}
                    </span>
                    <span className="text-[10px] text-slate-400 font-proxima">
                      {formatDate.compact(n.created_at)}
                    </span>
                  </div>
                  <p className="text-md3-body-md text-slate-700 leading-relaxed font-proxima">{n.message}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  )
}
