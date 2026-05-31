import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  appId:      import.meta.env.VITE_FIREBASE_APP_ID as string,
}

// Reuse existing app on HMR / React StrictMode — initializeApp throws if called
// twice with the same name.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

export const firebaseAuth = getAuth(app)
export default app
