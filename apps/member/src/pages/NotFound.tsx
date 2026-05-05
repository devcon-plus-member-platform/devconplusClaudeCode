import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// Floating ambient particles — points stars, map pins, ticket stubs
const FLOATERS: { id: number; x: string; y: string; size: number; delay: number; duration: number; shape: 'star' | 'pin' | 'qr' | 'dot' }[] = [
  { id: 1,  x: '8%',  y: '12%', size: 18, delay: 0,    duration: 5.2, shape: 'star' },
  { id: 2,  x: '88%', y: '8%',  size: 12, delay: 0.8,  duration: 4.8, shape: 'pin'  },
  { id: 3,  x: '78%', y: '22%', size: 22, delay: 1.4,  duration: 6.1, shape: 'star' },
  { id: 4,  x: '5%',  y: '38%', size: 10, delay: 2.0,  duration: 5.5, shape: 'qr'   },
  { id: 5,  x: '92%', y: '45%', size: 14, delay: 0.3,  duration: 4.6, shape: 'star' },
  { id: 6,  x: '15%', y: '62%', size: 20, delay: 1.7,  duration: 5.8, shape: 'pin'  },
  { id: 7,  x: '82%', y: '68%', size: 16, delay: 0.6,  duration: 6.4, shape: 'dot'  },
  { id: 8,  x: '30%', y: '82%', size: 12, delay: 2.2,  duration: 5.0, shape: 'star' },
  { id: 9,  x: '68%', y: '85%', size: 18, delay: 1.1,  duration: 4.9, shape: 'qr'   },
  { id: 10, x: '50%', y: '5%',  size: 10, delay: 3.0,  duration: 5.6, shape: 'dot'  },
]

function FloaterShape({ shape, size }: { shape: typeof FLOATERS[0]['shape']; size: number }) {
  const s = size
  if (shape === 'star') {
    // 5-pointed star path
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"
          fill="rgba(255,255,255,0.55)"
        />
      </svg>
    )
  }
  if (shape === 'pin') {
    return (
      <svg width={s} height={s * 1.3} viewBox="0 0 24 30" fill="none">
        <path
          d="M12 2C7.6 2 4 5.6 4 10c0 6 8 18 8 18s8-12 8-18c0-4.4-3.6-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z"
          fill="rgba(255,255,255,0.45)"
        />
      </svg>
    )
  }
  if (shape === 'qr') {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1" fill="rgba(255,255,255,0.4)" />
        <rect x="14" y="3" width="7" height="7" rx="1" fill="rgba(255,255,255,0.4)" />
        <rect x="3" y="14" width="7" height="7" rx="1" fill="rgba(255,255,255,0.4)" />
        <rect x="14" y="14" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.4)" />
        <rect x="19" y="14" width="2" height="2" rx="0.5" fill="rgba(255,255,255,0.4)" />
        <rect x="14" y="19" width="7" height="2" rx="0.5" fill="rgba(255,255,255,0.4)" />
      </svg>
    )
  }
  // dot
  return (
    <svg width={s / 2} height={s / 2} viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="5" fill="rgba(255,255,255,0.35)" />
    </svg>
  )
}

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden"
      style={{ backgroundColor: 'rgb(var(--color-primary))' }}
    >
      {/* Tiled circle pattern */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: PATTERN_BG,
          backgroundSize: '60px 60px',
          backgroundRepeat: 'repeat',
          opacity: 0.4,
        }}
      />

      {/* Ambient floating particles */}
      {FLOATERS.map((f) => (
        <motion.div
          key={f.id}
          className="absolute z-0 pointer-events-none"
          style={{ left: f.x, top: f.y }}
          initial={{ opacity: 0, y: 0 }}
          animate={{
            opacity: [0, 0.9, 0.9, 0],
            y: [0, -18, -18, 0],
            rotate: f.shape === 'star' ? [0, 20, -10, 0] : 0,
          }}
          transition={{
            delay: f.delay,
            duration: f.duration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <FloaterShape shape={f.shape} size={f.size} />
        </motion.div>
      ))}

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full gap-0">

        {/* Status pill */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-6"
        >
          <span className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 text-white text-md3-label-md font-semibold px-3 py-1 rounded-full backdrop-blur-sm tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
            Registration Status
          </span>
        </motion.div>

        {/* Broken event card — the creative centrepiece */}
        <motion.div
          initial={{ opacity: 0, y: 24, rotate: -1 }}
          animate={{ opacity: 1, y: 0, rotate: -1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.25 }}
          className="w-full mb-3"
        >
          <div className="bg-white/12 border border-white/20 backdrop-blur-md rounded-2xl p-5 text-left relative overflow-hidden">
            {/* Glitch stripe */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/60 to-transparent" />

            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="h-2.5 w-20 bg-white/20 rounded-full mb-2" />
                <div className="h-2 w-32 bg-white/15 rounded-full" />
              </div>
              <span className="text-[10px] font-bold bg-white/20 text-white/80 px-2 py-0.5 rounded-full uppercase tracking-widest border border-white/20">
                PENDING
              </span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                {/* location pin icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)">
                  <path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 14 8 14s8-8 8-14c0-4.4-3.6-8-8-8zm0 10.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                </svg>
              </div>
              <div>
                <div className="h-2 w-24 bg-white/20 rounded-full mb-1.5" />
                <div className="h-2 w-16 bg-white/15 rounded-full" />
              </div>
            </div>

            {/* Big 404 text centred on the card */}
            <div className="flex items-center justify-center py-4">
              <span
                className="text-[72px] font-black text-white leading-none tracking-tighter select-none"
                style={{ textShadow: '0 2px 24px rgba(0,0,0,0.18)' }}
              >
                404
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
              <div className="h-2 w-12 bg-white/20 rounded-full" />
              <div className="h-2 w-20 bg-white/15 rounded-full" />
              <div className="ml-auto h-2 w-14 bg-white/10 rounded-full" />
            </div>
          </div>
        </motion.div>

        {/* Second card — slightly offset for depth */}
        <motion.div
          initial={{ opacity: 0, y: 20, rotate: 1.5 }}
          animate={{ opacity: 0.45, y: 0, rotate: 1.5 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.35 }}
          className="w-[90%] -mt-5 mb-6"
        >
          <div className="bg-white/8 border border-white/12 backdrop-blur-sm rounded-2xl p-5 h-14" />
        </motion.div>

        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.55 }}
          className="mb-8"
        >
          <h1 className="text-md3-headline-sm font-bold text-white mb-3 leading-snug">
            This page is still pending.
          </h1>
          <p className="text-white/70 text-md3-body-md leading-relaxed">
            The URL you're looking for isn't in our events calendar,
            jobs board, or any of our 11 chapters — from Manila to
            General Santos.
          </p>
        </motion.div>

        {/* XP penalty badge — the cheeky bit */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.75 }}
          className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-4 py-1.5 mb-8"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#F8C630">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
          </svg>
          <span className="text-white/80 text-md3-label-md font-semibold">
            +0 XP for finding this
          </span>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.9 }}
          className="flex flex-col gap-3 w-full"
        >
          <motion.button
            onClick={() => navigate('/home')}
            className="w-full bg-white text-primary font-bold text-md3-label-lg py-4 rounded-full shadow-xl"
            whileTap={{ scale: 0.96, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
          >
            Back to Dashboard
          </motion.button>
          <motion.button
            onClick={() => navigate('/events')}
            className="w-full bg-white/12 border border-white/20 text-white font-semibold text-md3-label-lg py-4 rounded-full backdrop-blur-md"
            whileTap={{ scale: 0.96, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
          >
            Browse Events
          </motion.button>
          <motion.button
            onClick={() => navigate(-1)}
            className="text-white/60 text-md3-label-md font-medium py-2 hover:text-white/90 transition-colors"
            whileTap={{ scale: 0.95 }}
          >
            ← Go back
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}
