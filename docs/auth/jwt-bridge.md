# JWT Bridge

The NestJS bridge is the core of the auth system. It converts Firebase ID tokens into Supabase-compatible JWTs so the frontend can continue using `supabase-js` for data access without any RLS changes.

---

## Bridge JWT Format

Signed with `SUPABASE_JWT_SECRET` using **HS256**. TTL: **3600 seconds** (matches Firebase ID token lifetime).

```json
// Header
{
  "alg": "HS256",
  "typ": "JWT"
}

// Payload
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",  // profiles.id (UUID)
  "email": "user@example.com",
  "role": "authenticated",
  "aud": "authenticated",
  "iat": 1780200000,
  "exp": 1780203600
}
```

The `sub` claim equals `profiles.id` so `auth.uid()` in RLS returns the correct UUID. `role: 'authenticated'` is required by Supabase PostgREST for authenticated access.

---

## NestJS Endpoints

All endpoints are at `server/src/auth/auth.controller.ts`.

### `POST /auth/firebase/exchange`

Exchanges a fresh Firebase ID token for a bridge session.

```typescript
// Input
{ id_token: string }  // Firebase ID token from getIdToken(firebaseUser)

// Output
{
  access_token: string   // bridge JWT signed with SUPABASE_JWT_SECRET
  refresh_token: string  // opaque UUID (triggers TOKEN_REFRESH_FAILED → client re-exchanges)
  profile: Profile       // full profiles row
}
```

**Server flow:**
1. Verify ID token via Firebase Admin SDK
2. Extract `firebase_uid` from decoded token
3. Look up `profiles` by `auth_uid = firebase_uid`
4. If not found: try `email` lookup (handles JIT migration edge case)
5. Sign bridge JWT with `profiles.id` as `sub`

### `POST /auth/email/signin`

Email/password sign-in with JIT legacy fallback.

```typescript
// Input
{ email: string, password: string }

// Output — same BridgeSession shape as /exchange
```

**Server flow:**
1. Check if Firebase user exists for this email (Admin SDK)
2. **If yes (Firebase user):** verify password via Firebase REST API → exchange → return session
3. **If no (legacy Supabase-only user):** verify via Supabase Auth REST → create Firebase user → link `auth_uid` on profile → return session
4. Gate: `profiles.is_email_verified` must be `true` (prevents unverified accounts from signing in)

### `POST /auth/refresh`

Re-issues the bridge JWT using a fresh Firebase ID token.

```typescript
// Input
{ id_token: string }  // fresh Firebase ID token (forceRefresh=false usually)

// Output — same BridgeSession shape
```

Called by `onIdTokenChanged` in `useAuthStore` whenever Firebase silently refreshes its token (~1h cadence).

### `POST /auth/email/signup`

Creates a new Firebase user and a `profiles` row (pre-verification).

```typescript
// Input
{ email, password, full_name, username, chapter_id, school_or_company? }

// Output
{ message: "Account created. Check your email..." }
```

Does NOT return a session — user must verify email first. Sends a verification link via Gmail SMTP (NestJS `EmailService`).

### `GET /auth/email/verify?token=<jwt>`

Handles the verification link click. Marks `profiles.is_email_verified = true` and awards the 500pt signup bonus.

---

## Refresh Token Strategy

The `refresh_token` in `BridgeSession` is an **opaque UUID**, not a real Supabase refresh token. If `supabase-js` tries to use it on the Supabase `/token` endpoint (e.g., when the bridge JWT expires), Supabase returns an error and fires the `TOKEN_REFRESH_FAILED` event.

`useAuthStore` listens for this event and re-exchanges via `/auth/refresh` instead of signing the user out. This makes the bridge transparent to the rest of the frontend — it looks like a normal session refresh.

```typescript
// useAuthStore.ts — TOKEN_REFRESH_FAILED handler
supabase.auth.onAuthStateChange(async (event) => {
  if (event !== 'TOKEN_REFRESH_FAILED') return
  if (firebaseAuth.currentUser) {
    const bridgeSession = await refreshViaBridge(firebaseAuth.currentUser, true)
    setupSupabaseSession(bridgeSession)  // calls setBridgeToken()
    return
  }
  // Firebase also gone — sign out
  await supabase.auth.signOut()
  window.location.replace('/sign-in')
})
```

---

## Why We Don't Call `supabase.auth.setSession()`

`setSession()` internally calls `GET /auth/v1/user` to validate the JWT's `sub` claim against `auth.users`. Firebase-only users' `profiles.id` UUIDs are **not** in `auth.users` (their profiles are created by `create_profile_with_bonus()` RPC, not by Supabase Auth). This returns 403 and the session is never stored.

**The fix (Phase 4):** `setupSupabaseSession()` calls `setBridgeToken(token)` instead. This injects the token directly into `fetchWithTimeout` (the custom `fetch` wrapper in `supabase.ts`) so every REST/Storage call gets `Authorization: Bearer <bridge JWT>` without going through Supabase's auth state machine.

```typescript
// web/src/lib/authBridge.ts
export function setupSupabaseSession(session: BridgeSession): void {
  setBridgeToken(session.access_token)
  // Note: does NOT call supabase.auth.setSession()
}

// web/src/lib/supabase.ts
let _bridgeToken: string | null = null

export function setBridgeToken(token: string | null): void {
  _bridgeToken = token
  if (token) supabase.realtime.setAuth(token)
}

// Inside fetchWithTimeout — injected on every non-auth request
if (_bridgeToken && !url.includes('/auth/v1/')) {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${_bridgeToken}`)  // always overrides anon key
  effectiveInit = { ...init, headers }
}
```
