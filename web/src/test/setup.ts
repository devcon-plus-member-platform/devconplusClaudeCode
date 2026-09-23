import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Store-importing suites (AdminLayout, AdminDashboard) pull the Supabase and
// Firebase clients in at module load, and client construction requires env.
// Dummy values keep construction from throwing; no network is ever touched.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-api-key')
vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com')
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project')
vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app-id')
vi.stubEnv('VITE_API_URL', 'http://localhost:8000')

// The Supabase realtime client constructs a Web Worker at import time, which
// jsdom does not provide. Nothing under test ever connects, so a no-op
// constructor is enough to let client construction succeed.
class DummyWorker {
  postMessage(): void {}
  terminate(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}
vi.stubGlobal('Worker', DummyWorker)

// ScrollToTop calls scrollTo on scroll containers; jsdom elements lack it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}
