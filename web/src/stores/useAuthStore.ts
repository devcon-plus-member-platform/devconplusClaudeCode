import { create } from 'zustand'
import { EmailAuthProvider, GoogleAuthProvider, getIdToken as getFirebaseIdToken, onAuthStateChanged, onIdTokenChanged, reauthenticateWithCredential, signInWithCustomToken, signInWithPopup, updateEmail as firebaseUpdateEmail, updatePassword as firebaseUpdatePassword } from 'firebase/auth'
import type { Profile } from '@devcon-plus/supabase'
import { supabase, setBridgeToken } from '../lib/supabase'
import { firebaseAuth } from '../lib/firebase'
import { emailSigninViaBridge, exchangeFirebaseToken, refreshViaBridge, setupSupabaseSession } from '../lib/authBridge'
import { apiFetch, publicFetch } from '../lib/api'

// Calls the check-rate-limit edge function.
// Returns { allowed, retryAfterSeconds? }.
// On any network/server error → { allowed: false } (fail closed — deny by default).
// token: pass the user's access_token for user-keyed buckets (org_upgrade).
export async function callRateLimit(
  bucket: string,
  extra?: { email?: string; token?: string }
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    }
    if (extra?.token) headers['Authorization'] = `Bearer ${extra.token}`
    const { token: _unused, ...body } = extra ?? {}
    const res = await fetch(`${supabaseUrl}/functions/v1/check-rate-limit`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({ bucket, ...body }),
    })
    if (!res.ok && res.status !== 429) return { allowed: false, retryAfterSeconds: 30 }
    return await res.json() as { allowed: boolean; retryAfterSeconds?: number }
  } catch {
    return { allowed: false, retryAfterSeconds: 30 }
  }
}

export const ORGANIZER_ROLES = ['chapter_officer', 'hq_admin', 'super_admin'] as const
export type OrganizerRole = typeof ORGANIZER_ROLES[number]

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

type UpgradeResult = 'submitted' | 'invalid_code' | 'wrong_chapter' | 'already_pending'

interface AuthState {
  user: Profile | null
  initials: string
  chapterName: string | null
  isLoading: boolean
  isInitialized: boolean
  isOrganizerSession: boolean
  isOAuthOnly: boolean
  error: string | null

  initialize: () => Promise<void>
  signUp: (
    email: string,
    password: string,
    full_name: string,
    username: string,
    chapter_id: string,
    school_or_company?: string,
    captchaToken?: string,
    socialLinks?: { linkedin_url?: string; github_url?: string; portfolio_url?: string },
  ) => Promise<{ emailConfirmationPending: boolean }>
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>
  signOut: () => Promise<void>
  setOrganizerSession: (val: boolean) => void
  updateProfile: (
    patch: Partial<Pick<Profile, 'full_name' | 'username' | 'school_or_company' | 'avatar_url' | 'chapter_id' | 'linkedin_url' | 'github_url' | 'portfolio_url'>>
  ) => Promise<void>
  completeProfile: (input: { full_name: string; username: string; chapter_id: string }) => Promise<void>
  updateEmail: (newEmail: string, currentPassword: string) => Promise<void>
  updatePassword: (newPassword: string, currentPassword: string) => Promise<void>
  uploadAvatar: (file: File) => Promise<string>
  deleteAccount: () => Promise<void>
  resetPassword: (email: string, captchaToken?: string) => Promise<void>
  requestOrganizerUpgrade: (code: string) => Promise<UpgradeResult>
  checkUsernameAvailable: (username: string) => Promise<'available' | 'taken' | 'unknown'>
  signInWithGoogle: () => Promise<void>
  setPassword: (newPassword: string) => Promise<void>
}

// Module-level chapter name cache — populated once per session on first auth.
// Chapters are static seed data (11 entries) that never change mid-session.
// Subsequent TOKEN_REFRESHED events read from this Map with zero network calls.
const _chapterNameCache = new Map<string, string>()

async function fetchChapterName(chapterId: string | null): Promise<string | null> {
  if (!chapterId) return null
  if (_chapterNameCache.has(chapterId)) return _chapterNameCache.get(chapterId) ?? null
  // Cache miss — fetch all chapters at once to populate the full cache.
  // Cost: 1 extra query on first auth only; every subsequent call is a Map lookup.
  const data = await publicFetch<{ id: string; name: string }[]>('/api/chapters').catch(() => [])
  for (const ch of data) _chapterNameCache.set(ch.id, ch.name)
  return _chapterNameCache.get(chapterId) ?? null
}

// Applies a fetched profile to the store; shared by initialize, signIn, signUp, and onAuthStateChange.
async function applyProfile(profile: Profile, set: (partial: Partial<AuthState>) => void): Promise<void> {
  const chapterName = await fetchChapterName(profile.chapter_id)
  set({
    user: profile,
    initials: getInitials(profile.full_name),
    chapterName,
    isOrganizerSession: ORGANIZER_ROLES.includes(profile.role as OrganizerRole),
  })
}

// Maps raw Supabase Auth error messages to user-friendly strings.
// Raw messages (e.g. "invalid claim: missing sub claim") expose internal details
// that are not meaningful to users and can assist auth system fingerprinting.
function toUserMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.'
  if (/email not confirmed/i.test(message))        return 'Please confirm your email before signing in.'
  if (/user already registered/i.test(message))    return 'An account with this email already exists.'
  if (/password.*too short/i.test(message))        return 'Password is too short.'
  if (/email.*invalid/i.test(message))             return 'Please enter a valid email address.'
  if (/over_email_send_rate_limit/i.test(message)) return 'Too many emails sent. Please wait a moment and try again.'
  return 'Something went wrong. Please try again.'
}

// Holds the auth listener cleanups so initialize() can safely re-register without leaking.
let authUnsubscribe: (() => void) | null = null
let firebaseUnsubscribe: (() => void) | null = null

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initials: '',
  chapterName: null,
  isLoading: false,
  isInitialized: false,
  isOrganizerSession: false,
  isOAuthOnly: false,
  error: null,

  initialize: async () => {
    // Re-entry guard — prevents double-init from React StrictMode or accidental duplicate calls
    if (get().isLoading || get().isInitialized) return
    set({ isLoading: true })

    // Firebase is the source of truth for auth state. We use a one-shot
    // onAuthStateChanged listener to restore the session on page load (mirrors
    // what supabase.auth.getSession() did in the legacy Supabase-only path).
    //
    // Why one-shot instead of persistent? We only need to block initialization
    // once. Ongoing auth changes (token refresh, sign-out) are handled by the
    // persistent onIdTokenChanged listener registered below.
    await new Promise<void>((resolve) => {
      const unsubOnce = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        unsubOnce() // immediately de-register — persistent listener takes over
        if (firebaseUser) {
          try {
            const idToken = await getFirebaseIdToken(firebaseUser)
            const session = await exchangeFirebaseToken(idToken)
            // Apply profile before setSession to avoid the re-entrant auth
            // lock deadlock (supabase-js awaits onAuthStateChange callbacks
            // synchronously while holding the storage lock).
            await applyProfile(session.profile, set)
            setupSupabaseSession(session)
            set({ isOAuthOnly: true })
            // If the user already has a valid session and landed on an auth
            // page (sign-in / sign-up / splash), redirect them home so they
            // don't stare at a sign-in form they don't need to fill out.
            const authOnlyPages = ['/sign-in', '/sign-up', '/onboarding', '/']
            if (authOnlyPages.includes(window.location.pathname)) {
              const stored = sessionStorage.getItem('devcon_returnTo')
              sessionStorage.removeItem('devcon_returnTo')
              // Validate returnTo is a safe same-origin relative path before
              // redirecting — prevents open redirect if sessionStorage is
              // poisoned by XSS or a malicious extension.
              const safeTarget =
                typeof stored === 'string' &&
                stored.startsWith('/') &&
                !stored.startsWith('//') &&
                !stored.startsWith('/\\')
                  ? stored
                  : '/home'
              window.location.replace(safeTarget)
              return
            }
          } catch {
            // Exchange failed (e.g. NestJS not reachable on cold start) —
            // user lands on sign-in page; they can try again.
          }
        }
        resolve()
      })
    })

    // Persistent Firebase listener — handles token refresh (~1 h) and sign-out.
    // sign-in is NOT handled here; signInWithGoogle() does it explicitly.
    if (firebaseUnsubscribe) firebaseUnsubscribe()
    firebaseUnsubscribe = onIdTokenChanged(firebaseAuth, async (firebaseUser) => {
      if (!firebaseUser) {
        // Firebase signed out — clear store, bridge token, and Supabase session
        setBridgeToken(null)
        set({ user: null, initials: '', chapterName: null, isOrganizerSession: false, isOAuthOnly: false })
        await supabase.auth.signOut()
        return
      }
      // Skip if the user is not yet in the store (sign-in flow —
      // signInWithGoogle handles the first exchange explicitly).
      if (!get().user) return
      // Token refresh: get a new bridge JWT without re-fetching the profile.
      try {
        const session = await refreshViaBridge(firebaseUser, false)
        setupSupabaseSession(session)
      } catch {
        // Non-fatal — TOKEN_REFRESH_FAILED handler will attempt force-refresh
      }
    })

    // Supabase auth listener is now MINIMAL — Firebase owns SIGNED_IN and
    // TOKEN_REFRESHED. We only keep it for the bridge JWT expiry edge case:
    // supabase-js tries to use the opaque refresh_token on its /token endpoint,
    // fails, and emits TOKEN_REFRESH_FAILED. We intercept it and re-issue via
    // the bridge instead of signing the user out.
    if (authUnsubscribe) authUnsubscribe()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if ((event as string) !== 'TOKEN_REFRESH_FAILED') return
      if (firebaseAuth.currentUser) {
        try {
          const bridgeSession = await refreshViaBridge(firebaseAuth.currentUser, true)
          setupSupabaseSession(bridgeSession)
          return // recovered
        } catch {
          // Bridge refresh also failed — fall through to forced sign-out
        }
      }
      await supabase.auth.signOut()
      set({ user: null, initials: '', chapterName: null, isOrganizerSession: false })
      window.location.replace('/sign-in')
    })
    authUnsubscribe = () => subscription.unsubscribe()

    set({ isLoading: false, isInitialized: true })
  },

  signUp: async (email, password, full_name, username, chapter_id, school_or_company, captchaToken) => {
    set({ isLoading: true, error: null })
    try {
      await apiFetch('/auth/email/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, full_name, username, chapter_id, school_or_company, captchaToken }),
      })
      set({ isLoading: false })
      return { emailConfirmationPending: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-up failed. Please try again.'
      set({ isLoading: false, error: msg })
      throw err
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const session = await emailSigninViaBridge(email, password)
      // Establish firebaseAuth.currentUser so apiFetch can obtain ID tokens.
      // onIdTokenChanged fires but skips the redundant exchange because
      // get().user is null at this point (applyProfile hasn't run yet).
      if (session.firebase_custom_token) {
        await signInWithCustomToken(firebaseAuth, session.firebase_custom_token)
      }
      await applyProfile(session.profile, set)
      setupSupabaseSession(session)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      set({ isLoading: false })
      if (/email (not verified|must be verified)/i.test(msg)) {
        // User has not clicked their verification link yet.
        // Throw a typed error so SignIn.tsx can redirect to /email-sent.
        throw Object.assign(new Error(msg), { code: 'email_not_verified' })
      }
      set({ error: toUserMessage(msg) })
      throw err
    }
    set({ isLoading: false })
  },

  signOut: async () => {
    // Sign out of Firebase first — triggers onIdTokenChanged(null) which clears the store.
    // Then clear the Supabase bridge session.
    await firebaseAuth.signOut()
    await supabase.auth.signOut()
  },

  setOrganizerSession: (val) => {
    set({ isOrganizerSession: val })
  },

  updateProfile: async (patch) => {
    const current = get().user
    if (!current) return

    // avatar_url: managed by POST /api/users/me/avatar (server persists it).
    // chapter_id: managed by the organizer-upgrade request workflow.
    // Both are removed from the server DTO to prevent mass-assignment bypass.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { avatar_url: _av, chapter_id: _ch, ...serverPatch } = patch
    const updated = await apiFetch<Profile>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(serverPatch),
    })
    const chapterName = get().chapterName
    set({
      user: updated,
      initials: updated.full_name ? getInitials(updated.full_name) : get().initials,
      chapterName,
    })
  },

  completeProfile: async (input) => {
    const current = get().user
    if (!current) throw new Error('Not authenticated')
    // One-time OAuth profile completion via the NestJS backend (Firebase token).
    // The dedicated /complete endpoint is the only place allowed to set chapter_id.
    const updated = await apiFetch<Profile>('/api/users/me/complete', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    const chapterName = await fetchChapterName(updated.chapter_id)
    set({
      user: updated,
      initials: getInitials(updated.full_name),
      chapterName,
      isOrganizerSession: ORGANIZER_ROLES.includes(updated.role as OrganizerRole),
    })
  },

  updateEmail: async (newEmail, currentPassword) => {
    const current = get().user
    if (!current) throw new Error('Not authenticated')

    const firebaseUser = firebaseAuth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated')
    // Re-authenticate with Firebase — required before sensitive operations
    const credential = EmailAuthProvider.credential(current.email, currentPassword)
    await reauthenticateWithCredential(firebaseUser, credential).catch(() => {
      throw new Error('Incorrect password')
    })
    await firebaseUpdateEmail(firebaseUser, newEmail)
    // Sync new email to profiles table so the stored record stays consistent
    await apiFetch('/api/users/me', { method: 'PATCH', body: JSON.stringify({ email: newEmail }) })
    set((s) => ({ user: s.user ? { ...s.user, email: newEmail } : null }))
  },

  uploadAvatar: async (file) => {
    const current = get().user
    if (!current) throw new Error('Not authenticated')
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) throw new Error('Only image files are allowed')
    if (file.size > 10 * 1024 * 1024) throw new Error('Image must be under 10 MB')

    const formData = new FormData()
    formData.append('avatar', file)
    const { avatar_url } = await apiFetch<{ avatar_url: string }>('/api/users/me/avatar', {
      method: 'POST',
      body: formData,
    })
    // Server persists avatar_url to the DB; update local state so callers
    // don't need a separate updateProfile({ avatar_url }) round-trip.
    set({ user: { ...current, avatar_url } })
    return avatar_url
  },

  deleteAccount: async () => {
    await apiFetch('/api/users/me', { method: 'DELETE' })
    await supabase.auth.signOut()
  },

  resetPassword: async (email, captchaToken) => {
    set({ isLoading: true, error: null })
    // Rate limit: 3 reset emails per email address per hour.
    // Keyed by email (not IP) — prevents inbox flooding a single user from many IPs.
    const resetLimit = await callRateLimit('password_reset', { email })
    if (!resetLimit.allowed) {
      const secs = resetLimit.retryAfterSeconds ?? 3600
      const mins = Math.ceil(secs / 60)
      const err = new Error(
        `Too many password reset requests. Please wait ${mins} minute${mins !== 1 ? 's' : ''} before trying again.`
      )
      set({ isLoading: false, error: err.message })
      throw err
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken,
    })
    if (error) {
      console.error('[resetPassword] auth error:', error.message)
      set({ isLoading: false, error: toUserMessage(error.message) })
      throw error
    }
    set({ isLoading: false })
  },

  updatePassword: async (newPassword, currentPassword) => {
    const current = get().user
    if (!current) throw new Error('Not authenticated')

    const firebaseUser = firebaseAuth.currentUser
    if (!firebaseUser) throw new Error('Not authenticated')
    // Re-authenticate with Firebase — required before sensitive operations
    const credential = EmailAuthProvider.credential(current.email, currentPassword)
    await reauthenticateWithCredential(firebaseUser, credential).catch(() => {
      throw new Error('Incorrect password')
    })
    await firebaseUpdatePassword(firebaseUser, newPassword)
  },

  setPassword: async (newPassword) => {
    const { error, data } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    // updateUser returns the updated user with refreshed identities.
    const updatedIdentities = data.user?.identities ?? []
    set({ isOAuthOnly: !updatedIdentities.some(id => id.provider === 'email') })
  },

  requestOrganizerUpgrade: async (code) => {
    const current = get().user
    if (!current) throw new Error('Not authenticated')

    try {
      await apiFetch('/api/upgrades/request', {
        method: 'POST',
        body: JSON.stringify({ code: code.toUpperCase() }),
      })
      set({ user: { ...current, pending_role: 'chapter_officer', pending_chapter_id: current.chapter_id } })
      return 'submitted'
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'already_pending') return 'already_pending'
      if (msg === 'invalid_code') return 'invalid_code'
      if (msg === 'wrong_chapter') return 'wrong_chapter'
      throw err
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null })
    // signInWithPopup MUST be called synchronously from the user gesture.
    // Any await before this call breaks the browser's popup gesture chain
    // and results in auth/popup-blocked. Rate limiting for OAuth happens
    // after the popup resolves — Google's own auth is the primary fraud gate.
    const provider = new GoogleAuthProvider()
    let credential
    try {
      credential = await signInWithPopup(firebaseAuth, provider)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        set({ isLoading: false })
        return
      }
      set({ error: 'Google sign-in failed. Please try again.', isLoading: false })
      return
    }

    try {
      const idToken = await getFirebaseIdToken(credential.user)
      const session = await exchangeFirebaseToken(idToken)
      await applyProfile(session.profile, set)
      setupSupabaseSession(session)
      set({ isOAuthOnly: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed'
      if (/email (not verified|must be verified)/i.test(msg)) {
        set({ error: 'Please verify your email first. Check your inbox.' })
        return
      }
      set({ error: msg })
      throw err
    } finally {
      set({ isLoading: false })
    }
  },

  checkUsernameAvailable: async (username) => {
    // Returns 'unknown' on rate-limit (30/IP/60s) or network error so callers can
    // treat it as non-blocking — failing closed here would show a valid username as
    // "taken" and block sign-up. DB UNIQUE constraint + server RPC are the real backstop.
    const limit = await callRateLimit('username_check')
    if (!limit.allowed) return 'unknown'

    try {
      const result = await publicFetch<{ available: boolean }>(
        `/api/users/check-username?username=${encodeURIComponent(username.toLowerCase())}`
      )
      return result.available ? 'available' : 'taken'
    } catch {
      return 'unknown'
    }
  },
}))
