# DEVCON+ Maintenance Site

A standalone, independently-deployable Vercel project that serves the DEVCON+
"we're upgrading" page (`maintenance.html`) on **every path**, with an `HTTP 503`
status so search crawlers treat the downtime as temporary instead of indexing a
broken/empty site.

This project is separate from `web/` on purpose: **the deployed artifact** has no
build step, no framework, and no dependency on the main app's env vars or
Supabase/Firebase config, so it can be deployed even when the main app or its backing
services are down. That constraint applies to what gets served at runtime — it does
not mean the HTML has to be hand-edited. See "Editing the page copy" below.

## How it works

- [`api/maintenance.ts`](./api/maintenance.ts) — a Vercel serverless function that
  reads `maintenance.html` once per cold start and responds with:
  - `503` status
  - `Retry-After: 172800` (48 hours, in seconds)
  - `Cache-Control: no-store`
  - `Content-Type: text/html; charset=utf-8`
- [`vercel.json`](./vercel.json) — rewrites `/` and `/:path*` (every path) to
  `/api/maintenance`, so there is no route that falls through to a static 200 response.
  `/favicon.ico` has its own rule (`source`/`destination` both `/favicon.ico`) placed
  *before* the catch-all, so the browser's automatic favicon request resolves to the
  real static file below instead of getting swallowed by the 503 rewrite — Vercel
  rewrites match in array order, first match wins.
- [`favicon.ico`](./favicon.ico) — copied from [`web/public/favicon.ico`](../../web/public/favicon.ico)
  (same brand mark as the main app). If the brand favicon changes, re-copy it here too.
- [`maintenance.html`](./maintenance.html) — a **generated, checked-in** file, kept in
  sync byte-for-byte with [`web/public/maintenance.html`](../../web/public/maintenance.html).
  Do not hand-edit either copy — see below.

## Editing the page copy

The page markup lives in one place, [`shell/MaintenanceShell.tsx`](./shell/MaintenanceShell.tsx),
a React component that takes a single `backBy` prop (e.g. `"Monday, August 3, 2026"`).
It is **never imported into `web/src`** and never rendered at runtime — it exists only
to be rendered to static HTML at build time, so the deployed `api/maintenance.ts` path
above stays framework-free.

To update the return date (or any other copy):

1. Edit `BACK_BY` in [`scripts/generate.tsx`](./scripts/generate.tsx) (or the JSX in
   `MaintenanceShell.tsx` for anything beyond the date).
2. Run:
   ```bash
   cd ops/maintenance-site
   npm install   # first time only
   npm run generate
   ```
   This regenerates **both** `ops/maintenance-site/maintenance.html` and
   `web/public/maintenance.html` from the same component, so they can't drift apart.
3. Review the diff, commit both regenerated `.html` files together with the
   `MaintenanceShell.tsx`/`generate.tsx` change, then deploy as below.

`npm run typecheck` also type-checks `shell/` and `scripts/` now (not just `api/`).

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

Also confirm the favicon exception rule works (should be a real `200` + `image/...`
content type, NOT the 503 HTML page):

```bash
curl -sI https://<this-deployment>.vercel.app/favicon.ico
```
