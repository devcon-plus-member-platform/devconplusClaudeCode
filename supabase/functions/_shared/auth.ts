// _shared/auth.ts — caller identity for all edge functions (Phase 4)
//
// Replaces supabase.auth.getUser() which fails for Firebase-only accounts
// (their profiles.id UUIDs are not in auth.users). Manual HS256 verification
// against SUPABASE_JWT_SECRET lets us extract the sub claim directly.
//
// Uses native Web Crypto instead of djwt to avoid library quirks with the
// aud/iss claims that the NestJS bridge JWT carries. Verifies only what
// we care about: HMAC-SHA256 signature + exp claim.
//
// SUPABASE_JWT_SECRET is automatically injected by Supabase into every Edge
// Function runtime — no custom secret configuration needed.

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (base64.length % 4)) % 4
  return Uint8Array.from(atob(base64 + '='.repeat(pad)), c => c.charCodeAt(0))
}

/**
 * Verify the caller's bridge JWT (HS256, signed with SUPABASE_JWT_SECRET).
 * Returns the `sub` claim which equals `profiles.id`.
 * Throws on missing/malformed header, bad signature, or expired token.
 */
export async function verifyCallerJwt(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) throw new Error('Missing Authorization header')
  const token = authHeader.slice(7)

  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')
  const [headerB64, payloadB64, signatureB64] = parts

  const secret = Deno.env.get('SUPABASE_JWT_SECRET') ?? ''
  if (!secret) throw new Error('SUPABASE_JWT_SECRET not set')

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  const signature = base64urlDecode(signatureB64)
  const valid = await crypto.subtle.verify('HMAC', key, signature, signingInput)
  if (!valid) throw new Error('Invalid JWT signature')

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)))

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new Error('JWT expired')
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : undefined
  if (!sub) throw new Error('No sub claim in JWT')
  return sub
}
