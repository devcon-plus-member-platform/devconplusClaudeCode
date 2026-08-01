# Runbook: In-App Maintenance Mode

Takes the DEVCON+ frontend offline behind a branded maintenance screen. One toggle,
every route.

**Scope:** the app UI only. The API keeps serving — this does not stop anything at the
backend. If a window needs the API blocked too, that is a separate nginx/EC2 change.

---

## Files

| File | Purpose |
|---|---|
| `web/src/lib/maintenance.ts` | **Edit this** — copy, ETA, contact, socials, bypass key |
| `web/src/components/MaintenanceShell.tsx` | The screen itself (prop-driven) |
| `web/src/App.tsx` | The toggle — a commented block near the top |
| `web/src/pages/MaintenancePreview.tsx` | Renders the screen at `/maintenance-preview` |

---

## Turn it ON

1. **Update the copy** in `web/src/lib/maintenance.ts` — at minimum `backBy`, which is a
   plain string, so write it the way a member should read it
   (`'Monday, August 3, 2026'`, `'Sunday 10PM PHT'`, …).
   Set `backBy: null` if you genuinely don't know; the ETA pill disappears rather than
   showing a date you'll miss.

2. **Rotate the bypass key** (`MAINTENANCE_BYPASS_KEY`) if the previous one has been
   shared around.

3. **Preview it**: `cd web && npm run dev`, open `/maintenance-preview`. Check 390px
   mobile and desktop.

4. **Flip the switch** in `web/src/App.tsx` — uncomment the two imports *and* the
   `if (SHOW_MAINTENANCE)` line. All three, or none:

   ```tsx
   import MaintenanceShell from './components/MaintenanceShell'
   import { MAINTENANCE_CONFIG, SHOW_MAINTENANCE } from './lib/maintenance'

   export default function App() {
     if (SHOW_MAINTENANCE) return <MaintenanceShell {...MAINTENANCE_CONFIG} />
   ```

   > Leaving an import live with the usage still commented **fails the build** —
   > `noUnusedLocals` makes `tsc -b` exit non-zero, which aborts the Vercel deploy.
   > See `.claude/rules/vercel-build-safety.md`.

5. `npm run typecheck && npm run build`, then commit and deploy.

---

## Turn it OFF

Comment all three lines back out, `npm run typecheck`, commit, deploy. Nothing else to
undo — no env var, no flag left set anywhere.

---

## Bypassing it (team only)

Open `https://<host>/?maintenance-bypass=<MAINTENANCE_BYPASS_KEY>` — currently
`devcon-ops`. That sets a `sessionStorage` flag, so the bypass holds for the rest of the
tab session including in-app navigation and reloads. A fresh tab or incognito window
sees the maintenance screen again.

> ⚠️ **Not access control.** The key is compiled into the public JS bundle; anyone can
> read it in DevTools. It exists so the team can verify the live app during a window —
> nothing is actually protected by it.

---

## What the gate covers

The check sits above every hook in `App.tsx`, so it replaces:

- every member, organizer and admin route
- public routes (`/events/:slug`, `/wheel`, `/officer-resources/*`)
- lazy-loaded routes and the `*` 404 catch-all

It also returns **before** `initialize()` and the `fetchEvents / fetchJobs / fetchNews`
prefetches, so open tabs stop calling `api.devcon.plus` and Firebase for the duration.
Confirm that in DevTools → Network when you test.

When the block is commented out, nothing imports `MaintenanceShell` or `lib/maintenance`,
so Rollup drops both from the production bundle entirely. `/maintenance-preview` is a
lazy route in its own chunk and never loads for members.

---

## Verifying before you deploy

With the block uncommented, on `npm run dev`:

- `/`, `/home`, `/events`, `/organizer`, `/admin`, `/wheel` and a bogus path like
  `/nope` all show the screen
- DevTools → Network: no requests to `api.devcon.plus` or Firebase
- `?maintenance-bypass=<key>` loads the real app; a fresh incognito tab does not
- Buttons work: **Try again** reloads, the email link opens a composer

---

## This vs. the nginx 503 page

Two different layers — pick by what is actually down.

| | This shell | `ops/maintenance-site/` + nginx 503 |
|---|---|---|
| Layer | Inside the React bundle | nginx, in front of everything |
| Use when | Planned window, app still deployable | App/EC2/deploy itself is broken |
| To change copy | Edit `lib/maintenance.ts`, redeploy | Regenerate static HTML, touch nginx/Terraform |
| Survives a broken frontend build | No | Yes |

The nginx path lives on the `dev` branch
(`infra/templates/nginx-maintenance.conf.tftpl`, `docs/runbooks/maintenance-window.md`).
Reach for it when the app can't serve itself; reach for this one for everything routine.
