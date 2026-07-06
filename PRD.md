# DEVCON+ — Product Requirements & Developer Handover
> Version: 1.4 | Last Updated: June 21, 2026 | v1.3 by Clayton · June 2026 architecture sync
> Live App: https://devcon.plus  (beta + `plus-beta.devcon.ph` 301-redirect here)
> Backend API: https://api.devcon.plus  (NestJS gateway — self-hosted EC2 + nginx)
> Repository: `devcon-plus/` — two apps: `web/` (React frontend) + `server/` (NestJS gateway) + `supabase/`

> **⚠️ Architecture update (June 2026):** Auth migrated to **Firebase** (Google + email/password), a
> **NestJS gateway** (`server/`) is now the primary backend, and Realtime is best-effort (polling-first).
> Sections describing an `apps/member/` monorepo or pure-Supabase auth have been corrected below.

---

# PART 1 — EXECUTIVE BRIEF

*This section is written for stakeholders, chapter officers, and anyone who needs to understand what DEVCON+ is and where it stands — no technical background required.*

---

## 1. Product Summary

**DEVCON+** is the official unified platform for DEVCON Philippines — the country's largest volunteer tech community with 11 nationwide chapters, 60,000+ members, and 14,000+ annual event attendees.

**Tagline:** Sync. Support. Succeed.

The platform solves a core coordination problem: DEVCON runs 100+ events per year across 11 chapters with no centralized system for registration, attendance tracking, or member engagement. DEVCON+ replaces manual spreadsheets and form links with a single mobile-first web app that handles event registration, QR-based check-in, a gamified points system, and a career opportunities board — all connected to a live database.

It is built and currently maintained by a two-person intern team (Kenshin and Kien) under the DEVCON Jumpstart Internship, with AI-assisted development via Claude Code.

---

## 2. Current Status

*As of June 21, 2026.*

| Area | Status | Notes |
|------|--------|-------|
| Member app (full flow) | Live | Sign up, events, QR ticket, points, rewards, jobs, profile |
| Organizer flow | Live | Event creation, registrant approval, QR scanner, announcements, co-organizers |
| Admin panel | Live | User mgmt, org codes, chapter officers, officer resources, upgrade reviews, CSV export, kiosk |
| Authentication | Live | Email/password + Google OAuth via **Firebase** (Supabase Auth cut) |
| Backend gateway (`server/`) | Live | NestJS on EC2 + nginx (`api.devcon.plus`); frontend fetches via `apiFetch`/`publicFetch` |
| QR check-in system | Live | Atomic check-in, double-award prevention, door approval flow |
| Points & rewards | Live | Earn points on attendance, view history, rewards catalog + claim PIN workflow |
| PWA (add to home screen) | Live | Icons, shortcuts, apple-touch-icon configured |
| External event registration | Live | Events can link to an external registration URL (or mark as TBA) |
| Guest / unauthenticated browsing | Live | Events list accessible without sign-in; event detail publicly viewable |
| Missions system | Live | Gamified missions with submission types (proof_upload / link / self_attest) |
| Interest quiz | Live | `/interests` onboarding interest selection |
| Raffle "Wheel of Names" | Live | Public `/wheel` + per-event `/wheel/:eventId` (password-gated) |
| Route error recovery | Live | `<RouteErrorBoundary />` wraps all route trees |
| Custom domain | **Live** | Production `https://devcon.plus`; beta + `plus-beta.devcon.ph` 301-redirect here |
| Transactional email | **Live** | NestJS email (nodemailer/Gmail) + `send-email` edge fn; unified branded email shell (June redesign) |
| Google OAuth on production domain | **Live** | Now Firebase OAuth on `devcon.plus` |
| Security audit (OWASP Top 10) | In Progress | White-box audit done (June 19–20); remediation underway on `Dale/security-audit-fix` (RLS/RPC hardening — see §8) |
| Test data cleanup | In Progress | Test accounts and Easter egg code need removal |
| Final QA (all flows end-to-end) | In Progress | On real mobile devices before public preview |

---

## 3. Key Milestones

| Date | Milestone |
|------|-----------|
| March 29, 2026 | Development started (Week 1 — auth, security foundations) |
| April 6, 2026 | QR system live; PWA manifest deployed; transactional email edge function deployed |
| April 8, 2026 | Cloudflare Turnstile CAPTCHA added to auth forms |
| April 15, 2026 | MD3 type scale applied across all UI; domain + email setup guide written |
| April 15, 2026 | Original MVP feature-complete milestone (Cohort 3) |
| May 1–12, 2026 | Hardening: Turnstile on email resend, `fetchWithTimeout` network resilience, realtime recovery follow-ups, safe return URL handling, creative 404 page, chapter sorting fix, Safe Space & Event Risk Consent in T&C |
| May 13–14, 2026 | External event registration; missions `submission_type`; jobs `logo_url`; `<RouteErrorBoundary />`; region + event-type filters; guest browsing; event share; admin cover image upload; chapter-scoped event filtering |
| May 28–31, 2026 | **Firebase Auth migration** — `firebase_auth_foundation` + `phase4_cut_supabase_auth`; `/oauth-callback` + `/complete-profile` flows |
| June 2026 | **NestJS gateway** becomes the primary data path (`api.cloud-engineer.dev`); **realtime inverted to polling-first** (Jun 14); custom domain **`devcon.plus` live**; transactional email redesign; raffle "Wheel of Names"; interest quiz; officer resources + co-organizers; reward claim PIN workflow |
| June 19–21, 2026 | White-box **security audit** + remediation in progress (`Dale/security-audit-fix`) |


---

## 4. What Comes Next (Phase 2)

These features are intentionally deferred post-May 15. They are not in scope for the current team.

- **Kotlin Multiplatform (KMP) migration** — Port the web app to a true native Android + iOS app while keeping a web target. The current web app's architecture (stores, API layer) maps cleanly to Kotlin equivalents.
- **Group Chat** — Async chapter-scoped message board so members within the same chapter can communicate.
- **Swipe Feed** — A TikTok-style (or Tinder) vertical content feed mixing upcoming events, news highlights, and job opportunities.
- **Push Notifications** — Native push for event reminders, point awards, and announcements.
- **Reward Fulfillment** — Physical reward shipping and digital voucher delivery workflows.
- **WebSocket Resilience** — Full resolution of Supabase realtime reconnect behavior on mobile Safari under aggressive background tab conditions.

---
---

# PART 2 — DEVELOPER HANDOVER

*This section is written for the next developer who takes over this codebase. It assumes basic familiarity with React, TypeScript, and Supabase — but not this specific project.*

---

## 5. Getting Started

### Prerequisites
- Node.js 20+
- npm 10+
- Supabase CLI (`npm install -g supabase`)

### Clone and install

Each app installs on its own (no root workspace).

```bash
git clone <repo-url>
cd devcon-plus
cd web && npm install        # frontend — React 19 pinned via `overrides` (no --legacy-peer-deps)
cd ../server && npm install  # backend gateway (NestJS)
```

### Environment variables

Create `web/.env.local` (frontend — see `web/.env.example`) and `server/.env` (gateway — see
`server/.env.example`). Get the actual values from the team lead or the DEVCON HQ engineering contact.

```env
# web/.env.local (frontend)
VITE_SUPABASE_URL=          # Supabase project URL
VITE_SUPABASE_ANON_KEY=     # Supabase anon (public) key
VITE_GOOGLE_CLIENT_ID=      # Google OAuth client ID
VITE_TURNSTILE_SITE_KEY=    # Cloudflare Turnstile site key
VITE_FIREBASE_API_KEY=      # Firebase web config (4 keys: API_KEY/AUTH_DOMAIN/PROJECT_ID/APP_ID)
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_APP_ENV=development
VITE_ALLOW_INDEXING=        # "true" only on production
VITE_API_URL=http://localhost:8000   # NestJS gateway base URL
```

The gateway's `server/.env` holds the secrets: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
`FIREBASE_SERVICE_ACCOUNT_JSON`, `QR_JWT_SECRET`, `EMAIL_VERIFICATION_SECRET`, Gmail SMTP creds, `CORS_ORIGIN`,
and optional Upstash Redis keys. **Never** put these in the frontend.

### Run locally

```bash
cd web && npm run dev        # frontend at http://localhost:5173
cd server && npm run dev     # gateway at http://localhost:8000 (separate terminal)
cd web && npm run typecheck  # must pass before commit (mirrors Vercel's tsc -b)
cd web && npm run build      # tsc -b && vite build
```

> **Important:** Never rely on the dev server for TypeScript correctness. Always run `npm run typecheck` before committing. Vercel runs `tsc -b && vite build` for `web/` — if TypeScript fails, the deploy aborts.

---

## 6. Architecture Overview

### Repository layout (two co-located apps — no root workspace/Turbo)

```
devcon-plus/
├── web/                 React + Vite frontend (@devcon-plus/web)
│   ├── src/             member UI, organizer UI, AND admin UI (three route trees)
│   │   ├── stores/      Zustand stores — fetch via lib/api.ts (apiFetch/publicFetch)
│   │   ├── lib/         api.ts, firebase.ts, authBridge.ts, supabase.ts (bridge-JWT only), ...
│   │   └── types/       types.ts + generated database.types.ts (alias @devcon-plus/supabase)
│   └── vercel.json      deploy config + security headers
├── server/              NestJS gateway (@devcon-plus/server) → EC2 + nginx
│   └── src/             auth, users, events, points, registrations, rewards, missions,
│                        volunteers, qr, upgrades, admin, news, jobs, chapters, interests, ...
├── supabase/
│   ├── functions/       Edge Functions (Deno runtime)
│   └── migrations/      SQL migrations (apply in order)
└── docs/                auth/* (Firebase + bridge JWT), migration-plans/*
```
> `apps/` and `packages/` may linger locally but are untracked leftovers from the old Turbo layout — ignore them.

### Tech stack

| Concern | Choice |
|---------|--------|
| Frontend framework | React 19 + Vite 7 |
| Router | React Router DOM v7 (flat `createBrowserRouter`) |
| Styling | Tailwind CSS v3 |
| Animation | framer-motion (`web/` dep) |
| State | Zustand v5 |
| Forms | React Hook Form v7 + Zod |
| Auth | **Firebase Auth** (Google OAuth + email/password) |
| Backend gateway | **NestJS 10** (`server/`) — primary data path via `/api/*`; on EC2 + nginx |
| Data store | Supabase (Postgres + RLS + Edge Functions); browser reaches PostgREST only via a bridge JWT (being retired) |
| Cache / rate limit | Upstash Redis (gateway-side) |
| Language | TypeScript (strict mode — no `any`) |
| Font | Proxima Nova (self-hosted woff2, 6 weights) |
| Icons | solar-icon-set (outline variant only) |
| Hosting | Vercel (frontend) + EC2/nginx (gateway) |

### Auth & data flow

Firebase signs the user in (Google popup or email/password) → the NestJS gateway verifies the Firebase ID
token (`email_verified` gated) and mints a short-lived **Supabase bridge JWT** → the frontend calls the
gateway via `apiFetch`/`publicFetch` and uses the bridge JWT only for the few remaining direct PostgREST
calls. "Phase 7" will retire direct `supabase-js` so the gateway is the sole data path. Realtime is
best-effort; correctness relies on `recover()` polling (see `.claude/rules/db-connection-resilience.md`).

### Three route trees, one codebase

The app has three distinct user experiences that share one React app:

- **MemberLayout** (`/home`, `/events/*`, `/jobs/*`, `/points/*`, `/rewards`, `/profile/*`) — standard member experience. Mobile-first, floating pill nav on mobile, sidebar on desktop.
- **OrganizerLayout** (`/organizer/*`) — chapter officer tools. Same responsive pattern, different nav. Does NOT apply program themes.
- **AdminLayout** (`/admin/*`) — HQ admin and super admin panel. Desktop-only sidebar.

Never mix components between these route trees. They share utility components (`<ComingSoonModal />`, `<Skeleton />`, `<StatusPill />`, etc.) but not layout components.

Each route tree is wrapped with `<RouteErrorBoundary />` — an error boundary that catches unhandled render errors and shows a branded fallback instead of a blank screen.

**Guest access:** `MemberLayout` allows unauthenticated users to browse paths listed in `GUEST_PATHS` (currently `/events`). All other member routes redirect to sign-in.

### Design system summary

- **Primary color** is a CSS custom property (`rgb(var(--color-primary))`) — always use Tailwind tokens `text-primary`, `bg-primary`, never hardcode hex.
- **5 program themes** (devcon, she, kids, campus, purple) — user-selectable, persisted via `useThemeStore` to localStorage.
- **Per-event theme overrides** — when `events.devcon_category` is set, event pages apply inline CSS vars scoped to that page only (see `lib/eventTheme.ts`).
- **MD3 type scale** — preferred for new components. 15 `text-md3-*` tokens in `tailwind.config.js`. Legacy scale (`text-sm`, `text-xs`, etc.) is still valid for existing components.
- **Tailwind slate scale** — only 50/100/200/300/400/500/700/900 exist. Do not use 600 or 800.

---

## 7. Infrastructure

### Supabase

- **Project:** Live production project (URL + anon key in `web/.env.local`; service-role key only in `server/.env`)
- **Role:** Postgres data store + RLS + Edge Functions. Auth is **Firebase**, not Supabase Auth. The browser reaches PostgREST/RPCs only via the gateway-minted **bridge JWT** (being retired).
- **DB types:** Generated from live DB — located at `web/src/types/database.types.ts`. After any schema change, regenerate: `supabase gen types typescript --project-id <ref> > web/src/types/database.types.ts`
- **Migrations:** Applied via `supabase db push` or the SQL editor. Migration files are in `supabase/migrations/`.
- **RLS:** Row-level security is enabled on all sensitive tables. Because of the bridge JWT, RLS/RPC grants are the real authz boundary for direct calls — see the June security audit (`SECURITY_AUDIT_*.md`, gitignored) and `.claude/CLAUDE.md` Section 5.

### NestJS gateway (`server/`)

- Self-hosted on **EC2 behind nginx** → `https://api.devcon.plus`. Global prefix `/api` (auth at `/auth/*`), port 8000.
- Verifies Firebase ID tokens (`AuthGuard`) + `email_verified`, enforces `@Roles()` hierarchy, identity-keyed rate limits, Upstash Redis profile cache. Uses the Supabase service-role key server-side.

### Edge Functions (Deno runtime)

All deployed to the live Supabase project:

| Function | Purpose |
|----------|---------|
| `generate-qr-token` | Creates a short-lived JWT QR token for a registration |
| `award-points-on-scan` | Validates QR scan, atomically checks in the member, awards points |
| `approve-at-door` | Officer approves or rejects a pending member at the venue |
| `check-rate-limit` | IP/user-keyed rate limit buckets for auth, QR, and upgrade flows |
| `generate-user-qr` / `generate-pending-qr` | User-identity (`u`) and pending door-approval (`p`) QR tokens |
| `send-email` | Sends transactional/branded HTML email via Resend (templates in `_shared/emailTemplates.ts`) |
| `delete-user` | Cascade-deletes a profile's data on account deletion |

> Most data now flows through the NestJS gateway (`/api/*`); QR generate/scan are also exposed at `/api/qr/*`.
> CORS allowlists are origin-exact (`https://devcon.plus`, `https://staging.devcon.plus`, the gateway origin,
> `localhost:5173`). Prune any stale entries and redeploy all functions after a change.

### Vercel (frontend)

- Build command: `tsc -b && vite build`, root directory `web`
- Environment variables set in Vercel project settings — must match `web/.env.example` keys
- Production deploy sets `VITE_ALLOW_INDEXING=true`; staging leaves it unset (robots.txt `Disallow: /`)

### Custom domain + email (LIVE)

Production is live at `https://devcon.plus`; `devconplusbeta-v1.vercel.app` and `plus-beta.devcon.ph`
301-redirect to it. Transactional email works via the NestJS email module (nodemailer/Gmail) plus the
`send-email` edge function, with a unified branded email shell (June 2026 redesign). Firebase OAuth is
configured for the production domain. Historical DNS/email setup steps:
[`.claude/docs/DOMAIN_AND_EMAIL_SETUP.md`](.claude/docs/DOMAIN_AND_EMAIL_SETUP.md).

---

## 8. Unfinished Work

*As of June 21, 2026. Sorted by priority.*

### L1 — Must complete before public launch

| Item | Why it matters | Notes |
|------|---------------|-------|
| **Security audit remediation** | The bridge JWT makes RLS/RPC grants the real authz boundary; the June audit found a privilege-escalation gap (C1) and BOLA RPCs (H1). | `profiles` UPDATE needs `WITH CHECK`; revoke/auth-guard `redeem_reward` + `manual_checkin`; chapter-scope `events` UPDATE (M2); restrict `rewards` writes to `hq_admin` (M3). **Verify against the live DB first.** See `SECURITY_AUDIT_*.md` (gitignored). |
| **Retire direct `supabase-js` (Phase 7)** | Collapses the audit's C1/H1/M2/M3 reachability by making the NestJS gateway the sole data path. | Migrate remaining reads/writes to `apiFetch`, then scope/retire the bridge JWT. |
| Re-enable OrganizerCodeGate routing | Organizer code gate is temporarily bypassed — new organizers can't self-onboard via code entry. | Route is commented out in `router.tsx`; investigate the post-sign-up flow before re-enabling. |
| Remove test accounts | Test accounts in the live DB could appear in officer/admin views. | Manual cleanup in Supabase Dashboard / Firebase Auth. |
| Remove Easter egg code | `<KonamiCodeWrapper />` and `<KonamiModal />` must be removed before public preview. | Currently restricted to `hq_admin/super_admin` but should be fully removed. |
| PROMOTED badge audit | 2nd job listing (Sui Foundation) and 2nd Tech news post must always show orange PROMOTED badge. | Verify `is_promoted = true` in live Supabase data. |
| Final QA (all flows end-to-end) | Catch regressions before the public sees the app. | Test member, organizer, and admin flows on a real mobile device (iPhone Safari + Android Chrome). Include guest browsing + external registration + wheel flows. |

> **Resolved since v1.3:** custom domain live (`devcon.plus`); Firebase OAuth on production; transactional email working (June email redesign). These are no longer L1 blockers.

### L2 — Complete if bandwidth allows

| Item | Scope | Notes |
|------|-------|-------|
| Announcements broadcast | `<SendAnnouncementSheet />` is built. Verify it creates `event_announcements` rows and members see them in notifications. | Needs end-to-end test. |
| Missions end-to-end verification | Missions flow + `submission_type` logic is built. Needs full end-to-end test: create mission → member completes → admin reviews submission. | `submission_type = 'proof_upload'` is the most complex path. |
| Boosted / Promoted Events | `is_promoted` flag exists on events. Surface promoted events with a visual indicator in the events list. | Design decision needed on badge style (reuse orange PROMOTED badge?). |
| Custom event fields | Modular form schema is built. Needs end-to-end test with organizer creating a field and member filling it on registration. | |
| Auto-apply chapter theme | When a member's chapter is set, auto-apply the matching program theme on login. Currently the user selects it manually. | |

### Known issues

- **Realtime is best-effort (by design)** — As of 2026-06-14 the app is **polling-first**: `recover()` refetches on `visibilitychange` / `online` / 60 s, and `subscribeToChanges` is a no-op for most stores (Supabase Free-tier caps Realtime at 200 connections). This was an intentional inversion, not a bug. See `.claude/rules/db-connection-resilience.md`.
- **Security audit open items** — The June 19–20 audit found RLS/RPC gaps on the direct-PostgREST (bridge-JWT) path; remediation is in progress on `Dale/security-audit-fix`. See §8 and `SECURITY_AUDIT_*.md` (gitignored).
- **OrganizerCodeGate disabled** — Post-sign-up routing skips the organizer code gate (route commented out in `router.tsx`). New organizers self-onboard via the in-app upgrade flow until it's re-enabled.

---

## 9. Critical Rules

These rules are non-negotiable. They exist because violating them has either caused bugs in the past or will break the product contract with DEVCON Philippines.

1. **Never generate Apple Sign-In code.** Auth is Google OAuth + email/password only.
2. **Never mix emoji and images in the same screen section.** Pick one and be consistent.
3. **Never leave placeholder text.** Use `<ComingSoonModal />` for incomplete features.
4. **Never create dead-end navigation.** Every route must render something.
5. **Always pre-fill registration forms** from the authenticated Supabase user's profile.
6. **Always use TypeScript strict mode.** No `any` types, no `@ts-ignore` without explanation.
7. **Member and Organizer route trees share one codebase but never share layout components.** `MemberLayout` and `OrganizerLayout` are separate.
8. **Jobs board is manually seeded in Supabase.** No external API integration.
9. **The 2nd job listing and 2nd news post always get an orange PROMOTED badge.** This is a design mandate.
10. **The app is mobile-first (390px viewport).** All UI must work on mobile. Desktop gets a sidebar layout.
11. **Primary color is always `text-primary` / `bg-primary`.** Never hardcode hex values for the primary color.
12. **All data goes through the NestJS gateway** via `apiFetch`/`publicFetch` (`web/src/lib/api.ts`). Don't add new direct `supabase.from(...)`/`supabase.rpc(...)` calls — direct `supabase-js` is legacy bridge-JWT, being retired. The `MOCK_*` exports in `web/src/types/mock/` are reference only — never import them into production components.
13. **The `spendable_points` field (not `total_points`) is the user's current redeemable balance.** `lifetime_points` is never decremented and is used for tier tracking.

---

## 10. Key File Map

Files a new developer will touch most often:

### Apps

| File | What it does |
|------|-------------|
| `web/src/router.tsx` | All routes defined here as a flat `createBrowserRouter`. This is the map of the entire frontend. |
| `web/src/lib/api.ts` | `apiFetch()` (auth — injects Firebase ID token, auto-refresh on 401) + `publicFetch()`. The primary data path. |
| `web/src/lib/firebase.ts` / `authBridge.ts` | Firebase web init (sign-in) + exchanging the ID token for the Supabase bridge JWT. |
| `web/src/components/MemberLayout.tsx` | Member shell: auth guard, bottom nav, sidebar, polling recovery (`recover()`). |
| `web/src/components/OrganizerLayout.tsx` | Organizer shell: same pattern, different nav and no theme application. |
| `web/src/components/AdminLayout.tsx` | Admin shell: desktop-only sidebar, hq_admin/super_admin guard. |
| `web/tailwind.config.js` | Design tokens: colors, MD3 type scale, shadows, font families. |
| `web/src/lib/animation.ts` | All framer-motion variants. Import from here — never redefine inline. |
| `web/src/lib/supabase.ts` | Supabase client (bridge-JWT path only). Injects the bridge JWT on direct PostgREST/Storage calls. |
| `web/src/lib/eventTheme.ts` | Per-event theme overrides. Returns inline CSS vars scoped to the event page. |
| `web/src/hooks/useFormDraft.ts` | Persists form state to localStorage/sessionStorage across page refreshes. |
| `server/src/` | NestJS gateway modules (auth, users, events, points, rewards, missions, qr, admin, ...). |

### Stores

All stores are in `web/src/stores/`. Each fetches through the gateway (`apiFetch`/`publicFetch`); `subscribeToChanges` is a no-op for most (polling-first):

| Store | Domain |
|-------|--------|
| `useAuthStore.ts` | User session, profile, sign in/out, role, organizer upgrade (Firebase + gateway) |
| `useEventsStore.ts` | Events list, registrations (best-effort realtime on registration only) |
| `useJobsStore.ts` | Jobs board |
| `usePointsStore.ts` | Point transactions and totals |
| `useRewardsStore.ts` | Rewards catalog + redemptions |
| `useMissionsStore.ts` | Missions: list, start, submit |
| `useChaptersStore.ts` | Chapters list (public) |
| `useNotificationsStore.ts` | In-app notifications (best-effort announcements channel) |
| `useThemeStore.ts` | Active program theme, persisted to localStorage |
| `useVolunteerStore.ts` | Member volunteer applications |
| `useOrgVolunteerStore.ts` | Organizer volunteer approval queue |

### Edge Functions

All in `supabase/functions/` (Deno). Current: `generate-qr-token`, `generate-user-qr`, `generate-pending-qr`, `award-points-on-scan`, `approve-at-door`, `check-rate-limit`, `send-email`, `delete-user`. Shared: `_shared/auth.ts`, `_shared/emailTemplates.ts`, `_shared/logger.ts`.

### Database types

`web/src/types/database.types.ts` — generated from the live DB. If you change the schema, regenerate this file immediately. All Supabase queries (gateway + bridge-JWT) are typed against this file.

---

## 11. Credentials & Access

You will need the following to work on this project. Ask the team lead or the DEVCON HQ engineering contact for the actual values.

| Credential | Where it's used | Who to ask |
|-----------|----------------|------------|
| Supabase URL + anon key | `web/.env.local` — bridge-JWT path | Team lead |
| Supabase service role key + JWT secret | `server/.env` — gateway (RLS bypass + bridge JWT) | Team lead |
| Firebase web config + service account | `web/.env.local` (web config) / `server/.env` (`FIREBASE_SERVICE_ACCOUNT_JSON`) | Team lead |
| Google OAuth client ID | `web/.env.local` — Google sign-in (Firebase) | Team lead |
| Vercel project access | Frontend deploy, env vars, domain config | Team lead |
| EC2 / backend host access | NestJS gateway deploy + `server/.env` | Team lead |
| Supabase dashboard access | DB editor, edge function logs | Team lead |
| Gmail SMTP / Resend access | Transactional email | DEVCON HQ IT officer |
| `devcon.ph` / `devcon.plus` DNS panel | Domain + email DNS records | DEVCON HQ IT officer |

> Never commit secrets to the repository. Secrets live in `web/.env.local` / `server/.env` (gitignored) and the Vercel + EC2 environment settings.

---

## 12. Reference Documents

| Document | Location | What it covers |
|----------|----------|---------------|
| Full architecture + DB schema | [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | Master technical reference — DB tables, routes, components, stores, design system |
| Project transition / handover | [`.claude/context/HANDOVER.md`](.claude/context/HANDOVER.md) | Full handover doc — scope, architecture, current state, turnover |
| Auth architecture | [`docs/auth/`](docs/auth/) | Firebase auth, the Supabase bridge JWT, flows, edge-function auth, troubleshooting |
| Domain + email setup | [`.claude/docs/DOMAIN_AND_EMAIL_SETUP.md`](.claude/docs/DOMAIN_AND_EMAIL_SETUP.md) | Step-by-step DNS, Vercel, Supabase, and OAuth configuration (historical) |
| DB connection resilience | [`.claude/rules/db-connection-resilience.md`](.claude/rules/db-connection-resilience.md) | Polling-first realtime rule — required reading before touching layout or store files |
| Vercel build safety | [`.claude/rules/vercel-build-safety.md`](.claude/rules/vercel-build-safety.md) | TypeScript flags that cause build failures and how to avoid them |

> **Note:** earlier versions linked a `.claude/DEVCON_PLUS.md` and a `docs/adr/` directory — neither exists in
> this repo. The feature checklist / team context lives in this PRD and `HANDOVER.md`.
