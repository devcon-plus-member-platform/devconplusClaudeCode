// delete-user Edge Function
// Deploy: supabase functions deploy delete-user
//
// Permanently deletes a Supabase Auth user (and cascades to profiles).
// Only callable by super_admin.
//
// Input:  { user_id: string }
// Output: { success: true } | { success: false, error: string }
// Always returns HTTP 200 — errors are encoded in the response body.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { logger } from '../_shared/logger.ts'
import { verifyCallerJwt } from '../_shared/auth.ts'

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

    // Service-role client — bypasses RLS, required for auth.admin.deleteUser
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 2. Confirm caller is super_admin
    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .single()

    if (callerErr || !callerProfile || callerProfile.role !== 'super_admin') {
      logger.warn('delete_user_forbidden', { caller_id: callerId, role: callerProfile?.role })
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden: admin access required.' }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 3. Parse + validate input
    const body = await req.json() as { user_id?: string }
    const { user_id } = body

    if (!user_id || !UUID_RE.test(user_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or missing user_id.' }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 4. Prevent self-deletion
    if (user_id === callerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'You cannot delete your own account.' }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 5. Delete the auth user — cascades to profiles via FK
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id)

    if (deleteErr) {
      logger.error('delete_user_failed', { user_id, message: deleteErr.message })
      return new Response(
        JSON.stringify({ success: false, error: deleteErr.message }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    logger.info('delete_user_success', { deleted_user_id: user_id, deleted_by: callerId })

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    logger.error('delete_user_error', { message: err instanceof Error ? err.message : 'Internal error.' })
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Internal error.' }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
