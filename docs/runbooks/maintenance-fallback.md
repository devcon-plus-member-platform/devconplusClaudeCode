# Break-glass fallback: serve maintenance.html from the main `web/` Vercel project

## When to use this

**This is NOT the primary maintenance path.** The primary path (approach A) is the
standalone `ops/maintenance-site/` Vercel project, which serves `maintenance.html` with a
real `HTTP 503` + `Retry-After` header (see `ops/maintenance-site/README.md`) via an alias
swap (`vercel alias set <deployment-url> devcon.plus`).

Use the toggle below **only if that alias-swap misbehaves** (e.g. the standalone project
fails to deploy, the alias won't point at it, or a fast rollback of the alias swap itself
is unavailable) and you need an emergency way to stop serving the live SPA from the `web/`
project itself, using infrastructure that's already deployed.

**⚠️ SEO / crawler caveat:** unlike the primary 503 path, this fallback serves
`maintenance.html` with a plain **HTTP 200** (Vercel rewrites don't carry a status code —
every route just resolves to the same static file). Search crawlers may index the
maintenance page as if it were real content, and clients/CDNs may cache a 200 more
aggressively than a 503 with `Retry-After`. Do not leave this toggle applied longer than
the incident requires; revert as soon as the primary path is healthy or the incident ends.

## The one-line toggle

File: [`web/vercel.json`](../../web/vercel.json)

**Normal state (default — do not change without an active incident):**

```json
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
```

**Maintenance state (temporary — apply only during a break-glass incident):**

```json
  "rewrites": [
    { "source": "/(.*)", "destination": "/maintenance.html" }
  ],
```

That's the entire change — one string, `/index.html` → `/maintenance.html`. Everything
else in `vercel.json` (the `headers` block — HSTS, CSP, X-Frame-Options, etc. — and the
`crons` block) is untouched by this toggle and continues to apply to every response,
maintenance page included, because `headers` matches by request path (`/(.*)`), not by
rewrite destination.

## How to apply

1. Edit `web/vercel.json`, changing only the `destination` value as shown above.
2. Commit and deploy as normal (`vercel deploy --prod` from `web/`, or merge/push per the
   project's normal deploy flow) — this is a code change to a git-tracked file, not an
   instant alias flip, so it takes a full build + deploy cycle. If you need an
   **instant** cutover, the primary alias-swap path (`ops/maintenance-site/`) is faster;
   use this toggle when that path itself is the thing that's broken.
3. Verify: any route (`/`, `/events`, `/home`, a deep link, etc.) returns the maintenance
   page HTML, and response headers still include the CSP/HSTS/etc. from `vercel.json`.

## How to revert

Change the `destination` back to `/index.html` (restore the "Normal state" block above),
commit, and redeploy. Confirm the SPA loads again at `/` and that client-side routing
still works for a deep link (e.g. `/events`).

## Local verification (no deploy required)

```bash
cd web
npm run build   # confirm the toggle does NOT block the build either way — it's a
                 # static rewrite, unrelated to the tsc/vite build step
```

`vercel.json` rewrites only take effect on Vercel's routing layer (or `vercel dev` /
`vercel build` + a Vercel-aware server) — plain `vite build` / `vite preview` does not
apply them, so this can't be smoke-tested with `vite preview` alone. To confirm the
routing behavior itself, use the Vercel CLI (`vercel dev`) or inspect a preview
deployment after applying the toggle.
