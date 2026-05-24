import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BellOutline, BoltOutline, MedalStarCircleBoldDuotone } from 'solar-icon-set'
import { useAuthStore } from '../stores/useAuthStore'
import { usePointsStore } from '../stores/usePointsStore'
import { useNotificationsStore } from '../stores/useNotificationsStore'
import logoMark from '../assets/logos/logo-mark.svg'

// Flower-of-life / Clover pattern matching Figma branding
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function VolunteerXpCard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const { spendablePoints, lifetimePoints, currentTier, tierProgress } = usePointsStore()
  
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const el = document.querySelector('[data-scroll-container]')
    if (!el) return
    const handleScroll = () => {
      setIsScrolled(el.scrollTop > 50)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  const firstName = user?.full_name?.split(' ')[0] ?? 'Member'

  return (
    <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
      {/* ── Blue Background Container ── */}
      <motion.div 
        className="bg-primary relative overflow-hidden z-0 pointer-events-auto"
        initial={false}
        animate={{
          paddingBottom: isScrolled ? 16 : 64 
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{ 
          clipPath: 'ellipse(100% 100% at 50% 0%)',
          backgroundImage: PATTERN_BG,
          backgroundSize: '60px 60px',
          backgroundPosition: 'top center',
          backgroundRepeat: 'repeat'
        }}
      >
        {/* Header Row: Logo + Greeting + Notifications */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-6">
          <div className="flex items-center gap-2">
            <div className="h-[26px] w-[44px] relative">
              <img src={logoMark} alt="DEVCON+" className="absolute inset-0 size-full object-contain" />
            </div>
            <h1 className="text-white text-[24px] font-bold font-proxima leading-none tracking-tight">
              Hi, {firstName}!
            </h1>
          </div>

          <button
            onClick={() => navigate('/notifications')}
            className="relative flex items-center justify-center w-[42px] h-[42px] rounded-full bg-white/20 backdrop-blur-md border border-white/20 active:bg-white/30 transition-colors pointer-events-auto shadow-lg"
          >
            <BellOutline className="w-[20px] h-[20px]" color="white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#EF4444] text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none border border-white/20 shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </motion.div>

      {/* ── Collapsing Wrapper: Card ONLY ── */}
      <motion.div 
        className="relative z-10 flex flex-col overflow-hidden px-4"
        initial={false}
        animate={{
          maxHeight: isScrolled ? 0 : 300, // Reduced height since grid is gone
          opacity: isScrolled ? 0 : 1,
          marginTop: isScrolled ? 0 : -40,
          marginBottom: isScrolled ? 0 : 8
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        <div className="bg-white rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] border border-slate-400/30 p-[24px] flex flex-col gap-5 pointer-events-auto">
          <div className="flex">
            <span 
              className="font-proxima font-bold text-white text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full"
              style={{ backgroundColor: currentTier.color }}
            >
              {currentTier.name}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="shrink-0 size-[48px] flex items-center justify-center">
                <MedalStarCircleBoldDuotone color="#F8C630" size={48} />
              </div>
              <p className="font-proxima leading-none text-[#464646] tracking-[-1.226px]">
                <span className="font-extrabold text-[40.867px]">{spendablePoints.toLocaleString()}</span>
                {' '}
                <span className="font-semibold text-[24px]">XP</span>
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="shrink-0 size-[16px] flex items-center justify-center">
                  <BoltOutline color="#94A3B8" size={14} />
                </div>
                <span className="font-proxima text-[14px] text-[#6b7280]">
                  {lifetimePoints.toLocaleString()} lifetime points
                </span>
              </div>

              <div className="relative w-full h-2 bg-black/[0.16] rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: '#eab308' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${tierProgress}%` }}
                  transition={{ 
                    type: 'spring',
                    stiffness: 50,
                    damping: 20,
                    restDelta: 0.001
                  }}
                >
                  {/* Shimmer effect */}
                  <motion.div
                    className="absolute inset-0 w-full h-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                    }}
                    animate={{
                      x: ['-100%', '100%'],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                  />
                </motion.div>
              </div>
            </div>
          </div>

          <motion.button
            onClick={() => navigate('/events')}
            className="font-proxima font-semibold w-full bg-primary text-white text-[16px] h-12 rounded-[80px]"
            whileTap={{ scale: 0.95 }}
          >
            Attend Our Events
          </motion.button>
        </div>
      </motion.div>
    </header>
  )
}
