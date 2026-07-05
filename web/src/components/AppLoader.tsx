import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import AnimatedDice from './AnimatedDice'

// Full-screen app-opener loading state.
// Shows the DEVCON+ loading illustration on a seamless navy backdrop (matches the
// image's own background so the portrait letterbox has no visible seam), with only
// the rotating AnimatedDice loading cue layered on top (both images are self-branded,
// so no separate logo). The whole loader fades out on transition. Used by both boot
// screens (App.tsx auth-init gate and SplashScreen) so there is no blue→image flash
// between them.
const LOADER_BG = '#000127'

export default function AppLoader() {
  const [showLoadingText, setShowLoadingText] = useState(false)
  const [showSlowText, setShowSlowText] = useState(false)

  useEffect(() => {
    // Reassurance copy only appears on genuinely slow loads (avoids text flash on fast boots).
    const loadingTimer = setTimeout(() => setShowLoadingText(true), 10000)
    const slowTimer = setTimeout(() => setShowSlowText(true), 15000)
    return () => {
      clearTimeout(loadingTimer)
      clearTimeout(slowTimer)
    }
  }, [])

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: LOADER_BG }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {/* Illustration, art-directed per viewport: mobile (portrait 9:16) fills the
          screen edge-to-edge (object-cover); desktop (landscape 16:9) shows the full
          composition on the navy backdrop (object-contain). <picture> ensures only
          the matching image downloads. */}
      <div className="absolute inset-0">
        <picture>
          <source media="(min-width: 768px)" srcSet="/photos/loadingstate.jpg" />
          <img
            src="/photos/portrait_loadingstate.jpg"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="w-full h-full object-cover md:object-contain select-none"
          />
        </picture>
      </div>

      {/* Bottom scrim for legibility over the busy illustration */}
      <div
        className="absolute inset-x-0 bottom-0 h-48 pointer-events-none"
        style={{ background: `linear-gradient(to top, ${LOADER_BG}, transparent)` }}
      />

      {/* Loading cue — dice + delayed reassurance text */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <AnimatedDice />
        </motion.div>

        {showLoadingText && (
          <motion.p
            className="text-white/70 text-[13px] tracking-tight text-center px-6"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {showSlowText
              ? 'Taking longer than usual… check your connection.'
              : 'Hang tight! DEVCON+ will load shortly...'}
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}
