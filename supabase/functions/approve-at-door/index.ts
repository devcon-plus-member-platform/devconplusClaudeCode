// approve-at-door Edge Function
// Deploy: supabase functions deploy approve-at-door
//
// Called by the organizer's QR scanner after scanning a pending member QR.
//
// Input:  { registration_id: string, action: 'approve' | 'reject' }
// Output (approve): { success: true, member_name, points_awarded, event_title }
// Output (reject):  { success: true, rejected: true, member_name }

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

    // Service role client — bypasses RLS for atomic updates
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { registration_id, action } = await req.json() as {
      registration_id: string
      action: 'approve' | 'reject'
    }

    if (!registration_id || (action !== 'approve' && action !== 'reject')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or invalid fields.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(registration_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid registration_id format.' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 2. Validate caller is an organizer
    const { data: organizer, error: orgError } = await supabase
      .from('profiles')
      .select('id, role, chapter_id')
      .eq('id', callerId)
      .in('role', ['chapter_officer', 'hq_admin', 'super_admin'])
      .single()

    if (orgError || !organizer) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: not an organizer.' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 3. Fetch the registration — must be pending
    const { data: reg, error: regError } = await supabase
      .from('event_registrations')
      .select('id, user_id, event_id, status')
      .eq('id', registration_id)
      .eq('status', 'pending')
      .single()

    if (regError || !reg) {
      return new Response(
        JSON.stringify({ success: false, error: 'Registration not found or not pending.' }),
        { status: 404, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 4. Fetch member profile and event details
    const [memberRes, eventRes] = await Promise.all([
      supabase.from('profiles').select('full_name, chapter_id').eq('id', reg.user_id).single(),
      supabase.from('events').select('title, points_value, chapter_id, is_chapter_locked').eq('id', reg.event_id).single(),
    ])
    const memberName = memberRes.data?.full_name ?? 'Member'
    const eventTitle = eventRes.data?.title ?? ''
    const pointsValue = eventRes.data?.points_value ?? 0

    // 4b. Chapter scoping: chapter_officers can only approve/reject for their own chapter's events.
    //     hq_admin and super_admin bypass this check.
    if (
      organizer.role === 'chapter_officer' &&
      organizer.chapter_id &&
      eventRes.data?.chapter_id !== organizer.chapter_id
    ) {
      logger.warn('door_chapter_mismatch', {
        organizer_id: organizer.id,
        organizer_chapter: organizer.chapter_id,
        event_chapter: eventRes.data?.chapter_id,
        event_id: reg.event_id,
      })
      return new Response(
        JSON.stringify({ success: false, error: 'This registration is for a different chapter\'s event.' }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // 4c. Chapter-lock enforcement: if the event is locked to its chapter,
    //     reject approval for members from other chapters.
    if (
      eventRes.data?.is_chapter_locked === true &&
      memberRes.data?.chapter_id &&
      eventRes.data?.chapter_id !== memberRes.data?.chapter_id
    ) {
      logger.warn('door_chapter_locked', {
        member_id: reg.user_id,
        member_chapter: memberRes.data?.chapter_id,
        event_chapter: eventRes.data?.chapter_id,
        event_id: reg.event_id,
      })
      return new Response(
        JSON.stringify({ success: false, error: 'This event is locked to its home chapter.' }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // ── REJECT path ───────────────────────────────────────────────────────────
    if (action === 'reject') {
      await supabase
        .from('event_registrations')
        .update({ status: 'rejected' })
        .eq('id', registration_id)

      logger.info('door_rejection', { registration_id, organizer_id: organizer.id })

      return new Response(
        JSON.stringify({ success: true, rejected: true, member_name: memberName }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // ── APPROVE path ──────────────────────────────────────────────────────────
    // Atomically approve + check in — only if still pending (guards against double-tap)
    const { data: claimed, error: claimErr } = await supabase
      .from('event_registrations')
      .update({ status: 'approved', checked_in: true })
      .eq('id', registration_id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (claimErr || !claimed) {
      // Either already approved by another organizer, or an unexpected DB error
      return new Response(
        JSON.stringify({
          success: false,
          already_approved: true,
          member_name: memberName,
        }),
        { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Award points
    await supabase.from('point_transactions').insert({
      user_id:     reg.user_id,
      amount:      pointsValue,
      description: `Attended: ${eventTitle}`,
      source:      'event_attendance',
    })

    await supabase.rpc('increment_member_points', {
      p_user_id: reg.user_id,
      p_amount:  pointsValue,
    })

    logger.info('door_approval', {
      registration_id,
      organizer_id:   organizer.id,
      points_awarded: pointsValue,
    })

    return new Response(
      JSON.stringify({
        success:        true,
        member_name:    memberName,
        points_awarded: pointsValue,
        event_title:    eventTitle,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    logger.error('door_approval_error', { message: err instanceof Error ? err.message : 'Internal error.' })
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Internal error.' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
