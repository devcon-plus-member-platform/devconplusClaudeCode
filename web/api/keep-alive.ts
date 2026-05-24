/**
 * Vercel Serverless Function — keep-alive ping for Supabase free tier.
 *
 * Supabase pauses free-tier projects after 7 days of inactivity, causing
 * a 5–10 second cold-start on the next user request. This endpoint runs
 * a lightweight SELECT against the chapters table every 4 days (see the
 * "crons" config in vercel.json) to reset the inactivity timer.
 *
 * The cron runs server-side; no JWT is needed since chapters has a
 * public SELECT RLS policy.
 *
 * Auth: Vercel Cron sets `Authorization: Bearer <CRON_SECRET>` on scheduled
 * calls. The handler rejects any request that lacks the secret to prevent
 * unauthenticated callers from probing the endpoint or generating billable
 * Supabase traffic.
 *
 * Env vars (server-only — set in Vercel project settings, NOT in .env.local):
 *   SUPABASE_URL        — Supabase REST base URL
 *   SUPABASE_ANON_KEY   — Supabase public anon key
 *   CRON_SECRET         — shared secret injected by Vercel Cron
 */
export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  // Only accept GET (Vercel Cron calls are always GET)
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Validate Vercel Cron secret — rejects unauthenticated callers
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Use non-VITE_ env var names — VITE_ prefix bakes values into the client
  // bundle at build time; server-side functions should use their own plain names.
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    return new Response('Missing Supabase env vars', { status: 500 })
  }

  const res = await fetch(
    `${url}/rest/v1/chapters?select=id&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  )

  if (!res.ok) {
    return new Response(`Supabase ping failed: ${res.status}`, { status: 502 })
  }

  return new Response('ok', { status: 200 })
}
