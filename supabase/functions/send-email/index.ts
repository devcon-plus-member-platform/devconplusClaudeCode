// send-email Edge Function
// Deploy: supabase functions deploy send-email
//
// Thin wrapper around the Resend API for transactional emails.
// Uses native fetch() — no npm package needed in Deno.
//
// Input:  { to: string, subject: string, html: string, from?: string }
// Output: { success: boolean, error?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logger } from '../_shared/logger.ts'
import { verifyCallerJwt } from '../_shared/auth.ts'

const DEFAULT_FROM = 'DEVCON+ <noreply@devconplus.ph>'

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
        JSON.stringify({ success: false, error: 'Unauthorized.' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Service role client for rate limit RPC
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 2. Rate limit: 30 emails per user per 60s — prevents abuse if called in a loop
    const { data: rlAllowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      p_identifier: `user:${callerId}`,
      p_bucket:     'send_email',
    })
    if (rlError || !rlAllowed) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email rate limit exceeded.' }),
        { status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Retry-After': '60' } }
      )
    }

    const { to, subject, html, from } = await req.json() as {
      to: string
      subject: string
      html: string
      from?: string
    }

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: to, subject, html.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      logger.error('send_email_missing_api_key', {})
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured.' }),
        { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 3. Send via Resend API — native fetch, no npm package
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from ?? DEFAULT_FROM,
        to,
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error('send_email_resend_error', { status: res.status, body })
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email.' }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    logger.info('send_email_success', { to, subject })
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    logger.error('send_email_error', { message: err instanceof Error ? err.message : 'Internal error.' })
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Internal error.' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
