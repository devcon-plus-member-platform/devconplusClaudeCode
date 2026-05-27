// supabase/functions/check-rate-limit/index.ts
// Generic rate limit enforcer called by the client for surfaces without their own edge function.
//
// IP-keyed buckets (login, login_ip, signup, username_check): no JWT required
// User-keyed buckets (org_upgrade): valid JWT required
//
// Input:  { bucket: string, email?: string }
// Output: { allowed: boolean, retryAfterSeconds?: number }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logger } from '../_shared/logger.ts'

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'https://devconplusbeta-v1.vercel.app',
])

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true
  return origin.endsWith('.vercel.app')
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

type Bucket = 'login' | 'login_ip' | 'signup' | 'username_check' | 'org_upgrade' | 'password_reset' | 'oauth_initiate' | 'oauth_signup'
const IP_BUCKETS: Bucket[] = ['login', 'login_ip', 'signup', 'username_check', 'password_reset', 'oauth_initiate', 'oauth_signup']

// Window durations matching the check_rate_limit RPC CASE statement.
// Used only for retryAfterSeconds calculation — not for enforcement.
const WINDOW_MAP: Record<string, number> = {
  qr_generate:     60,
  qr_scan:         60,
  login:           300,
  login_ip:        300,
  signup:          3600,
  username_check:  60,
  org_upgrade:     90000,
  password_reset:  3600,
  oauth_initiate:  300,   // 5 minutes — matches oauth_initiate SQL window
  oauth_signup:    3600,  // 1 hour   — matches oauth_signup SQL window
}

// Extract the rightmost non-private IP from the x-forwarded-for chain.
// Rightmost = server-side proxy appended, not client-controlled.
// Covers IPv4 RFC 1918 ranges, IPv6 loopback, link-local (fe80:), unique local (fc/fd).
function extractIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const ips = xff.split(',').map((s) => s.trim()).filter(Boolean)
  const privateRanges =
    /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|fe80:|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i
  const publicIp = [...ips].reverse().find((ip) => !privateRanges.test(ip))
  // 'unknown' fallback: all missing-header requests share one bucket (acceptable for MVP)
  return publicIp ?? ips[0] ?? 'unknown'
}

// Calculate how many seconds until the oldest in-window entry expires.
// Uses anon client — GRANT SELECT ON rate_limit_log TO anon is in the migration.
// On query error → falls back to full window duration.
async function calcRetryAfter(
  supabase: ReturnType<typeof createClient>,
  identifier: string,
  bucket: string
): Promise<number> {
  const window = WINDOW_MAP[bucket] ?? 60
  const { data } = await supabase
    .from('rate_limit_log')
    .select('created_at')
    .eq('identifier', identifier)
    .eq('bucket', bucket)
    .gt('created_at', new Date(Date.now() - window * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) return window
  const oldest = new Date(data.created_at).getTime()
  return Math.ceil(Math.max(0, oldest + window * 1000 - Date.now()) / 1000)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  // Parse body once — req.json() can only be consumed once per request
  const json: { bucket?: string; email?: string } = await req.json().catch(() => ({}))
  const bucket = json.bucket as Bucket | undefined

  if (!bucket) {
    return new Response(
      JSON.stringify({ allowed: false, error: 'Missing bucket.' }),
      { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }

  // Anon client — used for retryAfterSeconds SELECT query (has SELECT on rate_limit_log)
  const supabaseAnon = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Service role client — required for check_rate_limit RPC (REVOKE FROM PUBLIC applied)
  const supabaseService = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let identifier: string

  if ((IP_BUCKETS as string[]).includes(bucket)) {
    // IP-keyed buckets: no JWT required
    if (bucket === 'login' || bucket === 'password_reset') {
      if (!json.email) {
        return new Response(
          JSON.stringify({ allowed: false, error: 'Missing email.' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }
      // RFC 5321: max email address length is 254 characters
      if (json.email.length > 254) {
        return new Response(
          JSON.stringify({ allowed: false, error: 'Invalid email.' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }
      identifier = `email:${json.email.toLowerCase().trim()}`
    } else {
      identifier = `ip:${extractIp(req)}`
    }
  } else if (bucket === 'org_upgrade') {
    // User-keyed bucket: JWT required
    const authHeader = req.headers.get('Authorization')
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader ?? '' } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ allowed: false, error: 'Unauthorized.' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }
    identifier = `user:${user.id}`
  } else {
    // Unknown bucket → 400 Bad Request (not 429 — this is a caller error, not a rate limit event)
    return new Response(
      JSON.stringify({ allowed: false, error: 'Unknown bucket.' }),
      { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }

  // Call the RPC via service_role (REVOKE FROM PUBLIC means anon cannot call it).
  // On error: fail closed — deny the request rather than silently allowing brute-force.
  const { data: allowed, error: rpcErr } = await supabaseService.rpc('check_rate_limit', {
    p_identifier: identifier,
    p_bucket:     bucket,
  })

  if (rpcErr) {
    logger.error('rate_limit_rpc_error', { message: rpcErr.message })
    return new Response(
      JSON.stringify({ allowed: false, retryAfterSeconds: WINDOW_MAP[bucket] ?? 60 }),
      { status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }

  if (!allowed) {
    logger.warn('rate_limit_blocked', { bucket, identifier })
    const secs = await calcRetryAfter(supabaseAnon, identifier, bucket)
    return new Response(
      JSON.stringify({ allowed: false, retryAfterSeconds: secs }),
      {
        status: 429,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
          'Retry-After': String(secs),  // RFC 7231 machine-readable header
        },
      }
    )
  }

  return new Response(
    JSON.stringify({ allowed: true }),
    { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
  )
})
