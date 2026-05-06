import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'
import { router } from './router'
import { useThemeStore, PROGRAM_THEMES } from './stores/useThemeStore'
import { useAuthStore } from './stores/useAuthStore'
import { useEventsStore } from './stores/useEventsStore'
import { useJobsStore } from './stores/useJobsStore'
import { useNewsStore } from './stores/useNewsStore'
import logoVertical from './assets/logos/logo-vertical.svg'
import AnimatedDice from './components/AnimatedDice'

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <circle cx="0"  cy="0"  r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.25" fill="none"/>
  <circle cx="60" cy="0"  r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.25" fill="none"/>
  <circle cx="0"  cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.25" fill="none"/>
  <circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.25" fill="none"/>
  <circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.25" fill="none"/>
</svg>`

const PATTERN_BASE_STYLE: React.CSSProperties = {
  backgroundColor: '#1152d4',
}

const PATTERN_LAYER_STYLE: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(TILE_SVG)}")`,
  backgroundSize: '60px 60px',
  backgroundRepeat: 'repeat',
}

export default function App() {
  const { themeId } = useThemeStore()
  const { initialize, isInitialized } = useAuthStore()
  const [showLoadingText, setShowLoadingText] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowLoadingText(true), 10000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const allClasses = PROGRAM_THEMES.map((t) => t.cssClass)
    document.documentElement.classList.remove(...allClasses)
    const theme = PROGRAM_THEMES.find((t) => t.id === themeId)
    if (theme) document.documentElement.classList.add(theme.cssClass)
  }, [themeId])

  useEffect(() => {
    // Kick off auth init AND public data fetches concurrently.
    // events/jobs/news have public RLS (SELECT USING true) — no auth required.
    // By the time the auth waterfall finishes and the router renders /home,
    // these stores are already populated, so the dashboard feels instant.
    initialize()
    void useEventsStore.getState().fetchEvents()
    void useJobsStore.getState().fetchJobs()
    void useNewsStore.getState().fetchNews()
  }, [initialize])

  // Block render until session is restored — prevents a flash redirect to /sign-in
  if (!isInitialized) {
    return (
      <div
        className="fixed inset-0 flex flex-col overflow-hidden"
        style={PATTERN_BASE_STYLE}
      >
        {/* Animated Pattern Layer */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            ...PATTERN_LAYER_STYLE,
            maskImage: 'radial-gradient(circle at center, black 40%, transparent 90%)',
            WebkitMaskImage: 'radial-gradient(circle at center, black 40%, transparent 90%)',
          }}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 0.4, scale: 1 }}
          transition={{ duration: 2, ease: "easeOut" }}
        />

        {/* Logo — centered in remaining space */}
        <div className="flex-1 flex items-center justify-center">
          <motion.img 
            src={logoVertical} 
            alt="DEVCON+" 
            className="w-48 h-auto"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          />
        </div>
        {/* Dice at bottom — same placement as SplashScreen */}
        <div className="flex flex-col items-center gap-3 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <AnimatedDice />
          </motion.div>
          <AnimatePresence>
            {showLoadingText && (
              <motion.p 
                className="text-white/70 text-[13px] tracking-tight"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                Hang tight! DEVCON+ will load shortly...
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
      <Toaster
        position="bottom-center"
        richColors
        closeButton
        offset={96}
        toastOptions={{ style: { borderRadius: '9999px' } }}
      />
    </MotionConfig>
  )
}
