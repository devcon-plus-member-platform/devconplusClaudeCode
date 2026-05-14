# DEVCON+ — Product Requirements & Developer Handover
> Version: 1.3 | Last Updated: May 14, 2026 | Updated by: Clayton
> Live App: https://devconplusbeta-v1.vercel.app
> Repository: `devcon-plus/` (monorepo)

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

*As of May 14, 2026.*

| Area | Status | Notes |
|------|--------|-------|
| Member app (full flow) | Live | Sign up, events, QR ticket, points, rewards, jobs, profile |
| Organizer flow | Live | Event creation, registrant approval, QR scanner, announcements |
| Admin panel | Live | User management, org codes, chapter management, upgrade reviews, CSV export |
| Authentication | Live | Email/password + Google OAuth via Supabase |
| QR check-in system | Live | Atomic check-in, double-award prevention, door approval flow |
| Points & rewards | Live | Earn points on attendance, view history, browse rewards catalog |
| PWA (add to home screen) | Live | Icons, shortcuts, apple-touch-icon configured |
| External event registration | Live | Events can link to an external registration URL (or mark as TBA) |
| Guest / unauthenticated browsing | Live | Events list accessible without sign-in; event detail publicly viewable |
| Missions system | Live | Gamified missions with submission types (proof_upload / link / self_attest) |
| Route error recovery | Live | `<RouteErrorBoundary />` wraps all route trees |
| Custom domain (`plus-beta.devcon.ph`) | Pending | DNS records ready — awaiting DEVCON HQ DNS admin action |
| Transactional email (`no-reply-plus@devcon.ph`) | Pending | Resend configured — awaiting domain DNS verification |
| Google OAuth on production domain | Pending | Redirect URI needs updating in Google Cloud Console |
| Test data cleanup | In Progress | Test accounts and seeded Easter egg code need removal |
| Security audit (OWASP Top 10) | In Progress | 25 CVEs cleared; pen test pass still needed |
| Final QA (all flows end-to-end) | Not Started | Required before public preview |

---

## 3. Key Milestones

| Date | Milestone |
|------|-----------|
| March 29, 2026 | Development started (Week 1 — auth, security foundations) |
| April 6, 2026 | QR system live; PWA manifest deployed; transactional email edge function deployed |
| April 8, 2026 | Cloudflare Turnstile CAPTCHA added to auth forms |
| April 15, 2026 | MD3 type scale applied across all UI; domain + email setup guide written |
| **April 26, 2026** | **Claude Code subscription ends — last AI-assisted development day** |
| April 30, 2026 | Dev freeze — no new features after this date |
| May 1–12, 2026 | Post-freeze hardening: Turnstile on email resend, `fetchWithTimeout` network resilience, realtime recovery +5 s/+15 s follow-ups, safe return URL handling, creative 404 page, chapter sorting fix, Safe Space & Event Risk Consent in T&C |
| May 13, 2026 | External event registration shipped; missions `submission_type` migration; jobs `logo_url`; `<RouteErrorBoundary />`; region + event-type filters on EventsList; AdminCMS mission toggle |
| May 14, 2026 | Guest unauthenticated access to EventsList; event share; admin cover image upload; organizer chapter-scoped event filtering |


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

```bash
git clone <repo-url>
cd devcon-plus
npm install --legacy-peer-deps   # --legacy-peer-deps is required — React 19 peer conflict
```

### Environment variables

Create `apps/member/.env.local` with the following. Get the actual values from Kenshin or the DEVCON HQ engineering contact.

```env
VITE_SUPABASE_URL=          # Supabase project URL
VITE_SUPABASE_ANON_KEY=     # Supabase anon (public) key
VITE_GOOGLE_CLIENT_ID=      # Google OAuth client ID (from GCP Console)
VITE_APP_ENV=development
```

Create `supabase/.env`:
```env
SUPABASE_SERVICE_ROLE_KEY=  # Supabase service role key (keep secret)
```

### Run locally

```bash
npm run dev:member     # starts the member app at http://localhost:5173
npm run typecheck      # TypeScript check across all packages (must pass before commit)
npm run build          # production build — mirrors Vercel's exact build command
```

> **Important:** Never rely on the dev server for TypeScript correctness. Always run `npm run typecheck` before committing. Vercel runs `tsc -b && vite build` — if TypeScript fails, the deploy aborts.

---

## 6. Architecture Overview

### Repository layout (monorepo — npm workspaces + Turbo)

```
devcon-plus/
├── apps/
│   ├── member/          React + Vite web app
│   │                    Contains member UI, organizer UI, AND admin UI
│   │                    (three separate route trees in one codebase)
│   └── landing/         Static landing page (index.html only)
├── packages/
│   └── supabase/        Shared TypeScript DB types + reference mock data
├── supabase/
│   └── functions/       Supabase Edge Functions (Deno runtime)
├── package.json         Workspace root — framer-motion lives here
└── turbo.json
```

### Tech stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + Vite 7 |
| Router | React Router DOM v7 (flat `createBrowserRouter`) |
| Styling | Tailwind CSS v3 |
| Animation | framer-motion (workspace root dep) |
| State | Zustand v5 |
| Forms | React Hook Form v7 + Zod |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Language | TypeScript (strict mode — no `any`) |
| Font | Proxima Nova (self-hosted woff2, 6 weights) |
| Icons | solar-icon-set (outline variant only) |
| Hosting | Vercel |

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

- **Project:** Live production project (URL and anon key in `.env.local`)
- **Auth:** Email/password + Google OAuth. Custom `navigator.locks` lock (no timeout) + realtime throttle at 10 events/sec.
- **DB types:** Generated from live DB — located at `packages/supabase/src/database.types.ts`. After any schema change, regenerate: `supabase gen types typescript --project-id <ref> > packages/supabase/src/database.types.ts`
- **Migrations:** Applied via `supabase db push` or the SQL editor. Migration files are in `supabase/migrations/`.
- **RLS:** Row-level security is enabled on all sensitive tables. Policies are documented in `.claude/CLAUDE.md` Section 5.

### Edge Functions (Deno runtime)

All deployed to the live Supabase project:

| Function | Purpose |
|----------|---------|
| `generate-qr-token` | Creates a short-lived JWT QR token for a registration |
| `award-points-on-scan` | Validates QR scan, atomically checks in the member, awards points |
| `approve-at-door` | Officer approves or rejects a pending member at the venue |
| `check-rate-limit` | IP/user-keyed rate limit buckets for auth, QR, and upgrade flows |
| `generate-user-qr` | Creates a user identity QR token (kind `u`) for the `/qr` MyQR page |

> CORS allowlist in each function currently includes `localhost:5173`, `devconplusbeta-v1.vercel.app`. When `plus-beta.devcon.ph` is live, add it to the allowlist in `supabase/functions/_shared/cors.ts` and redeploy all functions.

### Vercel

- Project: `devconplusbeta-v1`
- Build command: `tsc -b && vite build` (runs from `apps/member/`)
- Environment variables are set in Vercel project settings — must match `.env.local` keys

### Custom domain + email (pending)

Full step-by-step setup is in [`.claude/docs/DOMAIN_AND_EMAIL_SETUP.md`](.claude/docs/DOMAIN_AND_EMAIL_SETUP.md). Summary of what's left:

- [ ] DNS admin at `devcon.ph` adds the Vercel CNAME record for `plus-beta`
- [ ] DNS admin adds Resend SPF, DKIM, DMARC records for email sending
- [ ] Google Cloud Console: add `https://plus-beta.devcon.ph/auth/v1/callback` to authorized redirect URIs
- [ ] Supabase: add `https://plus-beta.devcon.ph/**` to redirect URLs
- [ ] Edge Functions: add `https://plus-beta.devcon.ph` to CORS allowlist and redeploy

---

## 8. Unfinished Work

*As of May 14, 2026. Sorted by priority.*

### L1 — Must complete before public launch

| Item | Why it matters | Notes |
|------|---------------|-------|
| Custom domain (`plus-beta.devcon.ph`) | The public preview URL. Google OAuth will break without it. | Blocked on DNS admin at DEVCON HQ. Steps in `DOMAIN_AND_EMAIL_SETUP.md`. |
| Google OAuth on production domain | Members can't sign in with Google until the redirect URI is updated. | GCP Console → OAuth 2.0 Client ID → add new redirect URI. |
| Transactional email (`no-reply-plus@devcon.ph`) | Auth emails (confirm, reset) currently send from Supabase's generic domain. | Blocked on Resend domain DNS verification. Steps in `DOMAIN_AND_EMAIL_SETUP.md`. |
| Remove test accounts | Test accounts in the live DB could appear in officer/admin views. | Manual cleanup in Supabase Dashboard → Authentication → Users. |
| Remove Easter egg code | `<KonamiCodeWrapper />` and `<KonamiModal />` must be removed before public preview. | Currently restricted to `hq_admin/super_admin` (commit `c8d926d`) but should be fully removed. |
| OWASP Top 10 pen test pass | Security requirement before public launch. | 25 CVEs already cleared. Complete the checklist and log findings. |
| PROMOTED badge audit | 2nd job listing (Sui Foundation) and 2nd Tech news post must always show orange PROMOTED badge. | Verify `is_promoted = true` in live Supabase data. |
| Final QA (all flows end-to-end) | Catch regressions before the public sees the app. | Test member, organizer, and admin flows on a real mobile device (iPhone Safari + Android Chrome). Include guest browsing flow and external registration flow. |
| Re-enable OrganizerCodeGate routing | Organizer code gate is temporarily bypassed — new organizers bypass the code entry step. | Investigate the routing issue that caused the disable (commit `2529d3d`). |

### L2 — Complete if bandwidth allows

| Item | Scope | Notes |
|------|-------|-------|
| Announcements broadcast | `<SendAnnouncementSheet />` is built. Verify it creates `event_announcements` rows and members see them in notifications. | Needs end-to-end test. |
| Missions end-to-end verification | Missions flow + `submission_type` logic is built. Needs full end-to-end test: create mission → member completes → admin reviews submission. | `submission_type = 'proof_upload'` is the most complex path. |
| Boosted / Promoted Events | `is_promoted` flag exists on events. Surface promoted events with a visual indicator in the events list. | Design decision needed on badge style (reuse orange PROMOTED badge?). |
| Custom event fields | Modular form schema is built. Needs end-to-end test with organizer creating a field and member filling it on registration. | |
| Auto-apply chapter theme | When a member's chapter is set, auto-apply the matching program theme on login. Currently the user selects it manually. | |

### Known issues

- **Supabase WebSocket resilience on mobile Safari** — The two-layer recovery pattern (`visibilitychange` + `online` + 90-second poll + +5 s/+15 s follow-ups) handles most cases, but aggressive background tab killing on mobile Safari can still result in stale data. Full fix is deferred to Phase 2. See `.claude/rules/db-connection-resilience.md` for the spec.
- **Email SMTP not yet end-to-end tested** — The edge function and templates are deployed (Apr 6) but end-to-end delivery hasn't been verified because the domain isn't live yet. Test immediately after the domain is set up.
- **OrganizerCodeGate disabled** — Post-sign-up routing skips the organizer code gate (commit `2529d3d`). New organizers cannot self-onboard via code entry until this is re-enabled.

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
12. **All data comes from the real Supabase client.** The `MOCK_*` exports in `packages/supabase/` are reference only — never import them into production components.
13. **The `spendable_points` field (not `total_points`) is the user's current redeemable balance.** `lifetime_points` is never decremented and is used for tier tracking.

---

## 10. Key File Map

Files a new developer will touch most often:

### Apps

| File | What it does |
|------|-------------|
| `apps/member/src/router.tsx` | All routes defined here as a flat `createBrowserRouter`. This is the map of the entire app. |
| `apps/member/src/components/MemberLayout.tsx` | Member shell: auth guard, bottom nav, sidebar, realtime recovery pattern. |
| `apps/member/src/components/OrganizerLayout.tsx` | Organizer shell: same pattern, different nav and no theme application. |
| `apps/member/src/components/AdminLayout.tsx` | Admin shell: desktop-only sidebar, hq_admin/super_admin guard. |
| `apps/member/tailwind.config.js` | Design tokens: colors, MD3 type scale, shadows, font families. |
| `apps/member/src/lib/animation.ts` | All framer-motion variants. Import from here — never redefine inline. |
| `apps/member/src/lib/supabase.ts` | Supabase client instance. Custom `navigator.locks` auth + realtime throttle. |
| `apps/member/src/lib/eventTheme.ts` | Per-event theme overrides. Returns inline CSS vars scoped to the event page. |
| `apps/member/src/hooks/useFormDraft.ts` | Persists form state to localStorage/sessionStorage across page refreshes. |

### Stores

All stores are in `apps/member/src/stores/`. Each store owns one domain:

| Store | Domain |
|-------|--------|
| `useAuthStore.ts` | User session, profile, sign in/out, role, organizer upgrade |
| `useEventsStore.ts` | Events list, registrations, realtime subscriptions |
| `useJobsStore.ts` | Jobs board |
| `usePointsStore.ts` | Point transactions and totals |
| `useRewardsStore.ts` | Rewards catalog, realtime subscriptions |
| `useNotificationsStore.ts` | In-app notifications, realtime subscriptions |
| `useThemeStore.ts` | Active program theme, persisted to localStorage |
| `useVolunteerStore.ts` | Member volunteer applications |
| `useOrgVolunteerStore.ts` | Organizer volunteer approval queue |

### Edge Functions

All in `supabase/functions/`. Each function is a self-contained Deno module. Shared utilities (CORS, logger) are in `supabase/functions/_shared/`.

### Database types

`packages/supabase/src/database.types.ts` — generated from the live DB. If you change the schema, regenerate this file immediately. All Supabase queries in stores are typed against this file.

---

## 11. Credentials & Access

You will need the following to work on this project. Ask Kenshin (Dev A) or the DEVCON HQ engineering contact for the actual values.

| Credential | Where it's used | Who to ask |
|-----------|----------------|------------|
| Supabase URL + anon key | `.env.local` — app connects to DB | Kenshin |
| Supabase service role key | `supabase/.env` — edge function deploys | Kenshin |
| Google OAuth client ID | `.env.local` — Google sign-in | Kenshin |
| Vercel project access | Deployment, env vars, domain config | Kenshin |
| Supabase dashboard access | DB editor, auth users, edge function logs | Kenshin |
| GCP Console access | OAuth 2.0 client configuration | Kenshin |
| Resend account access | Email domain verification, API keys, send logs | DEVCON HQ IT officer |
| `devcon.ph` DNS panel access | Custom domain + email DNS records | DEVCON HQ IT officer |

> Never commit secrets to the repository. All secrets live in `.env.local` (gitignored) and Vercel environment settings.

---

## 12. Reference Documents

| Document | Location | What it covers |
|----------|----------|---------------|
| Full architecture + DB schema | [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | Master technical reference — DB tables, routes, components, stores, design system |
| Sprint checklist + team context | [`.claude/DEVCON_PLUS.md`](.claude/DEVCON_PLUS.md) | Feature checklist (L1/L2/L3), security guidelines, team roles, conventions |
| Domain + email setup | [`.claude/docs/DOMAIN_AND_EMAIL_SETUP.md`](.claude/docs/DOMAIN_AND_EMAIL_SETUP.md) | Step-by-step DNS, Vercel, Supabase, and Google OAuth configuration |
| DB connection resilience | [`.claude/rules/db-connection-resilience.md`](.claude/rules/db-connection-resilience.md) | Realtime recovery pattern — required reading before touching layout or store files |
| Vercel build safety | [`.claude/rules/vercel-build-safety.md`](.claude/rules/vercel-build-safety.md) | TypeScript flags that cause build failures and how to avoid them |
| Architectural Decision Records | [`docs/adr/`](docs/adr/README.md) | Why the codebase is structured the way it is — retroactive + forward-looking decisions |
