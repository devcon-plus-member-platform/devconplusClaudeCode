# DEVCON+ — Comprehensive Project Transition Documentation
> Document Type: Developer & Stakeholder Handover  
> Version: 1.1 (June 2026 architecture sync)  
> Last Updated: June 21, 2026  
> Prepared by: Outgoing Development Team (DEVCON Jumpstart Internship, Cohort 3); updated by the continuing team  
> Live App: https://devcon.plus  (beta + `plus-beta.devcon.ph` 301-redirect here)  
> Backend API: https://api.devcon.plus  (NestJS gateway — self-hosted EC2 + nginx)  
> Repository: https://github.com/rocketwolf98/devconplusClaudeCode  

> **⚠️ Read first — what changed since v1.0 (May 11):** DEVCON+ is no longer a pure-Supabase, no-backend app.
> Authentication migrated to **Firebase Auth** (Google + email/password; Supabase Auth was cut), a **NestJS
> gateway** (`server/`, on EC2) is now the primary data path (the frontend calls it via `apiFetch`/`publicFetch`),
> and Realtime is **best-effort / polling-first** (no `resubscribe()`). The custom domain `devcon.plus` is
> **live** and transactional email works. Direct `supabase-js` survives only via a short-lived **bridge JWT**
> and is being retired ("Phase 7"). Sections below that still say `apps/member/`, `--legacy-peer-deps`,
> "two-layer recovery", or "Supabase Auth" reflect the v1.0 state — the corrected facts are flagged inline.
> The repo layout is now `web/` + `server/` + `supabase/` (any `apps/`/`packages/` dirs are untracked leftovers).

---

## Table of Contents

1. [Project Overview & Scope](#1-project-overview--scope)
2. [Product Requirements Document (PRD)](#2-product-requirements-document-prd)
3. [Technical Architecture](#3-technical-architecture)
4. [Current State & Limitations](#4-current-state--limitations)
5. [Developer & Operations Documentation](#5-developer--operations-documentation)
6. [Turnover Execution](#6-turnover-execution)
7. [Handover Dos and Don'ts](#7-handover-dos-and-donts)
8. [Annex](#8-annex)

---

---

# 1. Project Overview & Scope

## 1.1 Goals

**DEVCON+** is the official unified platform for DEVCON Philippines — the country's largest volunteer tech community, comprising 11 nationwide chapters, 60,000+ registered members, and 14,000+ annual event attendees.

**Tagline:** Sync. Support. Succeed.

The platform solves a core operational gap: DEVCON runs 100+ events per year across 11 regional chapters with no centralized system for registration, attendance tracking, or member engagement. DEVCON+ replaces manual spreadsheets, form links, and disconnected tooling with a single mobile-first web application.

**Primary Goals:**
- **Event management** — Mandatory registration and QR-based check-in for all chapter events
- **Member engagement** — Gamified points system (Points+) to reward attendance, volunteering, and contributions
- **Career enablement** — Curated tech job opportunities for Filipino developers
- **Officer tooling** — Chapter officer management layer for approvals, scanning, and event administration

## 1.2 Target Audience

| User Type | Description |
|-----------|-------------|
| **Members** | General DEVCON Philippines members across all 11 chapters. Mobile-first, primarily access on smartphones. |
| **Chapter Officers** | Volunteer leaders who organize and manage chapter events. Use the Organizer flow on mobile and desktop. |
| **HQ Admins** | National-level DEVCON administrators. Manage all chapters, rewards, and upgrade requests via Admin panel. |
| **Super Admins** | Full platform access. Manage roles, platform config, and on-site kiosk operations. |

## 1.3 Key Deliverables

The following are fully delivered and live as of April 15, 2026:

| Deliverable | Status |
|-------------|--------|
| Member app (registration, QR ticket, points, rewards, jobs, profile) | **Live** |
| Organizer flow (event CRUD, registrant approval, QR scanner, announcements) | **Live** |
| Admin panel (user management, org codes, chapters, upgrade review, kiosk) | **Live** |
| Authentication (email/password + Google OAuth via Supabase) | **Live** |
| QR check-in system with atomic double-award prevention | **Live** |
| Points & XP Tier system (earn, history, milestones) | **Live** |
| Gamified Missions system (scaffolded) | **Live** |
| PWA manifest (add to home screen, shortcuts) | **Live** |
| Custom event registration fields | **Live** |
| Cloudflare Turnstile CAPTCHA on auth forms | **Live** |
| Vercel deployment (frontend) | **Live** |
| **Firebase Auth migration** (Google + email/password; Supabase Auth cut) | **Live** (June 2026) |
| **NestJS gateway** (`server/`, EC2 + nginx) — primary data path | **Live** (June 2026) |
| Raffle "Wheel of Names", interest quiz, officer resources + co-organizers, reward claim PIN workflow | **Live** (June 2026) |
| Custom domain `https://devcon.plus` | **Live** — beta + `plus-beta.devcon.ph` 301-redirect here |
| Transactional email (NestJS email + `send-email`; June brand redesign) | **Live** |
| Google OAuth on production domain (Firebase) | **Live** |

## 1.4 Out of Scope for MVP

The following features are intentionally deferred. Use `<ComingSoonModal />` if a user reaches any of these entry points:

- Apple Sign-In (not supported — Google OAuth + email/password only)
- Push notifications
- Reward shipping / digital voucher delivery
- Partner analytics dashboard
- External Jobs API integration
- DEVCON TV / video content
- Developer Spotlight CMS
- Multi-language support
- Group Chat
- Swipe Feed (TikTok-style content feed)
- Full Supabase WebSocket resilience on mobile Safari (partial mitigation in place — full fix is Phase 2)

## 1.5 Milestones

| Date | Milestone |
|------|-----------|
| March 29, 2026 | Development started — auth, security foundations |
| April 6, 2026 | QR system live; PWA manifest deployed; transactional email edge function deployed |
| April 8, 2026 | Cloudflare Turnstile CAPTCHA added to auth forms |
| April 15, 2026 | MD3 type scale applied across all UI; domain + email setup guide written |
| **April 26, 2026** | **Claude Code AI subscription ends — last AI-assisted development day** |
| April 30, 2026 | Development freeze milestone — core MVP feature complete |
| May 2026 | Post-graduation: legal pages, GTM, resilience hardening, export improvements |
| May 15, 2026 | Public preview target (Cohort 3 Graduation showcase) |

---

---

# 2. Product Requirements Document (PRD)

## 2.1 User Stories

### Member
- As a member, I can register for any chapter event and receive a QR ticket for venue check-in.
- As a member, I can see my DEVCON Points balance and transaction history, grouped by date.
- As a member, I can browse the rewards catalog and understand the points cost of each reward.
- As a member, I can browse open tech jobs and view job details.
- As a member, I can apply to volunteer for events and track my application status.
- As a member, I can customize my profile, including selecting a program theme (DEVCON+, She is DEVCON, DEVCON Kids, Campus, DEVCON Purple).
- As a member, I can request an organizer upgrade by submitting an organizer code, subject to admin approval.
- As a member, I can use the app as a PWA (add to home screen) for a native-like experience.

### Chapter Officer
- As an officer, I can create, edit, and manage events for my chapter.
- As an officer, I can approve or reject event registrations.
- As an officer, I can scan member QR codes at the venue to check in attendees and automatically award points.
- As an officer, I can approve or reject volunteer applications for my events.
- As an officer, I can broadcast announcements to all registrants of an event.
- As an officer, I can view a post-event summary with attendance and points data.

### HQ Admin
- As an HQ admin, I can manage all chapters, users, and organizer upgrade requests.
- As an HQ admin, I can generate and manage organizer codes (chapter-scoped and HQ-scoped).
- As an HQ admin, I can manage the rewards catalog.
- As an HQ admin, I can view all events across all chapters.

## 2.2 User Flow & UX

**UX Benchmark:** The nmblr+ app (pattern-match layout, card style, navigation feel, and points display format exactly).

**UX Reference Prototype (Lovable):** https://devconplusrndprototype.lovable.app/  
**Figma Prototype:** https://www.figma.com/design/sYDNlHmsHK5dZRHvNabfcn/DEVCON--v0.1-Concept-Prototype---16-years-anniversary?node-id=0-1&t=BSnfiQ0ygnfgn2Jh-1

### Onboarding Flow (4 swipeable slides)
```
/ (SplashScreen) → /onboarding → /sign-up (new) OR /sign-in (returning)
                                      ↓
                         /organizer-code-gate
                         YES code → /organizer (OrganizerLayout)
                         NO code  → /home (MemberLayout)
```

### Event Registration Lifecycle
```
/events → /events/:id (detail) → /events/:id/register
  → pre-filled form (name, email, school/org from profile)
  → T&C + privacy consent checkbox

IF requires_approval = false → instant QR Ticket → /events/:id/ticket
IF requires_approval = true  → /events/:id/pending (Realtime subscription)
                             → Officer approves in /organizer/events/:id/registrants
                             → Member notified → /events/:id/ticket
```

### QR Check-In at Venue
```
Member: /events/:id/ticket → QR displayed (short-lived JWT via generate-qr-token)
Officer: /organizer/scan → camera → scans QR → award-points-on-scan
  → validates token (kind 'r' / 'u' / 'p')
  → atomic checked_in: false → true (prevents double-award)
  → inserts point_transaction row
  → updates profiles.spendable_points + lifetime_points
  → officer sees confirmation: "✓ Member Name — N pts awarded"
```

### Dashboard Layout (strict order — do not reorder)
1. Sticky greeting bar (`bg-primary`, "Hi, {firstName}!") + DEVCON+ logo
2. XP Card (white card, gold star, points total, progress bar, CTA)
3. Quick Actions: Find Jobs | Volunteer (ComingSoon) | Redeem
4. Rotating banner (4s crossfade: #SheIsDEVCON | Kids Hour of AI | 16 Years)
5. Events For You (max 3 cards)
6. Hot Jobs — horizontal scroll carousel (max 4; 2nd listing = PROMOTED badge)
7. Updates — DEVCON / Tech tabs (2nd Tech post = PROMOTED badge)
8. XP History preview (last 4 transactions)

## 2.3 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Email/password and Google OAuth sign-up and sign-in | Must Have |
| FR-02 | Supabase RLS enforces data isolation per user role | Must Have |
| FR-03 | Event registration with optional officer approval gate | Must Have |
| FR-04 | QR ticket generation (short-lived JWT, rate-limited) | Must Have |
| FR-05 | QR scan → atomic check-in → points award (no double-award) | Must Have |
| FR-06 | Points transaction log with grouped date display | Must Have |
| FR-07 | XP Tier milestones based on `lifetime_points` (not decremented day-to-day; zeroed by the annual June-24 reset) | Must Have |
| FR-08 | Rewards catalog (all items `is_coming_soon = true` for MVP) | Must Have |
| FR-09 | Jobs board (manually seeded — no external API) | Must Have |
| FR-10 | Organizer upgrade request flow (rate-limited, admin review) | Must Have |
| FR-11 | Registration status updates (5 s poll + best-effort realtime — see Reliability) | Must Have |
| FR-12 | Volunteer application + officer approval queue | Should Have |
| FR-13 | Event announcements via SendAnnouncementSheet | Should Have |
| FR-14 | Custom event registration fields (modular schema) | Should Have |
| FR-15 | Missions system (basic gamification) | Should Have |
| FR-16 | In-app notifications (poll via gateway + best-effort announcements channel) | Should Have |
| FR-17 | Form draft persistence (localStorage/sessionStorage) | Should Have |
| FR-18 | PWA manifest (add to home screen, shortcuts) | Should Have |

## 2.4 Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Security** | OWASP Top 10 compliance. CSP headers enforced. Cloudflare Turnstile CAPTCHA on all auth forms. Rate limiting on all sensitive endpoints via `check-rate-limit` edge function. |
| **TypeScript** | Strict mode (`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`, `noUnusedParameters`). No `any` types. No `@ts-ignore` without explanation. |
| **Performance** | Vite production build. DB performance indexes applied (`20260324_performance_indexes.sql`). Lazy-loaded routes for QR scanner and all Admin pages. Realtime throttled at 10 events/sec. |
| **Accessibility** | Mobile-first, 390px primary viewport. Desktop responsive (md+ breakpoint). All tappable targets meet minimum size requirements. |
| **Reliability** | **Polling-first recovery** (as of 2026-06-14): `recover()` refetches over HTTP on `visibilitychange` + `window.online` + a 60-second interval + auth-change, with +5 s/+15 s follow-ups. Realtime is best-effort only (no `resubscribe()`). Atomic check-in prevents data corruption under concurrent scans. |
| **Deployment** | Vercel CI/CD: `tsc -b && vite build`. Any TypeScript error is a deployment failure. All env vars must be set in Vercel project settings. |

## 2.5 Key Performance Indicators (KPIs)

| KPI | Target |
|-----|--------|
| Successful event registrations | Measurable via `event_registrations` table |
| QR check-in rate (checked_in = true vs. registered) | Measurable per event |
| Member sign-ups | Measurable via `profiles` table |
| Points awarded per event | Measurable via `point_transactions` |
| Organizer upgrade requests submitted vs. approved | Measurable via `organizer_upgrade_requests` |
| App availability | Monitor via Vercel dashboard |

---

---

# 3. Technical Architecture

## 3.1 Frontend

**Framework:** React 19 + Vite 7 (in `web/`)  
**Language:** TypeScript (strict mode)  
**Router:** React Router DOM v7 (flat `createBrowserRouter` in `web/src/router.tsx`)  
**Styling:** Tailwind CSS v3 with custom design tokens  
**Animation:** framer-motion (`web/` dependency)  
**State:** Zustand v5  
**Forms:** React Hook Form v7 + Zod  
**Auth:** Firebase Auth (Google popup + email/password)  
**Data access:** `apiFetch`/`publicFetch` (`web/src/lib/api.ts`) → NestJS gateway. Direct `supabase-js` only on legacy bridge-JWT paths  
**Font:** Proxima Nova (self-hosted woff2, 6 weights, loaded in `index.css`)  
**Icons:** `solar-icon-set` outline variant only — no emoji in JSX  
**QR Display:** `qrcode.react`  
**QR Scanning:** `@zxing/browser` + `@zxing/library` (lazy-loaded)  

> **This is a web app, not React Native.** There is no Expo, no NativeWind, no RN StyleSheet. All styling is Tailwind CSS.

### Three Route Trees, One Frontend Codebase

The frontend (`web/`) contains three distinct user experiences sharing one React application, backed by the NestJS gateway (`server/`):

| Layout | Route Prefix | Guard | Navigation |
|--------|-------------|-------|------------|
| `MemberLayout` | `/home`, `/events/*`, `/jobs/*`, `/points/*`, `/rewards`, `/profile/*` | Auth guard | Floating pill nav (mobile), sidebar with `bg-primary` (desktop) |
| `OrganizerLayout` | `/organizer/*` | Organizer role guard | Floating pill nav (mobile), sidebar with `bg-blue` (desktop). Does NOT apply program themes. |
| `AdminLayout` | `/admin/*` | `hq_admin` / `super_admin` guard | Desktop-only sidebar. All routes lazy-loaded. |

**Rule:** Never mix layout components between route trees. Shared utility components (`<ComingSoonModal />`, `<Skeleton />`, `<StatusPill />`, etc.) are safe to share.

### Design System Summary

- **Primary color** is a CSS custom property (`rgb(var(--color-primary))`). Always use `text-primary`, `bg-primary` — never hardcode hex for the primary color.
- **5 program themes** (devcon, she, kids, campus, purple) — user-selectable, persisted via `useThemeStore` to localStorage key `devcon-theme`.
- **Per-event theme overrides** — `events.devcon_category` triggers `getEventThemeStyle()` from `lib/eventTheme.ts`, returning inline CSS vars scoped to the event page only. Does not mutate global state.
- **MD3 type scale** — 15 `text-md3-*` tokens in `tailwind.config.js`. Preferred for new components. Legacy scale (`text-sm`, `text-xs`, etc.) remains valid for existing components.
- **Tailwind slate** — only steps 50/100/200/300/400/500/700/900 exist. Do not use 600 or 800.

### Animation System

All framer-motion variants are exported from `web/src/lib/animation.ts`. Never redefine variants inline.

| Variant | Use Case |
|---------|----------|
| `fadeUp` | Page entrances, card list entry |
| `fade` | Page-level opacity transitions |
| `slideUp` | Bottom sheets, modals |
| `backdrop` | Backdrop fade |
| `staggerContainer` + `cardItem` | List sections (staggered entry) |
| `NAV_SPRING` | Nav tab indicator spring |

**Critical:** Stagger container `animate` key is `"visible"` — never `"show"`. Spring values: cards `scale: 0.97, damping: 25`; buttons `scale: 0.95, damping: 25`; nav items `scale: 0.88, damping: 20`.

## 3.2 Backend

**Auth provider:** **Firebase Auth** (Google OAuth via popup + email/password). Supabase Auth was cut (`20260531_phase4_cut_supabase_auth.sql`).  
**Primary backend:** **NestJS gateway** (`server/`) on EC2 behind nginx → `https://api.devcon.plus`. Global prefix `/api` (auth at `/auth/*`), port 8000.  
**Gateway authz:** `AuthGuard` verifies the Firebase ID token + `email_verified`, resolves the profile by `auth_uid` (Upstash Redis cache); `RolesGuard` + `@Roles()` enforce `member < chapter_officer < hq_admin < super_admin`; identity-keyed rate limits + global `ThrottlerGuard` (300/min/IP).  
**Supabase role:** Postgres + RLS + Edge Functions. The gateway uses the service-role key (bypasses RLS) and mints a short-lived **bridge JWT** (`supabase-jwt.service.ts`) so the browser can still hit PostgREST directly (legacy — "Phase 7" retires this).  
**Edge Function runtime:** Deno  

### Edge Functions

Deployed to the live Supabase project (QR generate/scan are also exposed at `/api/qr/*` on the gateway):

| Function | Purpose | Rate Limit |
|----------|---------|------------|
| `generate-qr-token` | Creates short-lived JWT QR token for a registration (kind `r`) | 10 req/user/60s (fail closed) |
| `generate-user-qr` / `generate-pending-qr` | User-identity (`u`) / pending door-approval (`p`) QR tokens | — |
| `award-points-on-scan` | Validates QR scan, atomically checks in member, awards points | 60 scans/organizer/60s |
| `approve-at-door` | Officer approves or rejects a pending member at the venue | — |
| `check-rate-limit` | IP/user-keyed rate limit buckets for all sensitive flows | — |
| `send-email` | Transactional/branded HTML email via Resend (templates in `_shared/emailTemplates.ts`) | 30/min |
| `delete-user` | Cascade-deletes a profile's data on account deletion | — |

**QR Token kinds (discriminated by `k` claim):**
- `k='r'` — registration token (`sub` = registration_id): standard check-in
- `k='u'` — user identity token (`sub` = user_id): finds most imminent approved event in chapter
- `k='p'` — pending door-approval token (`sub` = registration_id): returns pending state for Approve/Reject UI

**CORS allowlists** are origin-exact: production `https://devcon.plus`, staging `https://staging.devcon.plus`, the
gateway origin, and `http://localhost:5173`. The gateway's own `CORS_ORIGIN` is an env var. Prune any stale
entries and redeploy all functions after a change.

**Shared utilities** in `supabase/functions/_shared/`:
- `auth.ts` — JWT verification helpers. `emailTemplates.ts` — branded HTML email shells.
- `logger.ts` — structured JSON logger. Format: `{ level, event, ts, ...data }` → stdout → Supabase Dashboard Logs.

### Rate Limit Reference

| Bucket | Key Type | Window | Limit |
|--------|----------|--------|-------|
| `login` | IP | 300s | 5 attempts |
| `signup` | IP | 3600s | 1 attempt |
| `username_check` | IP | 60s | 10 checks |
| `org_upgrade` | User (JWT) | 90000s (25h) | 1 request |
| `qr_generate` | User | 60s | 10 requests |
| `qr_scan` | Organizer | 60s | 60 scans |
| `password_reset` | IP | — | Configured |

## 3.3 Database

**Engine:** PostgreSQL (managed by Supabase)  
**Schema:** Row Level Security enabled on all sensitive tables (plus missions, interests, officer-resources, rewards-engine tables added since v1.0)  
**Types:** Generated from live DB → `web/src/types/database.types.ts`  
**Migrations:** `supabase/migrations/` — applied via `supabase db push` or SQL editor  
**Note:** `profiles` gained `auth_uid` (Firebase link) and its `id` FK to `auth.users` was dropped (`20260615`).  

### Table Overview

| Table | Purpose |
|-------|---------|
| `chapters` | 11 DEVCON chapters across Luzon, Visayas, Mindanao |
| `profiles` | User profiles (extends `auth.users`). Key fields: `spendable_points`, `lifetime_points`, `role`, `chapter_id`, `referral_code` |
| `organizer_codes` | Codes used to assign organizer roles at sign-up or via upgrade request |
| `events` | All chapter events. `devcon_category` drives per-event theme overrides |
| `event_registrations` | Member registrations. `checked_in` is updated atomically to prevent double-award |
| `event_announcements` | Organizer broadcasts to event registrants |
| `point_transactions` | Full ledger of all points earned and redeemed |
| `rewards` | Rewards catalog. All items `is_coming_soon = true` for MVP |
| `reward_redemptions` | Record of reward redemption requests |
| `jobs` | Manually seeded tech jobs (8 entries for MVP) |
| `news_posts` | DEVCON and Tech Community news content |
| `programs` | Program definitions (DEVCON, She, Kids, Campus) |
| `xp_tiers` | XP milestone tier definitions (Bronze, Silver, Gold, etc.) |
| `volunteer_applications` | Member volunteer applications + officer approval queue |
| `referrals` | Referral tracking |
| `organizer_upgrade_requests` | In-app organizer upgrade requests for admin review |

**Critical field note:** The points field on `profiles` is `spendable_points` (decremented on redemptions) and `lifetime_points` (not decremented by normal activity — used for tier tracking). The legacy name `total_points` does not exist in the live DB. **Both** balances are zeroed once a year by the annual June-24 reset (`reset_points()`, migration `20260708_reset_points_annual.sql`; pg_cron `'0 16 23 6 *'`) — see CLAUDE.md §4.

### Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| `member` | Register for events, earn/redeem points, browse jobs, view own QR ticket, request organizer upgrade |
| `chapter_officer` | All member + create/edit events, approve/reject registrations, scan QR at door |
| `hq_admin` | All officer + manage rewards, all chapters, review upgrade requests, Admin panel |
| `super_admin` | Full system access, role assignment, platform config, kiosk access |

## 3.4 Infrastructure

### Vercel (frontend)
- **Build command:** `tsc -b && vite build`
- **Root directory:** `web`
- **Environment variables:** Set in Vercel project Settings → Environment Variables (must match `web/.env.example` keys). Production sets `VITE_ALLOW_INDEXING=true`; staging leaves it unset (robots.txt `Disallow: /`).
- **CI/CD:** Every push to `master` triggers a production deploy. TypeScript errors abort the deploy.

### EC2 + nginx (backend gateway)
- The NestJS gateway (`server/`) is **self-hosted on EC2 behind nginx** → `https://api.devcon.plus`.
- Deploy/restart the Node process there; set `server/.env` in that environment. nginx terminates TLS and sets edge security headers (the API has no `helmet`).

### Cloudflare (DNS)
- DNS provider for `devcon.ph` / `devcon.plus`. Production is live at `https://devcon.plus`.
- Vercel CNAME and email DKIM records must be proxy **OFF** (DNS only, grey cloud) for SSL/DKIM to work.

### Transactional Email
- Sent via the NestJS email module (nodemailer/Gmail SMTP) + the `send-email` edge function (Resend).
- Unified branded DEVCON+ email shell (June 2026 redesign). Status: **Live**.

## 3.5 Third-Party APIs & Services

| Service | Purpose | Status |
|---------|---------|--------|
| Firebase Auth | Authentication (Google + email/password) | Live |
| Supabase | Database (Postgres + RLS), Edge Functions | Live |
| NestJS gateway (EC2 + nginx) | Primary backend / data path (`api.devcon.plus`) | Live |
| Upstash Redis | Gateway profile cache + rate-limit buckets | Live |
| Vercel | Frontend hosting, CI/CD, custom domain (`devcon.plus`) | Live |
| Google OAuth (GCP) | Social sign-in (via Firebase) on `devcon.plus` | Live |
| Cloudflare Turnstile | Bot protection on auth forms | Live |
| Resend / Gmail SMTP | Transactional email | Live |
| Cloudflare DNS | Domain management for `devcon.ph` / `devcon.plus` | Managed by DEVCON HQ IT |

---

---

# 4. Current State & Limitations

## 4.1 Handover Summary

As of May 11, 2026, the DEVCON+ MVP is **functionally complete and deployed to production** at https://devconplusbeta-v1.vercel.app. All core user flows (member registration, QR check-in, points, organizer tools, admin panel) are working end-to-end on the live Supabase project.

**MVP Completion: ~95%**

Post-graduation (May) work has focused on resilience, legal compliance, and analytics. The remaining items are infrastructure configuration blocked on external access (DNS, GCP Console) and final QA/data cleanup.

### May 2026 Changes (post-graduation)

| Change | Notes |
|--------|-------|
| Terms & Conditions + Privacy Policy pages | Public routes `/terms-and-conditions` and `/privacy-policy`. Linked via `<LegalModal />` from SignUp and EventRegister. |
| Google Tag Manager | GTM-N6PD5PJQ integrated in `index.html` (head + noscript). |
| Turnstile CAPTCHA on EmailSent | Captcha now required on the email resend flow in addition to sign-up/sign-in. |
| `fetchWithTimeout` in `supabase.ts` | Custom `fetch` wrapper with retry logic, `'reload'` cache strategy, and AbortController support. |
| Realtime recovery: 90-second polling | Interval dropped from 5 min → 90 s. Follow-up retries at +5 s and +15 s added for stale connection handling. |
| Loading skeleton refinement | Skeletons only shown when no cached data — removes flash on cached pages. |
| Chapter sorting fix | Manila sorted first in Luzon region during sign-up chapter selection. |
| Onboarding slide 2 image | Updated from `devcon-luzon-chapter.jpg` to `devcon-luzon-chapters.png`. |
| Safe return URL handling | OAuth callback and SignIn now validate return URLs to prevent open redirect. |
| Event detail public access | `/events/:id` now accessible without authentication. |
| Admin CSV export | Date range inputs, attendance status filter, improved filename format. |

### June 2026 Changes (architecture migration — post-v1.0)

| Change | Notes |
|--------|-------|
| **Firebase Auth migration** | Google OAuth + email/password now via Firebase; Supabase Auth cut (`20260528`/`20260531`). New `/oauth-callback` + `/complete-profile` flows; `profiles.auth_uid` added, `profiles.id` FK dropped. |
| **NestJS gateway is the primary backend** | `server/` on EC2 + nginx (`api.devcon.plus`). Stores moved to `apiFetch`/`publicFetch`; gateway does Firebase verify + `email_verified` + role/chapter/owner scoping + Upstash cache/rate-limits. |
| **Bridge-JWT era** | Gateway mints a short-lived Supabase JWT so residual direct PostgREST calls still work; "Phase 7" retires `supabase-js`. |
| **Realtime inverted to polling-first** (Jun 14) | `subscribeToChanges` no-ops on events/points/rewards/missions; only a best-effort announcements channel remains; `recover()` polls every 60 s. |
| **Custom domain live** | Production `https://devcon.plus`; beta + `plus-beta.devcon.ph` 301-redirect; staging `staging.devcon.plus` (noindex). |
| **Transactional email working** | NestJS email (nodemailer/Gmail) + `send-email`; unified branded email shell; officer-invite email on assignment. |
| **New features** | Raffle "Wheel of Names" (`/wheel`), interest quiz (`/interests`), officer resources + co-organizers, reward claim PIN workflow, missions schema. |
| **Security audit (Jun 19–20)** | White-box source audit; gateway authz strong; open items are RLS/RPC hardening on the direct-PostgREST path (see §4.2 + `SECURITY_AUDIT_*.md`, gitignored). |

### Development Loom Videos (oldest to recent)

These recordings are feature walkthroughs of DEVCON+ from early development to present. Watch in order to understand how the product evolved — each video shows the app at a real checkpoint.

| Date | Link | What Was Shown |
|------|------|---------------|
| Mar 16 | https://www.loom.com/share/fb458b5cc6ec4ee1b8e0d5e9c89eb8b2 | Early feature walkthrough — app at initial development stage |
| Mar 17 | https://www.loom.com/share/fb458b5cc6ec4ee1b8e0d5e9c89eb8b2 | Continued feature walkthrough — auth and core screens |
| Mar 18 (pt 1) | https://www.loom.com/share/55eca950c6e64f1c93f76717363612a5 | Feature walkthrough pt 1 — member flow progress |
| Mar 18 (pt 2) | https://www.loom.com/share/24dbdbfb239646febcdc2706f63c8581 | Feature walkthrough pt 2 — organizer flow progress |
| Mar 24 | https://www.loom.com/share/42bd477c7301465ebc0db4803272d168 | Sprint checkpoint — Supabase live, stores migrated from mocks |
| Apr 06 | https://www.loom.com/share/ea88bcd374db42d79fd0c3d2d1bffb65 | QR system live, PWA deployed, edge functions verified |

## 4.2 Checklist (as of June 21, 2026)

### L1 — Still Blocking (Not Yet Resolved)

| Item | Blocker | Action Required |
|------|---------|----------------|
| **Security audit remediation** | Bridge JWT makes RLS/RPC grants the real authz boundary; June audit found privesc (C1) + BOLA RPCs (H1) | Add `WITH CHECK` to `profiles` UPDATE; auth-guard/revoke `redeem_reward` + `manual_checkin`; chapter-scope `events` UPDATE (M2); restrict `rewards` writes to `hq_admin` (M3). **Verify against live DB first.** See `SECURITY_AUDIT_*.md` (gitignored) |
| **Retire direct `supabase-js` (Phase 7)** | Direct PostgREST access via the bridge JWT is the audit's amplifier | Migrate remaining reads/writes to `apiFetch`; then scope/retire the bridge JWT |
| Re-enable OrganizerCodeGate routing | Route commented out in `router.tsx` — new organizers can't self-onboard via code | Investigate the post-sign-up flow, then re-enable |
| Remove test accounts | Test accounts may appear in officer/admin views | Manual cleanup: Supabase Dashboard / Firebase Auth |
| Remove Easter egg code | `<KonamiCodeWrapper />` + `<KonamiModal />` must be deleted from production | Remove from codebase (currently guarded by `hq_admin/super_admin`) |
| PROMOTED badge data audit | 2nd job (Sui Foundation) + 2nd Tech news post must be `is_promoted = true` in live DB | Verify in Supabase Dashboard → Table Editor |
| Final QA (all flows) | Required before public preview | Test member, organizer, and admin flows on a real mobile device |

> **Resolved since v1.0:** custom domain (`devcon.plus`) live with beta/`plus-beta` redirects; Firebase OAuth on
> production; edge-function CORS updated for prod; transactional email working (June redesign). OWASP-style
> review was performed June 19–20 (remediation tracked above).

### L2 — Should Complete (Bandwidth Permitting)

| Item | Notes |
|------|-------|
| Announcements end-to-end verification | `<SendAnnouncementSheet />` is built. Verify `event_announcements` rows are created and members see them in notifications. |
| Missions system end-to-end | Scaffolded flow needs verification with real data |
| Boosted / Promoted Events | Flag and surface promoted events in events list |
| Custom event fields end-to-end | Organizer creates a field; member fills it on registration |
| Auto-apply chapter theme on login | Currently manual in Profile. Could auto-apply based on member's `chapter_id`. |

## 4.3 Known Technical Limitations

### Realtime is Best-Effort (Polling-First) — by design
**Severity:** Resolved by inversion (2026-06-14)  
**Description:** Supabase Free tier caps Realtime at 200 concurrent connections (fails hard past it) and WAL→JSON replication dominated DB execution time, so always-on subscriptions were removed. App correctness now relies on **polling**: `recover()` (HTTP refetch) on `visibilitychange` + `window.online` + a 60-second interval + auth-change, with +5 s/+15 s follow-ups.  
**Current state:** `subscribeToChanges` is a no-op on events/points/rewards/missions; only a best-effort announcements channel remains (gives up on `CHANNEL_ERROR`/`TIMED_OUT`). There is **no `resubscribe()`**.  
**To re-enable always-on realtime** (e.g. after a Supabase Pro upgrade): restore handlers from git history and re-add tables to the `supabase_realtime` publication. See `.claude/rules/db-connection-resilience.md`.

### Security: Direct-PostgREST (Bridge-JWT) Hardening
**Severity:** High (open — remediation in progress)  
**Description:** Because the browser holds a bridge JWT and can reach PostgREST/RPCs directly, RLS policies and RPC grants — not the gateway — are the authz boundary for those paths. The June 19–20 audit found a `profiles` privilege-escalation gap (C1) and actor-id-trusting `SECURITY DEFINER` RPCs (H1).  
**Action:** Harden RLS/RPCs (see §4.2) and accelerate Phase 7 (retire `supabase-js`). See `SECURITY_AUDIT_*.md` (kept local / gitignored).

### Jobs Board is Manually Seeded
**Severity:** Low (by design for MVP)  
**Description:** The jobs board contains 8 manually seeded listings in Supabase. There is no external API integration. Adding new jobs requires direct Supabase table access.  
**Phase 2:** External jobs API integration is on the roadmap.

### No Staging Database (Free Plan Limitation)
**Severity:** Medium (workflow risk)  
**Description:** The project uses Supabase Free Plan, which does not include the Branching feature. Local development hits the **same live production Supabase project** as the deployed app. There is no isolated staging environment.  
**Risk:** A bad migration or seed script run locally will affect real members' data.  
**Workaround for the receiving team:**
- Create a dedicated **test user account** in Supabase Auth for development — never test with a real member's account.
- Before applying any schema migration, paste the SQL into the Supabase **SQL Editor** preview to check for errors — do not run `supabase db push` without reviewing the migration first.
- Consider upgrading to Supabase Pro ($25/month) to unlock DB Branching if the codebase becomes more actively developed post-MVP.

### Security Audit Status (as of April 17, 2026)
**Tool:** AgentShield scan on `.claude/` configuration directory  
**Grade: B (78/100)**

| Category | Score | Notes |
|----------|-------|-------|
| Secrets | 100 | No hardcoded secrets detected |
| Permissions | 91 | No overly permissive allow lists |
| Hooks | 100 | No dangerous hook patterns |
| MCP Servers | 100 | Clean |
| Agents | 0 | Agent files flagged for size (>5000 chars) — see below |

**Findings breakdown:**

6 HIGH findings — all **false positives** or **intentional**:
- `CLAUDE.md` and `DEV_ONBOARDING_AGENT.md` flagged for the phrase "backward compatible" — this is a legitimate English description of the MD3/legacy typography coexistence, not an evasion technique.
- `SECURITY_AGENT.md` flagged for HTML comments containing `DROP TABLE` test vectors — these are **intentional**. The security agent file contains SQL injection test vectors explicitly labeled "paste into a form field to test, do NOT execute." This is expected in a security testing agent.

7 MEDIUM findings:
- **No `PreToolUse` hooks** in `settings.json` / `settings.local.json` — legitimate recommendation. Adding pre-tool hooks would add a security layer before sensitive Bash or file operations. Not critical for MVP but worth adding post-launch.
- **Large agent definition files** (5 files flagged, 5,000–15,000 effective chars each) — the scanner flags large agent docs as potential hidden-instruction vectors. These are legitimate comprehensive agent definitions, not security risks. Review the end of each agent file manually to verify.

**Action required:** No critical or urgent security fixes from this scan. The `PreToolUse` hook recommendation is the only actionable medium finding. OWASP Top 10 pen test pass on the **application code** (not just config) is still required before May 15 — see L1 checklist in Section 4.2.

## 4.4 Constraints

### Technical
- Install per app (`cd web && npm install`, `cd server && npm install`) — there is no root workspace. React 19 is pinned via `web/package.json` `overrides`, so `--legacy-peer-deps` is **not** needed (older docs that require it are out of date).
- `tsc -b` is stricter than the Vite dev server. The flags `noUnusedLocals` and `noUnusedParameters` are enforced. Any unused import or variable will fail the Vercel build. Always run `npm run typecheck` before committing.
- Vercel `.ph` TLDs are not sold through Vercel's domain marketplace. The domain is already registered — only a DNS CNAME record is needed.
- Cloudflare's orange-cloud proxy must be **disabled** (DNS only, grey cloud) for the Vercel CNAME and all Resend DKIM records. Proxying blocks SSL certificate provisioning and DKIM lookups.

### External / Access
- The `devcon.ph` DNS panel is managed by DEVCON HQ IT. The outgoing team cannot apply DNS records unilaterally.
- Google Cloud Console OAuth client configuration requires access to the GCP project used for DEVCON+.
- The Supabase project (URL, anon key, service role key) and Vercel project credentials must be transferred to the receiving team by the outgoing team lead.

### Resource
- **Claude Code AI subscription ends April 26, 2026.** Development after this date must proceed without AI-assisted code generation. The codebase is thoroughly documented in `.claude/CLAUDE.md` to compensate.
- The outgoing team (2 interns) will be unavailable after April 26 for active development. Limited async support may be available for critical questions through April 30.

### Timeline
- **April 30:** Development freeze. No new features after this date.
- **May 15:** Public preview (if followed). All L1 items must be resolved before this date.

---

---

# 5. Developer & Operations Documentation

## 5.1 Onboarding Guide

### Prerequisites
```
Node.js 20+
npm 10+
Supabase CLI:  npm install -g supabase
Git access to: https://github.com/rocketwolf98/devconplusClaudeCode
```

### First-Time Setup
```bash
# 1. Clone the repository
git clone https://github.com/rocketwolf98/devconplusClaudeCode
cd devconplusClaudeCode

# 2. Install dependencies (each app installs on its own — no root workspace)
cd web && npm install        # React 19 pinned via `overrides` — no --legacy-peer-deps
cd ../server && npm install  # NestJS gateway

# 3. Create env files (get values from the team lead)
cp web/.env.example web/.env.local          # frontend
cp server/.env.example server/.env          # gateway

# 4. Start the apps (separate terminals)
cd web && npm run dev        # → http://localhost:5173
cd server && npm run dev     # → http://localhost:8000
```

### Environment Variables

**`web/.env.local`** (frontend — gitignored; see `web/.env.example`)
```env
VITE_SUPABASE_URL=           # Supabase project URL
VITE_SUPABASE_ANON_KEY=      # Supabase anon (public) key
VITE_GOOGLE_CLIENT_ID=       # Google OAuth client ID
VITE_TURNSTILE_SITE_KEY=     # Cloudflare Turnstile site key
VITE_FIREBASE_API_KEY=       # Firebase web config (4 keys)
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_APP_ENV=development
VITE_ALLOW_INDEXING=         # "true" only on production
VITE_API_URL=http://localhost:8000   # NestJS gateway base URL
```

**`server/.env`** (gateway — gitignored; see `server/.env.example`) holds the secrets: `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `QR_JWT_SECRET`, `EMAIL_VERIFICATION_SECRET`, Gmail SMTP
creds, `CORS_ORIGIN`, `APP_URL`/`SERVER_URL`, and optional Upstash Redis keys. **Never** put these in the frontend.

> Always use `import.meta.env.VITE_*` in the frontend. Never use `process.env.*` — Vite does not expose it to the browser bundle.

### Required Knowledge
Before making any changes, read these files in order:
1. `.claude/CLAUDE.md` — master technical reference (DB schema, routes, components, design system, stores)
2. `.claude/rules/db-connection-resilience.md` — polling-first realtime rule
3. `.claude/rules/vercel-build-safety.md` — TypeScript flags that cause Vercel build failures
4. `docs/auth/` — Firebase auth + bridge-JWT architecture
5. `PRD.md` — product context and developer handover summary

## 5.2 Technical Documentation

### Repository Structure
```
devcon-plus/
├── web/                            React + Vite frontend (@devcon-plus/web)
│   ├── src/
│   │   ├── router.tsx              All routes (flat createBrowserRouter — the app map)
│   │   ├── components/
│   │   │   ├── MemberLayout.tsx        Member shell + auth guard + polling recovery
│   │   │   ├── OrganizerLayout.tsx     Organizer shell + role guard + polling recovery
│   │   │   └── AdminLayout.tsx         Admin shell + hq_admin/super_admin guard
│   │   ├── pages/                  All page components (member/, organizer/, admin/, auth/)
│   │   ├── stores/                 Zustand stores (one per domain — fetch via lib/api.ts)
│   │   ├── lib/
│   │   │   ├── api.ts              apiFetch() / publicFetch() — the primary data path
│   │   │   ├── firebase.ts         Firebase web init (sign-in)
│   │   │   ├── authBridge.ts       exchange Firebase token → Supabase bridge JWT
│   │   │   ├── supabase.ts         Supabase client (bridge-JWT path only)
│   │   │   ├── animation.ts        framer-motion variants — import from here only
│   │   │   ├── eventTheme.ts       Per-event theme override utilities
│   │   │   ├── constants.ts        App-wide constants (no magic strings)
│   │   │   ├── dates.ts            Date formatting utilities
│   │   │   └── validation.ts       Zod schemas and reusable validators
│   │   ├── hooks/
│   │   │   ├── useFormDraft.ts             Form state persistence (localStorage/sessionStorage)
│   │   │   └── useRecoverOnFocus.ts        Polling recovery hook (no resubscribe)
│   │   └── types/                  types.ts + generated database.types.ts (@devcon-plus/supabase alias)
│   ├── tailwind.config.js          Design tokens, MD3 type scale, color palette
│   ├── vite.config.ts              Build + robots.txt generator (VITE_ALLOW_INDEXING)
│   └── vercel.json                 Deploy config + security headers
├── server/                         NestJS gateway (@devcon-plus/server) → EC2 + nginx
│   └── src/                        auth, users, events, points, registrations, rewards, missions,
│                                   volunteers, qr, upgrades, admin, news, jobs, chapters, interests, ...
├── supabase/
│   ├── functions/                  Edge Functions (Deno): generate-qr-token, generate-user-qr,
│   │                               generate-pending-qr, award-points-on-scan, approve-at-door,
│   │                               check-rate-limit, send-email, delete-user, + _shared/
│   └── migrations/                 SQL migration files (applied in order)
└── docs/                           auth/* (Firebase + bridge JWT), migration-plans/*
```
> `apps/` and `packages/` may exist locally but are untracked leftovers from the old Turbo layout — ignore them.

### Zustand Stores Reference

| Store | Domain | Key Methods |
|-------|--------|-------------|
| `useAuthStore` | User session, profile, auth (Firebase + gateway) | `initialize()`, `signIn()`, `signUp()`, `signInWithGoogle()`, `signOut()`, `updateProfile()`, `requestOrganizerUpgrade()` |
| `useEventsStore` | Events + registrations | `fetchEvents()`, `register()`, `subscribeToChanges()` (no-op), `subscribeToRegistration()` (best-effort) |
| `useJobsStore` | Jobs board | `fetchJobs()`, `getById()` |
| `usePointsStore` | Points ledger | `loadTransactions()`, `loadTotalPoints()`; `subscribeToChanges()` no-op |
| `useRewardsStore` | Rewards catalog + redemptions | `fetchRewards()`, `redeem()`; `subscribeToChanges()` no-op |
| `useMissionsStore` | Missions | `fetchMissions()`, `startMission()`, `submitMission()`; `subscribeToChanges()` no-op |
| `useChaptersStore` | Chapters list (public) | `fetchChapters()` |
| `useNotificationsStore` | In-app notifications | `fetchRecent()`, `subscribe()` (best-effort), `markRead()` |
| `useVolunteerStore` | Member volunteer apps | `loadApplications()`, `applyToVolunteer()` |
| `useOrgVolunteerStore` | Organizer approval queue | `loadApplications()`, `approveApplication()`, `rejectApplication()` |
| `useThemeStore` | Active program theme | `setTheme()`, `activeTheme()` — persisted to `localStorage` key `devcon-theme` |

### Coding Standards Summary

| Rule | Detail |
|------|--------|
| TypeScript | Strict mode — no `any`, no `@ts-ignore` without explanation |
| Naming | `PascalCase.tsx` for components, `camelCase.ts` for lib/store files |
| Forms | React Hook Form + Zod for every form — no uncontrolled inputs |
| Async calls | Every async call must have loading, error, and empty states |
| Navigation | No dead-end routes — every path renders content or `<ComingSoonModal />` |
| Animation | Import from `lib/animation.ts`. Use `motion.div` + `staggerContainer`/`cardItem` for lists. |
| Icons | `solar-icon-set` outline variant only. No emoji in JSX. |
| Constants | All constants in `lib/constants.ts`. No magic strings or numbers inline. |
| Primary color | Always `text-primary` / `bg-primary`. Never hardcode hex for primary. |
| Data access | Through the NestJS gateway (`apiFetch`/`publicFetch`). No new direct `supabase.from(...)` in components/stores. |
| Realtime | Polling-first: `recover()` on visibility/online/60 s/auth-change. No `resubscribe()`; realtime is best-effort only. |

### After Any Database Schema Change
```bash
# Regenerate TypeScript types from the live DB
supabase gen types typescript --project-id <supabase-project-ref-id> \
  > web/src/types/database.types.ts

# Verify the build still passes
cd web && npm run typecheck && npm run build
```

## 5.3 Deployment Guide

### Standard Deploy (Automatic)
Every push to `master` on GitHub triggers an automatic Vercel production deploy of the **frontend** (`web/`).
The **backend** (`server/`) is deployed separately on EC2 (see below) — it does not deploy from `master`.

### Manual Deploy (frontend)
```bash
# Verify locally first — this mirrors Vercel's exact build command
cd web && npm run typecheck    # Must pass with zero errors
cd web && npm run build        # Must complete successfully

# Push triggers Vercel deploy automatically
git push origin master
```

### Backend Deploy (NestJS gateway)
The gateway runs on **EC2 behind nginx** (`https://api.devcon.plus`). Build and restart the Node
process on the host (`cd server && npm run build && npm run start`, typically under a process manager) and
keep `server/.env` set in that environment. It is not part of the Vercel pipeline.

### Vercel Build Failure Triage

If the Vercel deploy fails with exit code 2:

1. Run `npm run typecheck` locally to surface all TypeScript errors
2. Common causes: unused imports (`noUnusedLocals`), unused parameters (`noUnusedParameters`), `any` types
3. Fix all errors before re-pushing — the dev server does NOT catch these, only `tsc -b` does

See `.claude/rules/vercel-build-safety.md` for the complete checklist.

### Deploying Edge Functions
```bash
# After any change to supabase/functions/
supabase functions deploy generate-qr-token
supabase functions deploy generate-user-qr
supabase functions deploy generate-pending-qr
supabase functions deploy award-points-on-scan
supabase functions deploy approve-at-door
supabase functions deploy check-rate-limit
supabase functions deploy send-email
supabase functions deploy delete-user

# If a CORS allowlist was updated, ALL functions must be redeployed.
```

## 5.4 Environment Parity

| Setting | Local Dev | Production |
|---------|-----------|-----------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `web/.env.local` | Vercel env vars |
| `VITE_GOOGLE_CLIENT_ID` + `VITE_FIREBASE_*` | `web/.env.local` | Vercel env vars |
| `VITE_API_URL` | `http://localhost:8000` (or staging API) | `https://api.devcon.plus` |
| `VITE_ALLOW_INDEXING` | unset | `true` on prod, unset on staging |
| `VITE_APP_ENV` | `development` | `production` |
| Gateway secrets (`SUPABASE_SERVICE_ROLE_KEY`, `*_JWT_SECRET`, Firebase admin, ...) | `server/.env` | EC2 host env |
| Supabase DB / Edge Functions | Live production project (shared) | Same live production project |

> **Note:** Local development hits the same live Supabase production project. There is no separate staging database — exercise caution with real member data; use a test account. For frontend-only work, point `VITE_API_URL` at the staging API and skip running `server/` locally.

## 5.5 User Manuals

### For Members
- Visit https://devcon.plus
- Sign up with Google or email/password (Firebase)
- Browse upcoming events → Register → Show QR ticket at venue
- Earn points automatically when an officer scans your QR code
- View points balance and transaction history under Points
- Browse jobs, apply to volunteer, redeem rewards (catalog only — fulfillment coming in Phase 2)

### For Chapter Officers
- Request an upgrade via Profile → Request Organizer Access (the sign-up code gate is temporarily disabled), or have an admin set your role
- Access the Organizer flow at `/organizer`
- Create events, set approval requirements, manage registrants
- At the venue: open `/organizer/scan` on your phone → camera scans member QR → points awarded automatically
- Broadcast announcements to registered members via the announcement sheet on any event page

### For HQ Admins
- Access the Admin panel at `/admin` (requires `hq_admin` role)
- Manage users, org codes, chapters, and upgrade requests
- The Kiosk (`/admin/kiosk`) is restricted to `super_admin` role
- Generate organizer codes in `/admin/org-codes` → specify scope (chapter or HQ), role, and usage limits

---

---

# 6. Turnover Execution

## 6.1 Access Control

The following credentials and accesses must be transferred from the outgoing team to the receiving team before April 26, 2026. All secrets must be transferred via a secure channel (not email or chat in plain text).

| Credential / Access | Location | Transfer Method |
|---------------------|----------|-----------------|
| Supabase URL + anon key | `web/.env.local` | Secure credential share |
| Supabase service-role key + JWT secret | `server/.env` | Secure credential share |
| Firebase web config + service account | `web/.env.local` / `server/.env` (`FIREBASE_SERVICE_ACCOUNT_JSON`) | Secure credential share + Firebase Console access |
| Supabase dashboard access | supabase.com | Invite receiving team member as project collaborator |
| Google OAuth client ID | `web/.env.local` / GCP Console | Secure credential share + GCP Console access |
| EC2 / backend host access | gateway deploy + `server/.env` | Secure host access transfer |
| Vercel project access | vercel.com | Invite receiving team member to the Vercel team/project |
| GitHub repository access | https://github.com/rocketwolf98/devconplusClaudeCode | Add receiving team as collaborators |
| Cloudflare DNS panel | Via DEVCON HQ IT officer | Coordinate through DEVCON HQ |
| Resend account | resend.com | Via DEVCON HQ IT officer |
| Figma file access | https://www.figma.com/design/sYDNlHmsHK5dZRHvNabfcn/ | Share link or invite |

**Security requirements:**
- Never commit secrets to the repository. Secrets live only in `.env.local` (local, gitignored) and Vercel environment settings.
- Rotate any credentials that were shared insecurely.
- Remove outgoing team member access from Supabase, Vercel, and GitHub after the handover window closes.

## 6.2 Contact Matrix

| Role | Person | Responsibility | Async Channel |
|------|--------|----------------|---------------|
| Outgoing Dev (Frontend) | **Kien** | All page components, auth UI, design system, animations, responsive layout | Viber · Telegram · GitHub |
| Outgoing Dev (Backend) | **Kenshin** | Edge functions, Supabase schema, QR system, RLS, stores, credential transfer | Viber · Telegram · GitHub |
| Project Manager | **Sir Dom** | Product direction, stakeholder coordination, milestone sign-off | Viber · Telegram |
| DEVCON HQ IT Officer | TBD via DEVCON HQ | DNS (Cloudflare `devcon.ph`), Resend domain, Google Cloud Console | Via DEVCON Philippines HQ |
| DEVCON HQ Engineering | TBD via DEVCON HQ | Supabase project ownership, long-term platform direction | Via DEVCON Philippines HQ |

## 6.3 Knowledge Transfer Plan

### Async Support Channels

After April 26, the outgoing team is available for async questions via:
- **Viber** — fastest response, use for urgent questions
- **Telegram** — preferred for longer technical threads
- **GitHub** — open issues on the repo for code-specific questions or bugs

Contact Kien or Kenshin directly. For product/scope decisions, loop in Sir Dom.

### Week 1 (April 21–26) — Active Overlap Period
The outgoing team is available for questions and pair sessions during this window. Claude Code AI assistance is also available until April 26.

**Recommended sessions:**
1. **Codebase walkthrough** (2–3 hours) — Walk through `router.tsx`, the three layouts, one store end-to-end, and one edge function. Use the Loom videos (Section 4.1) as pre-read.
2. **QR system deep-dive** (1 hour) — `generate-qr-token` → member shows QR → `award-points-on-scan` → `approve-at-door`. The atomicity guarantee is critical.
3. **Realtime recovery pattern** (30 min) — Read `.claude/rules/db-connection-resilience.md`, then review `MemberLayout.tsx` live. Any future layout or store must replicate this pattern.
4. **Build and deploy walkthrough** (30 min) — Run `npm run typecheck`, `npm run build`, and trigger a Vercel deploy. Understand what fails and why.
5. **Infrastructure walkthrough** (1 hour) — Supabase dashboard (tables, RLS, edge functions, auth settings), Vercel project settings, Cloudflare DNS (when access is available).

### Pre-Handover Reading List (in order)

| Document | Location | Priority |
|----------|----------|----------|
| Master architecture reference | `.claude/CLAUDE.md` | **Required** |
| Developer handover + status | `PRD.md` | **Required** |
| Vercel build safety rules | `.claude/rules/vercel-build-safety.md` | **Required** |
| DB connection resilience rule | `.claude/rules/db-connection-resilience.md` | **Required** |
| Domain + email setup guide | `.claude/docs/DOMAIN_AND_EMAIL_SETUP.md` | Required for infra work |
| Full PRD (Google Doc) | https://docs.google.com/document/d/1VUGu4t6M4QUHlljm1c6JmpINZxkN4gQUVJFceh71c8k/ | Supplementary |
| Figma prototype | https://www.figma.com/design/sYDNlHmsHK5dZRHvNabfcn/ | Supplementary |
| Lovable prototype (UX reference) | https://devconplusrndprototype.lovable.app/ | Supplementary |

---

---

# 7. Handover Dos and Don'ts

## 7.1 DOs

### For the Receiving Team

- **Do read `.claude/CLAUDE.md` before touching any code.** It is the authoritative reference for every design decision, DB field name, route, component, and store in the codebase.
- **Do run `npm run typecheck` before every commit.** Vercel's build fails on TypeScript errors. The dev server does not catch these.
- **Do run `npm install` per app** (`web/` and `server/`). React 19 is pinned via `overrides` — `--legacy-peer-deps` is no longer needed.
- **Do use `text-primary` / `bg-primary` for the primary color.** Never hardcode hex values for primary. The color is driven by a CSS custom property and changes with the user's selected theme.
- **Do use the `solar-icon-set` outline variant** for all icons. No emoji in JSX. No other icon libraries.
- **Do import animation variants from `lib/animation.ts`.** Never redefine `fadeUp`, `staggerContainer`, etc. inline.
- **Do fetch through the NestJS gateway** (`apiFetch`/`publicFetch` in `web/src/lib/api.ts`) for all data operations. Don't add new direct `supabase.from(...)`/`supabase.rpc(...)` calls — direct `supabase-js` is legacy bridge-JWT, being retired. The `MOCK_*` exports in `web/src/types/mock/` are reference data only — never import them.
- **Do follow the polling-first recovery pattern** (`recover()` on `visibilitychange`/`online`/60 s/auth-change, +5 s/+15 s follow-ups) in any new layout or store. There is **no `resubscribe()`**; realtime is best-effort only. See `.claude/rules/db-connection-resilience.md`.
- **Do use `spendable_points`** (not `total_points`) for the user's redeemable balance. `total_points` does not exist in the live DB.
- **Do use `<ComingSoonModal />`** for any incomplete feature rather than leaving a dead-end route or placeholder text.
- **Do regenerate `database.types.ts`** after any schema change: `supabase gen types typescript --project-id <ref> > web/src/types/database.types.ts`.
- **Do keep CORS allowlists origin-exact** (`devcon.plus`, `staging.devcon.plus`, the gateway origin, localhost) and redeploy all edge functions after any change.
- **Do verify data in the Supabase Dashboard** after any seeding or migration. The PROMOTED badge relies on `is_promoted = true` in live data.
- **Do test on a real mobile device** (iPhone Safari + Android Chrome) before marking any UI change complete.

## 7.2 DON'Ts

### For the Receiving Team

- **Don't add Apple Sign-In.** Auth is Google OAuth + email/password only. This is a non-negotiable product decision.
- **Don't mix `MemberLayout`, `OrganizerLayout`, and `AdminLayout` components.** These are three separate route trees. Shared utility components are safe; layout components are not.
- **Don't use Tailwind `slate-600` or `slate-800`.** These steps do not exist in the configured scale. Use 500 or 700.
- **Don't use `process.env.*` in the frontend.** Use `import.meta.env.VITE_*` — Vite does not expose `process.env` to the browser bundle.
- **Don't commit secrets.** `.env.local` and `supabase/.env` are gitignored for a reason.
- **Don't leave placeholder text** (`"Lorem ipsum"`, `"________"`, empty strings). Use `<ComingSoonModal />`.
- **Don't create dead-end navigation.** Every route must render content or a `<ComingSoonModal />`.
- **Don't hardcode hex values for the primary color.** The theme system sets these via CSS custom properties.
- **Don't use `total_points` in Supabase queries.** The field is `spendable_points`. Using the old name will cause a TypeScript build error.
- **Don't use `--no-verify` to skip git hooks** unless you understand exactly what you are bypassing.
- **Don't build Phase 2 features** (KMP, Group Chat, Swipe Feed, Push Notifications, Reward fulfillment) — these remain explicitly out of scope. Prioritize the open security-remediation and Phase 7 (retire `supabase-js`) work first.
- **Don't redefine framer-motion variants inline.** Always import from `lib/animation.ts`. Inline redefinitions cause stagger animate key mismatches (`"visible"` vs `"show"`).
- **Don't rely on the Vite dev server for TypeScript correctness.** Vite is permissive. `tsc -b` is the source of truth.
- **Don't enable Cloudflare's orange-cloud proxy** on the Vercel CNAME record or Resend DKIM CNAMEs. Proxying breaks SSL certificate provisioning and DKIM email authentication.
- **Don't remove the polling recovery (`useRecoverOnFocus` / `recover()`) from any session-owning layout.** It is now the *primary* freshness mechanism (realtime is best-effort) — removing it causes stale data after device sleep or network switches.

---

---

# 8. Annex

## 8.1 Glossary

| Term | Definition |
|------|-----------|
| **MemberLayout** | The React layout component wrapping all member-facing routes (`/home`, `/events/*`, etc.). Handles auth guard, bottom nav (mobile), sidebar (desktop), and Realtime recovery. |
| **OrganizerLayout** | Layout for all organizer routes (`/organizer/*`). Separate from MemberLayout. Does not apply program themes. |
| **AdminLayout** | Layout for all admin routes (`/admin/*`). Desktop-only sidebar. Guards for `hq_admin` and `super_admin` roles. |
| **spendable_points** | The user's current redeemable point balance on the `profiles` table. Decremented when a reward is redeemed. |
| **lifetime_points** | Cumulative points earned by the user, never decremented. Used for XP tier tracking. |
| **QR token kinds** | `'r'` = registration (standard check-in), `'u'` = user identity (finds imminent event), `'p'` = pending door-approval |
| **PROMOTED badge** | Orange `#F97316` badge applied to the 2nd job listing (Sui Foundation) and 2nd Tech news post. Data-driven via `is_promoted = true` in DB. |
| **devcon_category** | Event field that triggers per-event theme overrides. Values: `'devcon'`, `'she'`, `'kids'`, `'campus'`. Processed by `getEventThemeStyle()` in `lib/eventTheme.ts`. |
| **ComingSoonModal** | Reusable modal component for features not yet implemented. Every incomplete feature must route to this — never leave a dead-end. |
| **Polling-first recovery** | The freshness model (since 2026-06-14). `recover()` refetches over HTTP on `visibilitychange`, `online`, a 60-second interval, and auth-change (+5 s/+15 s follow-ups). There is **no `resubscribe()`** — realtime is best-effort only. (Supersedes the old "two-layer recovery".) |
| **NestJS gateway** | The backend in `server/` (EC2 + nginx, `api.devcon.plus`). The primary data path: the frontend calls it via `apiFetch`/`publicFetch`. Verifies Firebase ID tokens + roles. |
| **bridge JWT** | A short-lived Supabase JWT (`role: authenticated`, `sub = profiles.id`) the gateway mints so the browser can still hit PostgREST directly. Legacy — retired in "Phase 7". |
| **apiFetch / publicFetch** | Helpers in `web/src/lib/api.ts`. `apiFetch` injects the Firebase ID token (auto-refresh on 401); `publicFetch` is for public reads. |
| **Firebase Auth** | The authentication provider (Google popup + email/password). Replaced Supabase Auth in May–June 2026. |
| **organizer_codes** | Codes stored in Supabase that, when submitted during sign-up or upgrade, assign a chapter officer or HQ admin role to a user. |
| **edge function** | Serverless Deno functions deployed to Supabase. Used for QR token generation, points awarding, rate limiting, and door approval. |
| **RLS** | Row Level Security. Postgres policies that restrict data access at the database level, enforced for every Supabase query. |
| **MD3 type scale** | Material Design 3 typography tokens (`text-md3-*`) added to `tailwind.config.js`. Preferred for new components. Coexists with the legacy Tailwind scale. |
| **Proxima Nova** | The app's primary typeface. Self-hosted woff2, 6 weights. Loaded in `index.css`. Referenced as `font-proxima` or `font-sans` in Tailwind. |
| **program themes** | 5 user-selectable color themes (devcon, she, kids, campus, purple) that change the `--color-primary` CSS custom property. Persisted via `useThemeStore`. |
| **`web/` + `server/`** | The two co-located apps: the React frontend (`web/`, `@devcon-plus/web`) and the NestJS gateway (`server/`, `@devcon-plus/server`). No root workspace/Turbo — each installs and builds independently. (The old `apps/member` Turbo monorepo is gone; any leftover `apps/`/`packages/` dirs are untracked.) |

## 8.2 Asset Library

| Asset | Location | Notes |
|-------|----------|-------|
| Onboarding photos (real chapter group photos) | `web/public/photos/` | `devcon-summit-group.jpg`, `devcon-luzon-chapters.png`, `devcon-certificate-ceremony.jpg`, `devcon-jumpstart-internships.jpg` |
| Proxima Nova font files | `web/public/fonts/` | 6 weights in woff2 format |
| PWA icons | `web/public/` | `icon-192.png`, `icon-512.png`, `icon-maskable.png`, `apple-touch-icon.png` |
| DEVCON+ logo assets | `web/public/` or `web/src/assets/` | Check both locations |
| Figma design file | https://www.figma.com/design/sYDNlHmsHK5dZRHvNabfcn/ | v0.1 concept prototype — use as UX reference |
| Lovable prototype | https://devconplusrndprototype.lovable.app/ | UX reference only — not the production codebase |

## 8.3 Research & Reference Data

| Resource | Link | Purpose |
|----------|------|---------|
| Live app | https://devcon.plus | Current production deployment (beta URL 301-redirects here) |
| GitHub repository | https://github.com/rocketwolf98/devconplusClaudeCode | Codebase |
| Original PRD (Google Doc) | https://docs.google.com/document/d/1VUGu4t6M4QUHlljm1c6JmpINZxkN4gQUVJFceh71c8k/ | Extended product requirements |
| Figma prototype | https://www.figma.com/design/sYDNlHmsHK5dZRHvNabfcn/ | Design reference |
| Lovable prototype | https://devconplusrndprototype.lovable.app/ | UX interaction reference |
| OWASP Top 10 | https://owasp.org/www-project-top-ten/ | Security audit standard |
| Vercel docs | https://vercel.com/docs/projects/domains | Custom domain setup |
| Supabase custom SMTP docs | https://supabase.com/docs/guides/auth/auth-smtp | Email configuration |
| Resend + Supabase guide | https://resend.com/docs/send-with-supabase-smtp | Transactional email setup |
| Cloudflare DNS management | https://developers.cloudflare.com/dns/ | DNS record configuration |

## 8.4 Development Session Videos (Loom Archive)

These recordings capture the app at each major development checkpoint. Watch in order for full context on how the product evolved.

| Date | Link | What Was Shown |
|------|------|---------------|
| March 16 | https://www.loom.com/share/fb458b5cc6ec4ee1b8e0d5e9c89eb8b2 | Early development |
| March 17 | https://www.loom.com/share/fb458b5cc6ec4ee1b8e0d5e9c89eb8b2 | Continued development |
| March 18 (pt 1) | https://www.loom.com/share/55eca950c6e64f1c93f76717363612a5 | Development progress |
| March 18 (pt 2) | https://www.loom.com/share/24dbdbfb239646febcdc2706f63c8581 | Development progress |
| March 24 | https://www.loom.com/share/42bd477c7301465ebc0db4803272d168 | Sprint checkpoint |
| April 06 | https://www.loom.com/share/ea88bcd374db42d79fd0c3d2d1bffb65 | QR system live, PWA deployed |

## 8.5 Coming Soon — Confirmed Planned Features

These three features are confirmed for development after MVP launch. They are **not in scope for April 30** but are expected deliverables in Phase 2. Use `<ComingSoonModal />` if a user reaches any of these entry points during MVP.

### 1. Messaging / Group Chat System
**Purpose:** Async chapter-scoped messaging so members in the same chapter can communicate, collaborate, and build community without leaving the app.

**Scope:**
- Chapter-scoped message threads (not 1:1 DM at launch — chapter board first)
- Realtime delivery via Supabase Realtime broadcast channel
- Officers can delete/moderate messages
- Entry point: Dashboard quick action or Profile → Community

**New DB tables needed:**
```sql
chat_threads (id, chapter_id, title, created_by, created_at)
chat_messages (id, thread_id, author_id, content, created_at)
```

**Why deferred:** Requires moderation tooling, Realtime broadcast pattern (different from postgres_changes), and officer tooling integration. Not feasible before April 30.

---

### 2. Professional Friend / Connection System
**Purpose:** A professional networking discovery layer — like Tinder swipe UX but for connecting with other DEVCON members. Think LinkedIn's "People You May Know" but contextual to your chapter and event attendance.

**Scope:**
- Swipe-based discovery UI (framer-motion `drag` + `dragConstraints`)
- Match on: same chapter, attended same events, similar school/company
- Mutual connection = both swiped right → connection established
- Connection feed / list view on Profile
- No messaging between connections at launch (Phase 3)

**New DB tables needed:**
```sql
connection_requests (id, from_user_id, to_user_id, status, created_at)
-- status: 'pending' | 'accepted' | 'rejected'
connections (id, user_a_id, user_b_id, connected_at)
```

**Why deferred:** Swipe gesture UX requires careful tuning. Discovery algorithm needs event attendance data as a signal. Privacy considerations for member profile visibility.

---

### 3. Profile View (Separate from Settings)
**Purpose:** A public-facing profile page that other members (and eventually connections) can view — separate from the current `/profile/edit` settings screen.

**Scope:**
- Public profile URL: `/profile/:username` (username is already unique in DB)
- Shows: display name, chapter, XP tier/badge, events attended, volunteer history
- Privacy controls: member can toggle what's visible (uses existing `Privacy` settings screen)
- Own profile view accessible from nav Profile tab (before settings)

**Implementation note:** The `username` field already exists on `profiles` and is unique — the foundation is in place. The `/profile/edit` screen already has photo upload. This feature mostly requires a new read-only display component and a route.

**Why deferred:** Requires privacy policy review before exposing member data to other members. Scope agreed but timing deferred to Phase 2.

---

## 8.6 Phase 2 Roadmap (Post–May 15, 2026)

These features are deferred and must not be built before April 30, 2026.

| Feature | Description | Technical Notes |
|---------|-------------|----------------|
| **KMP Migration** | Port to Kotlin Multiplatform (Android + iOS + Web) | `supabase-kt` client maps to current stores. React architecture is already store-pattern friendly. |
| **Group Chat** | Async chapter-scoped message board | New tables: `chat_threads`, `chat_messages`. Realtime broadcast channel. Moderation by officers. See Section 8.5. |
| **Professional Connections** | Swipe-to-connect discovery for DEVCON members | framer-motion `drag` UX, connection_requests table, match algorithm. See Section 8.5. |
| **Public Profile View** | Read-only profile page at `/profile/:username` | Username field already exists. Needs privacy controls + new display component. See Section 8.5. |
| **Swipe Feed** | Vertical swipe content feed (events, news, jobs) | framer-motion `drag` + `dragConstraints`. Feed ranking logic. New data structures. |
| **Push Notifications** | Native push for events and points | Requires service worker. Out of scope for web MVP. Native target via KMP. |
| **Reward Fulfillment** | Physical shipping + digital voucher delivery | Logistics and third-party fulfillment integration. |
| **WebSocket Resilience** | Full Supabase Realtime reconnect on mobile Safari | Exponential backoff, explicit `CLOSED` state banner, automated reconnect tests. See `.claude/rules/db-connection-resilience.md`. |

---

*End of DEVCON+ Transition Documentation — Version 1.1 (June 2026 architecture sync)*  
*Originally prepared by the DEVCON Jumpstart Internship Cohort 3 Development Team (April 2026)*  
*Architecture sync: June 21, 2026 — Firebase auth, NestJS gateway, polling-first realtime, `devcon.plus` live*
