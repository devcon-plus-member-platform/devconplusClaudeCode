// Typed fetch client for the NestJS bridge/gateway (VITE_API_URL).
//
// Phase 2: only used for auth endpoints (exchange, refresh, email/* flows).
// Phase 6: expanded per slice as direct supabase-js calls are replaced.
//
// Every request auto-injects a Firebase ID token as Bearer. On 401 the token
// is force-refreshed and the request retried once before throwing.

import { getIdToken } from 'firebase/auth'
import { firebaseAuth } from './firebase'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

async function getFirebaseToken(forceRefresh = false): Promise<string | null> {
  const user = firebaseAuth.currentUser
  if (!user) return null
  return getIdToken(user, forceRefresh)
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getFirebaseToken()

  const buildHeaders = (t: string | null): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  })

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: buildHeaders(token) })

  if (res.status === 401) {
    // Token may have just expired — force a fresh one and retry once.
    const fresh = await getFirebaseToken(true)
    const retry = await fetch(`${BASE_URL}${path}`, { ...init, headers: buildHeaders(fresh) })
    if (!retry.ok) {
      const body = await retry.json().catch(() => ({})) as { message?: string }
      throw new Error(body.message ?? `API error ${retry.status}`)
    }
    return retry.json() as Promise<T>
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message ?? `API error ${res.status}`)
  }

  return res.json() as Promise<T>
}
