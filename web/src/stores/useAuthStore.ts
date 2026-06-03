import { create } from 'zustand'
import { GoogleAuthProvider, getIdToken as getFirebaseIdToken, onAuthStateChanged, onIdTokenChanged, signInWithPopup } from 'firebase/auth'
import type { Profile } from '@devcon-plus/supabase'
import { supabase, getBridgeToken, setBridgeToken } from '../lib/supabase'
import { firebaseAuth } from '../lib/firebase'
import { emailSigninViaBridge, exchangeFirebaseToken, refreshViaBridge, setupSupabaseSession } from '../lib/authBridge'
import { apiFetch } from '../lib/api'

// Feature flag — flip VITE_AUTH_PROVIDER=firebase to enable the Firebase popup
// path and bridge session flow. Flip back to 'supabase' for instant rollback.
const USE_FIREBASE = import.meta.env.VITE_AUTH_PROVIDER === 'firebase'

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
  updateEmail: (newEmail: string, currentPassword: string) => Promise<void>
  updatePassword: (newPassword: string, currentPassword: string) => Promise<void>
  uploadAvatar: (file: File) => Promise<string>
  deleteAccount: () => Promise<void>
  resetPassword: (email: string, captchaToken?: string) => Promise<void>
  requestOrganizerUpgrade: (code: string) => Promise<UpgradeResult>
  checkUsernameAvailable: (username: string) => Promise<boolean>
  signInWithGoogle: () => Promise<void>
  setPassword: (newPassword: string) => Promise<void>
}

async function fetchProfileById(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error && error.code !== 'PGRST116') {
    console.error('[fetchProfileById] error:', error.code, error.message)
  }
  return (data ?? null) as unknown as Profile | null
}

async function ensureProfile(userId: string, meta: Record<string, string | null>): Promise<Profile | null> {
  // Fetch first — avoids NOT NULL violations on chapter_id for returning users
  // who signed up before chapter_id became required.
  const existing = await fetchProfileById(userId)

  if (existing) {
    // Patch any null fields the trigger left empty (username, chapter_id, school_or_company).
    const patch: Partial<Pick<Profile, 'username' | 'chapter_id' | 'school_or_company'>> = {}
    if (!existing.username && meta.username)                    patch.username          = meta.username
    if (!existing.chapter_id && meta.chapter_id)               patch.chapter_id        = meta.chapter_id
    if (!existing.school_or_company && meta.school_or_company) patch.school_or_company = meta.school_or_company

    if (Object.keys(patch).length === 0) return existing

    const { error: patchErr } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
    if (patchErr) {
      console.error('[ensureProfile] patch error:', patchErr.code, patchErr.message)
      return existing  // return unpatched DB row — don't diverge in-memory state from DB
    }

    return { ...existing, ...patch }
  }

  // No profile yet — INSERT (new sign-up before trigger fires, or trigger was skipped).
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      full_name: meta.full_name ?? meta.email?.split('@')[0] ?? 'User',
      username: meta.username ?? null,
      email: meta.email ?? '',
      school_or_company: meta.school_or_company ?? null,
      chapter_id: meta.chapter_id ?? '',
      role: 'member',
      spendable_points: 0,
      lifetime_points: 0,
      linkedin_url:  meta.linkedin_url  ?? null,
      github_url:    meta.github_url    ?? null,
      portfolio_url: meta.portfolio_url ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[ensureProfile] insert error:', error.code, error.message)
    return null
  }

  return (data ?? null) as unknown as Profile | null
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
  const { data } = await supabase.from('chapters').select('id, name')
  if (data) {
    for (const ch of data) _chapterNameCache.set(ch.id, ch.name)
  }
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
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

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

    if (USE_FIREBASE) {
      // ── Firebase-driven initialization ────────────────────────────────
      //
      // Firebase is the source of truth for auth state. We use a one-shot
      // onAuthStateChanged listener to restore the session on page load (mirrors
      // what supabase.auth.getSession() did in the Supabase-only path).
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
      return
    }

    // ── Legacy Supabase-only path (VITE_AUTH_PROVIDER=supabase) ──────────
    //
    // IMPORTANT: call getSession() BEFORE registering onAuthStateChange.
    // Supabase JS v2 awaits all subscriber callbacks inside notifyAllSubscribers().
    // If onAuthStateChange is registered first and the saved token is expired, Supabase
    // fires TOKEN_REFRESHED → our handler calls ensureProfile() → PostgREST calls getSession()
    // internally → getSession() waits for initializePromise → initializePromise waits for
    // our callback to finish → circular wait (deadlock).
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        await supabase.auth.signOut()
        set({ isLoading: false, isInitialized: true })
        return
      }
      if (session?.user) {
        const identities = session.user.identities ?? []
        const isOAuthOnly = !identities.some(id => id.provider === 'email')
        set({ isOAuthOnly })
        const meta = { ...session.user.user_metadata, email: session.user.email ?? null } as Record<string, string | null>
        const profile = await ensureProfile(session.user.id, meta)
        if (profile) await applyProfile(profile, set)
      }
    } catch {
      await supabase.auth.signOut()
      set({ isLoading: false, isInitialized: true })
      return
    }

    if (authUnsubscribe) authUnsubscribe()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event as string) === 'TOKEN_REFRESH_FAILED') {
        await supabase.auth.signOut()
        set({ user: null, initials: '', chapterName: null, isOrganizerSession: false })
        window.location.replace('/sign-in')
        return
      }
      if (event === 'SIGNED_OUT' || !session) {
        set({ user: null, initials: '', chapterName: null, isOrganizerSession: false, isOAuthOnly: false })
        return
      }
      if (event === 'USER_UPDATED' && session) {
        const identities = session.user.identities ?? []
        set({ isOAuthOnly: !identities.some(id => id.provider === 'email') })
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const meta = { ...session.user.user_metadata, email: session.user.email ?? null } as Record<string, string | null>
        const profile = await ensureProfile(session.user.id, meta)
        if (profile) await applyProfile(profile, set)
      }
    })
    authUnsubscribe = () => subscription.unsubscribe()

    set({ isLoading: false, isInitialized: true })
  },

  signUp: async (email, password, full_name, username, chapter_id, school_or_company, captchaToken, socialLinks) => {
    set({ isLoading: true, error: null })

    // Firebase email/password signup — NestJS creates the Firebase user and
    // sends the verification email via Gmail SMTP. No Supabase Auth involved.
    if (USE_FIREBASE) {
      try {
        await apiFetch('/auth/email/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, full_name, username, chapter_id, school_or_company }),
        })
        set({ isLoading: false })
        return { emailConfirmationPending: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sign-up failed. Please try again.'
        set({ isLoading: false, error: msg })
        throw err
      }
    }

    // Legacy Supabase Auth signup path (VITE_AUTH_PROVIDER=supabase)
    // Advisory rate limit: 3 signups per IP per hour.
    const signupLimit = await callRateLimit('signup')
    if (!signupLimit.allowed) {
      const secs = signupLimit.retryAfterSeconds ?? 3600
      const err = new Error(`Too many accounts created from this network. Please try again in ${Math.ceil(secs / 60)} minutes.`)
      set({ isLoading: false, error: err.message })
      throw err
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/email-confirm`,
        captchaToken,
        data: {
          full_name,
          username,
          school_or_company: school_or_company || null,
          chapter_id: chapter_id || null,
          linkedin_url:  socialLinks?.linkedin_url  || null,
          github_url:    socialLinks?.github_url    || null,
          portfolio_url: socialLinks?.portfolio_url || null,
        },
      },
    })
    if (error) {
      console.error('[signUp] auth error:', error.message)
      set({ isLoading: false, error: toUserMessage(error.message) })
      throw error
    }
    // If session is immediately available (email confirmation disabled),
    // eagerly create + set the profile so callers can read user.role right away
    if (data.session?.user) {
      const meta: Record<string, string | null> = {
        full_name,
        username,
        email,
        school_or_company: school_or_company || null,
        chapter_id: chapter_id || null,
        linkedin_url:  socialLinks?.linkedin_url  || null,
        github_url:    socialLinks?.github_url    || null,
        portfolio_url: socialLinks?.portfolio_url || null,
      }
      const profile = await ensureProfile(data.session.user.id, meta)
      if (profile) await applyProfile(profile, set)
    }
    set({ isLoading: false })
    return { emailConfirmationPending: !data.session }
  },

  signIn: async (email, password, captchaToken) => {
    set({ isLoading: true, error: null })

    // Firebase email/password sign-in — NestJS verifies credentials against
    // Firebase REST API and gates on profiles.is_email_verified (DB column).
    if (USE_FIREBASE) {
      try {
        const session = await emailSigninViaBridge(email, password)
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
      return
    }

    // Legacy Supabase path — dual-key rate limit: per-email + per-IP.
    // Known trade-off: email key is user-supplied and unverified pre-auth — an attacker
    // could exhaust a victim's login bucket. Mitigated by the IP bucket. Accepted for MVP.
    const [emailLimit, ipLimit] = await Promise.all([
      callRateLimit('login', { email }),
      callRateLimit('login_ip'),
    ])

    if (!emailLimit.allowed || !ipLimit.allowed) {
      const secs = Math.max(
        emailLimit.retryAfterSeconds ?? 0,
        ipLimit.retryAfterSeconds ?? 0,
      ) || 300
      const err = new Error(`Too many login attempts. Please wait ${secs} seconds before trying again.`)
      ;(err as Error & { retryAfterSeconds: number }).retryAfterSeconds = secs
      set({ isLoading: false, error: err.message })
      throw err
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
    if (error) {
      console.error('[signIn] auth error:', error.message)
      set({ isLoading: false, error: toUserMessage(error.message) })
      throw error
    }
    // Eagerly fetch/create profile so callers can read user.role immediately after signIn() returns
    if (data.session?.user) {
      const meta = { ...data.session.user.user_metadata, email: data.session.user.email ?? null } as Record<string, string | null>
      const profile = await ensureProfile(data.session.user.id, meta)
      if (profile) await applyProfile(profile, set)
    }
    set({ isLoading: false })
  },

  signOut: async () => {
    if (USE_FIREBASE) {
      // Sign out of Firebase first — triggers onIdTokenChanged(null) which clears the store.
      // Then clear the Supabase bridge session.
      await firebaseAuth.signOut()
      await supabase.auth.signOut()
      return
    }
    await supabase.auth.signOut()
    // onAuthStateChange fires SIGNED_OUT → clears user in store
  },

  setOrganizerSession: (val) => {
    set({ isOrganizerSession: val })
  },

  updateProfile: async (patch) => {
    const current = get().user
    if (!current) return

    if (USE_FIREBASE) {
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
      return
    }

    // Legacy Supabase direct path (VITE_AUTH_PROVIDER=supabase)
    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', current.id)
    if (error) throw error
    const updated = { ...current, ...patch }
    const chapterName = patch.chapter_id !== undefined
      ? await fetchChapterName(patch.chapter_id ?? null)
      : get().chapterName
    set({
      user: updated,
      initials: patch.full_name ? getInitials(patch.full_name) : get().initials,
      chapterName,
    })
  },

  updateEmail: async (newEmail, currentPassword) => {
    const current = get().user
    if (!current) throw new Error('Not authenticated')
    // Re-authenticate first
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: current.email,
      password: currentPassword,
    })
    if (authErr) throw new Error('Incorrect password')
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) throw error
  },

  uploadAvatar: async (file) => {
    const current = get().user
    if (!current) throw new Error('Not authenticated')
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) throw new Error('Only image files are allowed')
    if (file.size > 10 * 1024 * 1024) throw new Error('Image must be under 10 MB')

    if (USE_FIREBASE) {
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
    }

    // Legacy Supabase direct path (VITE_AUTH_PROVIDER=supabase)
    const ext = MIME_TO_EXT[file.type] ?? 'jpg'
    const path = `${current.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  },

  deleteAccount: async () => {
    const { error } = await supabase.rpc('delete_own_account')
    if (error) throw error
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
    // Re-authenticate first
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: current.email,
      password: currentPassword,
    })
    if (authErr) throw new Error('Incorrect password')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
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

    if (USE_FIREBASE) {
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
    }

    // Legacy Supabase path
    // Rate limit: 3 attempts per user per 25h — prevents organizer code brute-forcing.
    // Requires JWT (org_upgrade is a user-keyed bucket in the edge function).
    const upgradeLimit = await callRateLimit('org_upgrade', { token: getBridgeToken() ?? undefined })
    if (!upgradeLimit.allowed) {
      const secs = upgradeLimit.retryAfterSeconds ?? 86400
      const hours = Math.ceil(secs / 3600)
      throw new Error(
        `You've reached the daily limit for organizer code attempts. Try again in ${hours} hour${hours !== 1 ? 's' : ''}.`
      )
    }

    const { data: existing } = await supabase
      .from('organizer_upgrade_requests')
      .select('id, status')
      .eq('user_id', current.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (existing) return 'already_pending'

    const { data: codeRow } = await supabase
      .from('organizer_codes')
      .select('id, chapter_id, assigned_role, is_active')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .maybeSingle()
    if (!codeRow) return 'invalid_code'

    if (codeRow.chapter_id !== null && codeRow.chapter_id !== current.chapter_id) {
      return 'wrong_chapter'
    }

    const { error } = await supabase
      .from('organizer_upgrade_requests')
      .insert({
        user_id: current.id,
        organizer_code: code.toUpperCase(),
        chapter_id: codeRow.chapter_id,
        requested_role: codeRow.assigned_role,
        status: 'pending',
      })
    if (error) throw error

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        pending_role: codeRow.assigned_role,
        pending_chapter_id: codeRow.chapter_id,
      })
      .eq('id', current.id)
    if (updateErr) throw updateErr

    set({ user: { ...current, pending_role: codeRow.assigned_role, pending_chapter_id: codeRow.chapter_id } })
    return 'submitted'
  },

  signInWithGoogle: async () => {
    if (USE_FIREBASE) {
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
      return
    }

    // Legacy Supabase OAuth path: rate limit check is fine here since this
    // path uses a redirect (no popup), so there's no gesture chain to break.
    const rl = await callRateLimit('oauth_initiate')
    if (!rl.allowed) {
      const wait = rl.retryAfterSeconds ?? 60
      set({ error: `Too many sign-in attempts. Try again in ${wait}s.`, isLoading: false })
      return
    }

    // Legacy Supabase OAuth redirect (VITE_AUTH_PROVIDER=supabase)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/oauth-callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) throw error
  },

  checkUsernameAvailable: async (username) => {
    // Rate limit: 30 checks per IP per 60s. Blocked → return false (silent degradation —
    // shows username as "unavailable", no error message shown to the user).
    const limit = await callRateLimit('username_check')
    if (!limit.allowed) return false

    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase())
      .maybeSingle()
    return !data
  },
}))
