# Contributing to DEVCON+

DEVCON+ is a two-app repo: a React + Vite frontend (`web/`) and a NestJS gateway (`server/`), backed
by Supabase + Firebase Auth. Read [`README.md`](README.md) for setup and [`.claude/CLAUDE.md`](.claude/CLAUDE.md)
for the full architecture and product rules before making changes — this doc covers workflow, not
architecture.

---

## 1. Getting Set Up

Follow [README.md Sections 1–3](README.md#1-clone-and-install) to install dependencies, configure
`web/.env.local` + `server/.env`, and run both apps locally. You'll need env values from the team lead
(see [README Section 13](README.md#13-credentials--access)) — there's no way to run the app against a
sandboxed/local database, so local dev talks to the live Supabase project.

---

## 2. Branching Strategy

```
feature branch ──PR──→ dev ──PR──→ master (production)
                         │                │
                  staging deploy    production deploy
              staging.devcon.plus     devcon.plus
```

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| your feature branch | Individual work | No automatic deploy |
| `dev` | Integration branch — where feature PRs land | Auto-deploys `web/` and `server/` to staging on every push |
| `master` | Production | Deploys `server/` on push (gated behind a GitHub "production" environment approval); `web/` production deploy is via Vercel's own Git integration |

**Rules:**
- Branch off `dev` for new work, not `master`.
- Open your PR against `dev`. Only `dev` → `master` PRs (typically opened by a maintainer at release time) merge into `master`.
- Never push directly to `dev` or `master` — always go through a PR.
- Name branches descriptively — `feat/short-description`, `fix/short-description`, `chore/short-description` are the conventions used in this repo's history. Prefixing with your name (`yourname/short-description`) is also common here and fine to keep doing.

> The historical convention in this repo used `develop` as the integration branch name; the actual
> branch is `dev`. If you see older docs reference `develop`, treat `dev` as authoritative — it's what
> the deploy workflows in `.github/workflows/` actually watch.

---

## 3. Commit Messages

This repo loosely follows [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short summary

feat(events): add region filter to EventsList
fix(auth): correct redirect after Google OAuth
chore(security): harden CSP headers
docs: update SECURITY.md for Firebase migration
```

Common types in this repo's history: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`,
`style`. Scope is optional but helpful (`events`, `auth`, `admin`, `security`, `infra`, `ops`).

---

## 4. Before Opening a PR

Run the checks for whichever app(s) you touched — these mirror what CI enforces:

```bash
# Frontend (web/)
cd web && npm run typecheck   # tsc -b --noEmit — Vercel's build fails on any error this catches
cd web && npm run lint
cd web && npm run test:ci
cd web && npm run build       # tsc -b && vite build — the exact Vercel build command

# Backend (server/)
cd server && npm run typecheck
cd server && npm run lint
cd server && npm run test:ci
cd server && npm run build    # nest build — this must pass; the backend deploy workflows gate on it
```

> `npm run typecheck` is not optional. The Vite dev server does **not** catch TypeScript errors that
> fail the Vercel build (`noUnusedLocals`, `noUnusedParameters`, `strictNullChecks`, etc.) — see
> [`.claude/rules/vercel-build-safety.md`](.claude/rules/vercel-build-safety.md).

If your change touches the DB schema, regenerate types afterward:
```bash
supabase gen types typescript --project-id <project-ref> > web/src/types/database.types.ts
cd web && npm run typecheck && npm run build
```

For any UI change, test at the 390px mobile viewport (Chrome DevTools → Device Toolbar) — this is a
mobile-first app. See [README Section 3](README.md#3-running-the-app).

---

## 5. Opening the PR

- Target `dev`, not `master`.
- Fill out the [PR template](.github/pull_request_template.md) — summary, test plan checklist,
  before/after screenshots for UI changes.
- Requires 1 approval before merging (branch protection on `dev`).
- Backend PRs additionally run `npm run build` + `npm test` in CI as part of the staging deploy
  workflow (`.github/workflows/deploy-backend-staging.yml`) once merged to `dev` — a failing test
  blocks the staging deploy, so make sure `npm test` passes locally first.

---

## 6. What Not to Do

These are enforced by [`.claude/CLAUDE.md`](.claude/CLAUDE.md) Section 0 and exist because violating
them has broken the app before:

- Don't add direct `supabase.from(...)` / `supabase.rpc(...)` calls in new frontend code — go through
  `apiFetch`/`publicFetch` (`web/src/lib/api.ts`). Direct `supabase-js` is legacy bridge-JWT and being
  retired.
- Don't build a feature that depends on an always-on Supabase Realtime subscription — the app is
  polling-first by design (`.claude/rules/db-connection-resilience.md`). Realtime is best-effort only.
- Don't use `lucide-react` or emoji icons — `solar-icon-set` outline variant only, colored via the
  `color` prop (`.claude/rules/solar-icon-styling.md`).
- Don't hardcode hex values for the primary color — use `text-primary`/`bg-primary` (CSS-variable
  driven, theme-aware).
- Don't commit `.env.local`, `server/.env`, or any secret — see
  [`.claude/docs/SECURITY.md`](.claude/docs/SECURITY.md) for where each credential belongs.
- Don't add Apple Sign-In — auth is Google OAuth + email/password via Firebase only.

---

## 7. Questions

For anything not covered here, check [README.md Section 14](README.md#14-reference-documents) for the
full reference document index, or ask the team lead (see
[README Section 13](README.md#13-credentials--access)).
