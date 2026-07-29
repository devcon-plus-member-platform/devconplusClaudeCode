# DEVCON+ Maintenance Site

A standalone, independently-deployable Vercel project that serves the DEVCON+
"we're upgrading" page (`maintenance.html`, copied verbatim from
[`web/public/maintenance.html`](../../web/public/maintenance.html)) on **every path**,
with an `HTTP 503` status so search crawlers treat the downtime as temporary instead
of indexing a broken/empty site.

This project is separate from `web/` on purpose: it has no build step, no framework,
and no dependency on the main app's env vars or Supabase/Firebase config, so it can be
deployed even when the main app or its backing services are down.

## How it works

- [`api/maintenance.ts`](./api/maintenance.ts) — a Vercel serverless function that
  reads `maintenance.html` once per cold start and responds with:
  - `503` status
  - `Retry-After: 172800` (48 hours, in seconds)
  - `Cache-Control: no-store`
  - `Content-Type: text/html; charset=utf-8`
- [`vercel.json`](./vercel.json) — rewrites `/` and `/:path*` (every path) to
  `/api/maintenance`, so there is no route that falls through to a static 200 response.
- [`maintenance.html`](./maintenance.html) — the single source of the HTML markup for
  this project. If the page copy changes, update `web/public/maintenance.html` first,
  then copy it here again (do not let the two diverge).

## Deploying

First-time setup (once per machine/checkout):

```bash
cd ops/maintenance-site
vercel link          # link to (or create) the Vercel project for this site
```

Every deploy:

```bash
cd ops/maintenance-site
vercel deploy --prod
```

This publishes to the project's production URL, e.g.:

```
https://<this-deployment>.vercel.app
```

> Replace `<this-deployment>` with the actual project name Vercel assigns on first
> `vercel link` (shown in the CLI output and in the Vercel dashboard). To cut over
> `devcon.plus` during a real incident, point the domain's alias at this deployment
> (`vercel alias set <deployment-url> devcon.plus`) and revert once the main app is
> healthy again — do this only with explicit sign-off, since it redirects live traffic.

## Verifying the deploy

```bash
curl -sI https://<this-deployment>.vercel.app | head
```

Expected headers:

```
HTTP/2 503
retry-after: 172800
cache-control: no-store
content-type: text/html; charset=utf-8
```

```bash
curl -s https://<this-deployment>.vercel.app
```

Expected: the full maintenance page HTML body (same markup as
`web/public/maintenance.html`).

Also confirm a non-root path returns the same 503 page (proves the catch-all rewrite
is working):

```bash
curl -sI https://<this-deployment>.vercel.app/anything
```
