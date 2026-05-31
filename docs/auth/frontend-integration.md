# Frontend Auth Integration

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

```typescript
// Enabled when VITE_AUTH_PROVIDER=firebase
const USE_FIREBASE = import.meta.env.VITE_AUTH_PROVIDER === 'firebase'

initialize: async () => {
  if (USE_FIREBASE) {
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
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_APP_ENV=development
VITE_AUTH_PROVIDER=firebase       ← enable Firebase auth path
VITE_API_URL=http://localhost:8000 ← NestJS bridge URL
```

Setting `VITE_AUTH_PROVIDER=supabase` instantly rolls back to the legacy Supabase Auth path — all `if (USE_FIREBASE)` branches are skipped. This is the rollback mechanism.

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
