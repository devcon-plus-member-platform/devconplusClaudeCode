// generate-qr-token Edge Function
// Deploy: supabase functions deploy generate-qr-token
//
// Input:  { registration_id: string }
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
  'https://staging.cloud-engineer.dev',
  'https://staging.devcon.plus',
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

    // Service role client for data operations (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Rate limit: 10 token requests per user per 60s.
    // Placed before req.json() — body is only parsed if not rate-limited.
    // Uses service_role client — check_rate_limit RPC is restricted to service_role.
    // Fail closed — any RPC error returns 429 (protects the points ecosystem).
    const { data: rlAllowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      p_identifier: `user:${callerId}`,
      p_bucket:     'qr_generate',
    })
    if (rlError || !rlAllowed) {
      return new Response(
        JSON.stringify({ error: 'Too many token requests. Please wait before refreshing your ticket.' }),
        { status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Retry-After': '60' } }
      )
    }

    const { registration_id } = await req.json() as { registration_id: string }
    if (!registration_id) {
      return new Response(
        JSON.stringify({ error: 'Missing registration_id.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(registration_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid registration_id format.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 2. Validate registration: must belong to caller and be approved
    const { data: reg, error: regErr } = await supabase
      .from('event_registrations')
      .select('id, user_id, event_id, status, events(status)')
      .eq('id', registration_id)
      .eq('user_id', callerId)
      .eq('status', 'approved')
      .single()

    if (regErr || !reg) {
      return new Response(
        JSON.stringify({ error: 'Registration not found or not approved.' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 3. Reject if event has already passed
    const eventStatus = (reg.events as { status: string } | null)?.status
    if (eventStatus === 'past') {
      return new Response(
        JSON.stringify({ error: 'Event has already passed.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 4. Sign a short-lived JWT (35s TTL — slightly over the 30s client rotation interval)
    const rawSecret = Deno.env.get('QR_JWT_SECRET') ?? ''
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(rawSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    )
    const expiresAt = getNumericDate(35)
    const token = await create(
      { alg: 'HS256', typ: 'JWT' },
      { sub: uuidToCompact(reg.id), exp: expiresAt },
      key
    )

    logger.info('qr_token_generated', { registration_id: reg.id })
    return new Response(
      JSON.stringify({ token, expires_at: expiresAt }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    logger.error('qr_token_error', { message: err instanceof Error ? err.message : 'Internal error.' })
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error.' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
