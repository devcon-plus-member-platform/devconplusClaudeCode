import { getIdToken, type User as FirebaseUser } from 'firebase/auth'
import type { Profile } from '@devcon-plus/supabase'
import { setBridgeToken } from './supabase'

// Shape the NestJS bridge returns from /auth/firebase/exchange and /auth/refresh.
// refresh_token is an opaque UUID — not a real Supabase token. Supabase will
// try to use it on its /token refresh endpoint, fail, and emit TOKEN_REFRESH_FAILED,
// which the useAuthStore listener catches and routes to /auth/refresh instead.
export interface BridgeSession {
  access_token: string
  refresh_token: string
  profile: Profile
  firebase_custom_token?: string
}

const BRIDGE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

async function bridgeFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${BRIDGE_URL}${path}`
  console.log(`[bridge] → POST ${url}`)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  console.log(`[bridge] ← ${res.status} ${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    console.error(`[bridge] error from ${path}:`, err.message)
    throw new Error(err.message ?? `Bridge request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

// Exchange a fresh Firebase ID token for a bridge session (Supabase-compatible JWT
// + opaque refresh token). Called once after Google popup sign-in.
export async function exchangeFirebaseToken(idToken: string): Promise<BridgeSession> {
  return bridgeFetch<BridgeSession>('/auth/firebase/exchange', { id_token: idToken })
}

// Email/password sign-in via the NestJS bridge. NestJS verifies credentials
// against Firebase REST API and gates on profiles.is_email_verified (DB column).
// Throws when the DB column is false — caller catches and redirects to /email-sent.
export async function emailSigninViaBridge(email: string, password: string): Promise<BridgeSession> {
  return bridgeFetch<BridgeSession>('/auth/email/signin', { email, password })
}

// Re-issue the bridge JWT using a fresh Firebase ID token.
// forceRefresh=false: use Firebase's cached token (good when onIdTokenChanged just fired).
// forceRefresh=true:  force Firebase to call its server (good when Supabase already expired).
export async function refreshViaBridge(
  user: FirebaseUser,
  forceRefresh = false,
): Promise<BridgeSession> {
  const idToken = await getIdToken(user, forceRefresh)
  return bridgeFetch<BridgeSession>('/auth/refresh', { id_token: idToken })
}

// Feed the bridge JWT into the Supabase fetch layer so RLS queries keep working.
//
// We do NOT call supabase.auth.setSession() here. setSession() validates the JWT
// sub claim against auth.users via GET /auth/v1/user. Firebase-only users have
// profiles.id UUIDs that are NOT in auth.users → 403 → session never stored →
// all REST calls go out with no auth token → RLS blocks with auth.uid() = null.
//
// setBridgeToken() injects the JWT into fetchWithTimeout (for REST/Storage) and
// calls supabase.realtime.setAuth() (for WebSocket channels). PostgREST verifies
// the HMAC signature independently — no auth.users lookup needed.
export function setupSupabaseSession(session: BridgeSession): void {
  setBridgeToken(session.access_token)
}
