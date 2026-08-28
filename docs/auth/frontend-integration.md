# Frontend Auth Integration

> ⚠️ **Corrected 2026-08:** this doc originally described the Firebase migration as gated behind a
> `VITE_AUTH_PROVIDER=firebase` env flag with a `VITE_AUTH_PROVIDER=supabase` rollback path. That flag
> never existed in the shipped code — `USE_FIREBASE`/`VITE_AUTH_PROVIDER` do not appear anywhere in
> `useAuthStore.ts`. Firebase Auth is unconditional; Supabase Auth was cut entirely
> (`20260531_phase4_cut_supabase_auth.sql`) and there is no runtime rollback path. The mechanics
> described below (`onAuthStateChanged`/`onIdTokenChanged`/`TOKEN_REFRESH_FAILED` handling, the bridge
> token) are still accurate as of this correction — only the "flag-gated, rollback-able" framing was
> removed.

---

## Key Files

| File | Purpose |
|---|---|
| `web/src/lib/firebase.ts` | Firebase app + auth instance |
| `web/src/lib/authBridge.ts` | NestJS bridge API calls (exchange, refresh, signin) |
| `web/src/lib/supabase.ts` | Supabase client + `setBridgeToken` / `getBridgeToken` |
| `web/src/stores/useAuthStore.ts` | Auth state, Firebase listeners, sign-in/sign-up actions |

---

## `setBridgeToken` / `getBridgeToken` (supabase.ts)

The bridge token is stored in a module-level variable and injected into every Supabase REST/Storage request via the custom `fetchWithTimeout` wrapper.

```typescript
// web/src/lib/supabase.ts

let _bridgeToken: string | null = null

export function setBridgeToken(token: string | null): void {
  _bridgeToken = token
  if (token) supabase.realtime.setAuth(token)  // also updates WebSocket auth
}

export function getBridgeToken(): string | null {
  return _bridgeToken
}

// Injected in fetchWithTimeout before every non-auth fetch:
if (_bridgeToken && !url.includes('/auth/v1/')) {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${_bridgeToken}`)  // overrides anon key
  effectiveInit = { ...init, headers }
}
```

**Why override unconditionally:** `supabase-js` sets `Authorization: Bearer <anon_key>` on every request when no session is stored. The guard `if (!headers.has('Authorization'))` would preserve the anon key and block RLS. We always override.

**Why skip `/auth/v1/`:** Auth endpoint calls (getUser, signOut) validate against `auth.users`. Firebase-only users aren't there. We don't inject the bridge token into these paths.

---

## `useAuthStore` — Firebase Init Path

Unconditional — there is no feature flag gating this; it's the only auth path.

```typescript
initialize: async () => {
  // ONE-SHOT: restore session on page load
  await new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      unsub()  // immediately unregister
      if (firebaseUser) {
        const session = await exchangeFirebaseToken(await getIdToken(firebaseUser))
        await applyProfile(session.profile, set)
        setupSupabaseSession(session)   // → setBridgeToken
      }
      resolve()
    })
  })

  // PERSISTENT: handle token refresh + sign-out
  onIdTokenChanged(firebaseAuth, async (firebaseUser) => {
    if (!firebaseUser) {
      setBridgeToken(null)
      set({ user: null, ... })
      await supabase.auth.signOut()
      return
    }
    if (!get().user) return  // first sign-in handled above
    const session = await refreshViaBridge(firebaseUser)
    setupSupabaseSession(session)
  })

  // MINIMAL Supabase listener: only catches TOKEN_REFRESH_FAILED
  supabase.auth.onAuthStateChange(async (event) => {
    if (event !== 'TOKEN_REFRESH_FAILED') return
    // Bridge JWT expired + supabase tried opaque refresh_token → failed
    // Re-issue via Firebase
    const bridgeSession = await refreshViaBridge(firebaseAuth.currentUser, true)
    setupSupabaseSession(bridgeSession)
  })
}
```

---

## Reading the Auth Token in Components

When a component needs to call an Edge Function directly (e.g., `supabase.functions.invoke`), it should pass the bridge token explicitly:

```typescript
import { getBridgeToken } from '../lib/supabase'

// Inside a component or hook:
const accessToken = getBridgeToken()
if (!accessToken) {
  navigate('/sign-in', { replace: true })
  return
}

const { data, error } = await supabase.functions.invoke('generate-user-qr', {
  headers: { Authorization: `Bearer ${accessToken}` }
})
```

**Do NOT use:** `supabase.auth.getSession().access_token` — this returns null because `setSession()` is never called in the Firebase auth path.

---

## Environment Variables

```env
# web/.env.local
VITE_SUPABASE_URL=https://rrztmvoknmyrpuffutvh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...          ← bridge-JWT/legacy PostgREST paths only
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_APP_ENV=development
VITE_API_URL=http://localhost:8000     ← NestJS gateway URL
```

See `web/.env.example` for the full, current list (also includes `VITE_TURNSTILE_SITE_KEY` and
`VITE_ALLOW_INDEXING`). There is no Supabase Auth fallback to roll back to — see the correction note
at the top of this file.

---

## Rate Limit Integration

The `callRateLimit` function in `useAuthStore` handles user-keyed rate limits (e.g., `org_upgrade`) by passing the bridge token:

```typescript
// useAuthStore.ts
const upgradeLimit = await callRateLimit('org_upgrade', {
  token: getBridgeToken() ?? undefined
})
```

IP-keyed buckets (`login`, `signup`, etc.) don't need a token.

---

## Auth Guard (MemberLayout)

`MemberLayout` checks `isInitialized` and `user` from `useAuthStore`. Routes in `GUEST_PATHS` (`['/events']`) are accessible without auth. All other member routes redirect to `/sign-in` if `user` is null.

```typescript
// web/src/components/MemberLayout.tsx
const { user, isInitialized } = useAuthStore()

if (!isInitialized) return <SplashScreen />
if (!user && !GUEST_PATHS.includes(location.pathname)) {
  return <Navigate to="/sign-in" replace />
}
```

`isInitialized` is set to `true` after the one-shot `onAuthStateChanged` resolves — whether the user is logged in or not.
