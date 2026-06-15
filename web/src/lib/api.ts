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

async function readResponseBody<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.status === 205) {
    return undefined as T
  }

  const text = await res.text()
  if (!text) return undefined as T

  return JSON.parse(text) as T
}

async function readErrorMessage(res: Response): Promise<string | null> {
  if (res.status === 204 || res.status === 205) return null

  const text = await res.text()
  if (!text) return null

  try {
    const body = JSON.parse(text) as { message?: string }
    return body.message ?? text
  } catch {
    return text
  }
}

async function getFirebaseToken(forceRefresh = false): Promise<string | null> {
  const user = firebaseAuth.currentUser
  if (!user) return null
  return getIdToken(user, forceRefresh)
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getFirebaseToken()

  const buildHeaders = (t: string | null): Record<string, string> => {
    const headers: Record<string, string> = {};
    // Don't set Content-Type for FormData — the browser sets it with the
    // multipart boundary automatically. Overriding it breaks the upload.
    if (!(init.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    Object.assign(headers, init.headers as Record<string, string> | undefined);
    if (t) headers['Authorization'] = `Bearer ${t}`;
    return headers;
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: buildHeaders(token) })

  if (res.status === 401) {
    // Token may have just expired — force a fresh one and retry once.
    const fresh = await getFirebaseToken(true)
    const retry = await fetch(`${BASE_URL}${path}`, { ...init, headers: buildHeaders(fresh) })
    if (!retry.ok) {
      const message = await readErrorMessage(retry)
      throw new Error(message ?? `API error ${retry.status}`)
    }
    return readResponseBody<T>(retry)
  }

  if (!res.ok) {
    const message = await readErrorMessage(res)
    throw new Error(message ?? `API error ${res.status}`)
  }

  return readResponseBody<T>(res)
}

export async function publicFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> =
    init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }
  Object.assign(headers, init.headers as Record<string, string> | undefined)
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const message = await readErrorMessage(res)
    throw new Error(message ?? `API error ${res.status}`)
  }
  return readResponseBody<T>(res)
}
