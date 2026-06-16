// generate-user-qr Edge Function
// Deploy: supabase functions deploy generate-user-qr
//
// Generates an always-on user identity QR token (k='u').
// Unlike generate-qr-token (which encodes a registration_id),
// this encodes the caller's user_id so the organizer scanner can
// auto-match the member's next upcoming event registration.
//
// Input:  {} (empty — user is identified from JWT)
// Output: { token: string, expires_at: number }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'
import { logger } from '../_shared/logger.ts'
import { verifyCallerJwt } from '../_shared/auth.ts'

// Encode UUID (36 hex chars) → 22-char base64url (128 bits, no hyphens)
function uuidToCompact(uuid: string): string {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'https://devconplusbeta-v1.vercel.app',
  'https://devcon.plus',
  'https://www.devcon.plus',
])

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    // 1. Verify caller identity via bridge JWT (Phase 4 — replaces supabase.auth.getUser())
    let callerId: string
    try {
      callerId = await verifyCallerJwt(req)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Unauthorized.' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Service role client for RPC
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 2. Rate limit: 10 requests per user per 60s. Fail closed.
    const { data: rlAllowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      p_identifier: `user:${callerId}`,
      p_bucket:     'user_qr_generate',
    })
    if (rlError || !rlAllowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait before refreshing your QR.' }),
        { status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Retry-After': '60' } }
      )
    }

    // 3. Sign JWT with k='u' kind, sub=user_id, 300s TTL (5 min)
    const rawSecret = Deno.env.get('QR_JWT_SECRET') ?? ''
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(rawSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    )
    const expiresAt = getNumericDate(300)
    const token = await create(
      { alg: 'HS256', typ: 'JWT' },
      { k: 'u', sub: uuidToCompact(callerId), exp: expiresAt },
      key
    )

    logger.info('user_qr_generated', { user_id: callerId })
    return new Response(
      JSON.stringify({ token, expires_at: expiresAt }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    logger.error('user_qr_error', { message: err instanceof Error ? err.message : 'Internal error.' })
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error.' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
