import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'
import { router } from './router'
import { useThemeStore, PROGRAM_THEMES } from './stores/useThemeStore'
import { useAuthStore } from './stores/useAuthStore'
import { useEventsStore } from './stores/useEventsStore'
import { useJobsStore } from './stores/useJobsStore'
import { useNewsStore } from './stores/useNewsStore'
import AppLoader from './components/AppLoader'
// 🚧 MAINTENANCE MODE — these two pair with the gate inside App() below.
// Currently ACTIVE. To bring the app back online, comment out all three.
import MaintenanceShell from './components/MaintenanceShell'
import { MAINTENANCE_CONFIG, SHOW_MAINTENANCE } from './lib/maintenance'

export default function App() {
  // ─── 🚧 MAINTENANCE MODE ──────────────────────────────────────────────────
  // Takes the ENTIRE app offline: every route (member, organizer, admin, public,
  // 404) and short-circuits before auth init and the dashboard prefetches below,
  // so open tabs stop hitting the API during the window.
  //
  //   ON  → uncomment the two imports above AND the line below
  //   OFF → comment all three back out
  //
  // Edit the copy / ETA in web/src/lib/maintenance.ts — not here.
  // Full procedure: docs/runbooks/maintenance-mode.md
  //
  if (SHOW_MAINTENANCE) return <MaintenanceShell {...MAINTENANCE_CONFIG} />
  // ──────────────────────────────────────────────────────────────────────────

  const { themeId } = useThemeStore()
  const { initialize, isInitialized } = useAuthStore()

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

  // Block render until session is restored — prevents a flash redirect to /sign-in.
  // AnimatePresence lets the loader fade out as the router mounts.
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{!isInitialized && <AppLoader key="app-loader" />}</AnimatePresence>
      {isInitialized && (
        <>
          <RouterProvider router={router} />
          <Toaster
            position="bottom-center"
            richColors
            closeButton
            offset={96}
            toastOptions={{ style: { borderRadius: '9999px' } }}
          />
        </>
      )}
    </MotionConfig>
  )
}
