/**
 * Vercel Edge Function — per-event Open Graph / Twitter Card metadata.
 *
 * Link-preview crawlers (Facebook, Messenger, Twitter/X, LinkedIn, Discord,
 * Slack, Viber) do NOT execute JavaScript, so the static tags baked into
 * index.html are the only thing they ever see. That makes every event URL
 * share as the generic "DEVCON+ Beta" card.
 *
 * This function is wired to `/events/:slug` by a rewrite in vercel.json. It
 * fetches the static index.html shell, swaps the title, description and the
 * og / twitter card tags for the event's own (poster image comes from
 * events.cover_image_url), and returns the patched HTML. Humans get the exact
 * same SPA — only the
 * <head> differs — so routing, auth and the React app are untouched.
 *
 * Fail-open by design: any lookup error, missing env var, unknown slug or
 * draft event falls back to the unmodified shell (default DEVCON+ metadata).
 * A share preview is never worth breaking the page for.
 *
 * Env vars (server-only — set in Vercel project settings, NOT in .env.local;
 * these are the same two `api/keep-alive.ts` already uses):
 *   SUPABASE_URL       — Supabase REST base URL
 *   SUPABASE_ANON_KEY  — Supabase public anon key (events has a public
 *                        SELECT RLS policy: "Events are public")
 */
export const config = { runtime: 'edge' }

/** Fallback share image — matches the default card in index.html. */
const DEFAULT_IMAGE =
  'https://www.adobomagazine.com/wp-content/uploads/2024/07/DEVCON-celebrates-15-years-with-a-successful-Mindanao-summit-HERO.jpg'

const MAX_DESCRIPTION = 200

interface EventMeta {
  title: string | null
  description: string | null
  cover_image_url: string | null
  location: string | null
  event_date: string | null
  visibility: string | null
}

/** Escape a value for use inside a double-quoted HTML attribute. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Collapse whitespace and clip to a preview-friendly length. */
function summarize(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_DESCRIPTION
    ? `${flat.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`
    : flat
}

/** "Sat, Aug 23, 2026, 9:00 AM" in Philippine time. */
function formatEventDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

/**
 * Replace a tag's `content="…"` in place. Uses a replacer function so `$&`
 * and friends inside event copy are never treated as substitution patterns.
 */
function setContent(html: string, selector: string, value: string): string {
  const pattern = new RegExp(`(<meta ${selector} content=")[^"]*(")`)
  return html.replace(pattern, () => `<meta ${selector} content="${esc(value)}"`)
}

async function fetchEvent(slug: string): Promise<EventMeta | null> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null

  const query =
    `${url}/rest/v1/events` +
    `?slug=eq.${encodeURIComponent(slug)}` +
    `&select=title,description,cover_image_url,location,event_date,visibility` +
    `&limit=1`

  const res = await fetch(query, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return null

  const rows = (await res.json()) as EventMeta[]
  const event = rows[0]
  // Drafts are not shareable — let them fall back to the default card.
  if (!event || event.visibility === 'draft') return null
  return event
}

export default async function handler(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const origin = requestUrl.origin
  const slug = requestUrl.searchParams.get('slug') ?? ''

  const shell = await fetch(`${origin}/index.html`, { headers: { accept: 'text/html' } })
  if (!shell.ok) return shell

  let html = await shell.text()

  try {
    const event = slug ? await fetchEvent(slug) : null

    if (event?.title) {
      const title = summarize(event.title)
      const when = formatEventDate(event.event_date)
      const description = event.description?.trim()
        ? summarize(event.description)
        : summarize(
            [
              `Join ${event.title} on DEVCON+.`,
              when,
              event.location,
              'Register now.',
            ]
              .filter(Boolean)
              .join(' · '),
          )

      const rawImage = event.cover_image_url?.trim()
      const image = !rawImage
        ? DEFAULT_IMAGE
        : rawImage.startsWith('/')
          ? `${origin}${rawImage}`
          : rawImage

      const pageUrl = `${origin}/events/${slug}`

      html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)} | DEVCON+</title>`)
      html = setContent(html, 'name="description"', description)
      html = setContent(html, 'property="og:title"', title)
      html = setContent(html, 'property="og:description"', description)
      html = setContent(html, 'property="og:image"', image)
      html = setContent(html, 'name="twitter:title"', title)
      html = setContent(html, 'name="twitter:description"', description)
      html = setContent(html, 'name="twitter:image"', image)
      html = html.replace(
        '</head>',
        () =>
          `  <meta property="og:url" content="${esc(pageUrl)}" />\n` +
          `    <meta property="og:site_name" content="DEVCON+" />\n` +
          `    <meta property="og:image:alt" content="${esc(title)}" />\n` +
          `    <link rel="canonical" href="${esc(pageUrl)}" />\n` +
          `  </head>`,
      )
    }
  } catch (error) {
    // Fall through with the unmodified shell — the page must still render.
    console.warn('[og-event] metadata injection skipped:', error)
  }

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Browsers revalidate (asset hashes change per deploy); the CDN holds it
      // briefly so crawler storms and repeat shares don't hit Supabase.
      'cache-control': 'public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}
