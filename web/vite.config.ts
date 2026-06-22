import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function robotsTxt(allowIndexing: boolean): Plugin {
  const body = allowIndexing
    ? 'User-agent: *\nAllow: /\n'
    : 'User-agent: *\nDisallow: /\n'
  return {
    name: 'devcon-robots-txt',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: body })
    },
  }
}

// Vite silently bakes `undefined` for missing VITE_* vars — the app then
// white-screens at runtime ("supabaseUrl is required") while the build exits 0.
// Fail the build loudly instead. Runtime env vars come from .env files or the
// process env (Vercel injects project env vars into remote builds).
const REQUIRED_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_API_URL',
  'VITE_TURNSTILE_SITE_KEY',
] as const

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, __dirname, 'VITE_')
    const missing = REQUIRED_ENV.filter((key) => !env[key])
    if (missing.length > 0) {
      throw new Error(
        `Refusing to build without required env vars: ${missing.join(', ')}. ` +
          'A bundle built without them white-screens at runtime. ' +
          'Locally: check web/.env. CI/Vercel: the project env vars are sensitive ' +
          'and only available to remote builds (vercel deploy --prod) — never build in CI.',
      )
    }
  }

  // Read all env (loadEnv only exposes VITE_-prefixed by default — pass '' too so
  // this still works if the var is ever set without the prefix in a project).
  const env = loadEnv(mode, __dirname, '')
  const allowIndexing = env.VITE_ALLOW_INDEXING === 'true'

  return {
    plugins: [react(), robotsTxt(allowIndexing)],
  server: {
    port: 5173,
    // Firebase signInWithPopup requires the popup to postMessage the auth result
    // back to the parent window. Without this header the browser may apply
    // same-origin COOP (from the Firebase auth page) which severs window.opener
    // and causes signInWithPopup to hang forever.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@devcon-plus/supabase': path.resolve(__dirname, 'src/types'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router') ||
            id.includes('/node_modules/scheduler/')
          ) return 'vendor-react'

          if (
            id.includes('/node_modules/framer-motion/') ||
            id.includes('/node_modules/@motionone/')
          ) return 'vendor-motion'

          if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase'
        },
      },
    },
  },
  }
})
