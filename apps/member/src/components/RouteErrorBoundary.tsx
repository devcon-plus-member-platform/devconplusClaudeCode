import { useRouteError, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// Prevents an infinite reload loop: only try reloading once per session.
const CHUNK_RELOAD_KEY = 'devcon_chunk_reload_v1'

function isChunkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false
  const msg = error.message
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

function ChunkErrorScreen() {
  const navigate = useNavigate()
  const alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'

  const handleReload = () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    window.location.reload()
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden"
      style={{ backgroundColor: 'rgb(var(--color-primary))' }}
    >
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ backgroundImage: PATTERN_BG, backgroundSize: '60px 60px', backgroundRepeat: 'repeat', opacity: 0.4 }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="mb-6"
        >
          <div className="w-20 h-20 rounded-3xl bg-white/15 border border-white/20 flex items-center justify-center backdrop-blur-md">
            {/* Refresh / update icon */}
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path
                d="M17.65 6.35A7.958 7.958 0 0012 4C7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                fill="rgba(255,255,255,0.9)"
              />
            </svg>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-8"
        >
          <h1 className="text-md3-headline-sm font-bold text-white mb-3 leading-snug">
            {alreadyTried ? 'Still having trouble?' : 'App updated!'}
          </h1>
          <p className="text-white/70 text-md3-body-md leading-relaxed">
            {alreadyTried
              ? 'Check your connection and try again, or head back to the dashboard.'
              : 'A new version of DEVCON+ is available. Reload to get the latest update.'}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="flex flex-col gap-3 w-full"
        >
          <motion.button
            onClick={handleReload}
            className="w-full bg-white text-primary font-bold text-md3-label-lg py-4 rounded-full shadow-xl"
            whileTap={{ scale: 0.96, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
          >
            Reload App
          </motion.button>
          <motion.button
            onClick={() => navigate('/home')}
            className="w-full bg-white/12 border border-white/20 text-white font-semibold text-md3-label-lg py-4 rounded-full backdrop-blur-md"
            whileTap={{ scale: 0.96, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
          >
            Back to Dashboard
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}

function GenericErrorScreen() {
  const navigate = useNavigate()

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden"
      style={{ backgroundColor: 'rgb(var(--color-primary))' }}
    >
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ backgroundImage: PATTERN_BG, backgroundSize: '60px 60px', backgroundRepeat: 'repeat', opacity: 0.4 }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="mb-6"
        >
          <div className="w-20 h-20 rounded-3xl bg-white/15 border border-white/20 flex items-center justify-center backdrop-blur-md">
            {/* Warning triangle icon */}
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path
                d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
                fill="rgba(255,255,255,0.9)"
              />
            </svg>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mb-8"
        >
          <h1 className="text-md3-headline-sm font-bold text-white mb-3 leading-snug">
            Something went wrong
          </h1>
          <p className="text-white/70 text-md3-body-md leading-relaxed">
            An unexpected error occurred. Head back and try again.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
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

export function RouteErrorBoundary() {
  const error = useRouteError()
  return isChunkError(error) ? <ChunkErrorScreen /> : <GenericErrorScreen />
}
