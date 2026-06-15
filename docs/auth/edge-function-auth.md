# Edge Function Authentication

All 8 Supabase Edge Functions use a shared `verifyCallerJwt()` helper to authenticate callers. This replaced `supabase.auth.getUser()` in Phase 4.

---

## The Problem with `supabase.auth.getUser()`

The old pattern validated the JWT `sub` against `auth.users`. Firebase-only users don't have rows in `auth.users` → `getUser()` returns 403 → function returns 401 for all Firebase users.

```typescript
// OLD — broken for Firebase users
const supabaseAuth = createClient(url, anonKey, {
  global: { headers: { Authorization: req.headers.get('Authorization') } }
})
const { data: { user }, error } = await supabaseAuth.auth.getUser()
// ↑ fails with 403 for Firebase-only users
```

---

## Current Pattern (`verifyCallerJwt`)

**File:** `supabase/functions/_shared/auth.ts`

```typescript
export async function verifyCallerJwt(req: Request): Promise<string> {
  // 1. Extract Bearer token from Authorization header
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) throw new Error('Missing Authorization header')
  const token = authHeader.slice(7)

  // 2. Split JWT into 3 parts (header.payload.signature)
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  const [headerB64, payloadB64, signatureB64] = parts

  // 3. Verify HMAC-SHA256 signature using SUPABASE_JWT_SECRET
  //    (auto-injected by Supabase into all Edge Function runtimes)
  const secret = Deno.env.get('SUPABASE_JWT_SECRET') ?? ''
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  )
  const valid = await crypto.subtle.verify(
    'HMAC', key,
    base64urlDecode(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  )
  if (!valid) throw new Error('Invalid JWT signature')

  // 4. Decode payload and check expiry
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)))
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT expired')
  }

  // 5. Return sub claim = profiles.id
  const sub = typeof payload.sub === 'string' ? payload.sub : undefined
  if (!sub) throw new Error('No sub claim in JWT')
  return sub
}
```

### Why Native Web Crypto Instead of `djwt`

`djwt@v3.0.2` (used by QR functions for QR token verification) has library-specific behavior when validating JWTs that contain `aud` and `role` claims (which the NestJS bridge JWT carries). Native `crypto.subtle.verify()` verifies only what matters: the **HMAC-SHA256 signature** and the **`exp` claim**. No library quirks, no version-specific behavior.

---

## Usage in Each Function

Every function that requires caller authentication wraps the call in a try/catch returning 401:

```typescript
// Standard pattern in all 8 edge functions
let callerId: string
try {
  callerId = await verifyCallerJwt(req)
} catch {
  return new Response(
    JSON.stringify({ error: 'Unauthorized.' }),
    { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
  )
}
// callerId is now a validated profiles.id UUID
```

`callerId` is then used for:
- **Role checks:** `.eq('id', callerId).in('role', ['chapter_officer', ...])` 
- **Ownership checks:** `.eq('user_id', callerId)` on registrations/transactions
- **Rate limiting:** `p_identifier: 'user:${callerId}'`
- **Logging:** `{ user_id: callerId }`

---

## `verify_jwt: false` Gateway Setting

All 8 functions are deployed with `verify_jwt: false`. This disables the Supabase gateway's built-in JWT check (which also validates against `auth.users`). Security is maintained because `verifyCallerJwt()` performs the HMAC verification in-function.

Without `verify_jwt: false`, the gateway would reject Firebase-only users before the function even runs.

---

## Functions Using `verifyCallerJwt`

| Function | What it does with `callerId` |
|---|---|
| `generate-user-qr` | Rate limit key; `sub` in the QR JWT |
| `generate-qr-token` | Rate limit key; validates `registration.user_id = callerId` |
| `generate-pending-qr` | Rate limit key; validates `registration.user_id = callerId` |
| `award-points-on-scan` | Validates caller is an organizer role |
| `approve-at-door` | Validates caller is an organizer role |
| `delete-user` | Validates caller is `super_admin` or `hq_admin` |
| `send-email` | Rate limit key only |
| `check-rate-limit` | Only for `org_upgrade` bucket (IP-keyed buckets skip JWT) |

---

## `SUPABASE_JWT_SECRET` Environment Variable

This secret is **automatically injected** by Supabase into every Edge Function runtime — no manual configuration in the Supabase dashboard is needed. The value is the same JWT secret shown in **Supabase Dashboard → Settings → API → JWT Settings**.

The NestJS bridge must use the **exact same value** in `server/.env`:

```env
SUPABASE_JWT_SECRET=your-supabase-jwt-secret-here
```

If these differ, `verifyCallerJwt()` will return `Invalid JWT signature` and all Edge Function calls return 401.
