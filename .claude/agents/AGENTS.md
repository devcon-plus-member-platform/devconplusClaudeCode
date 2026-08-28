# DEVCON+ AI Agent System
> Version: 1.3 | CLAUDE.md Synced: MVP 1.5 | Last Updated: April 15, 2026
> Project: DEVCON Plus — Tech Community Unified Platform
> Live App: https://devcon.plus
> Cohort 3 Graduation: April 30, 2026
> Public Preview: May 15, 2026 (Dev B presents)
> Claude Code Cutoff: April 26, 2026
>
> ⚠️ **This file has not been fully synced past MVP 1.5.** The architecture and "already done"
> sections below describe the pre-Firebase, pre-NestJS-gateway app (pure Supabase Auth + direct
> `supabase-js` client calls). That is no longer how the app works — auth is now Firebase Auth,
> and the frontend talks to a NestJS gateway (`server/`) via `apiFetch`/`publicFetch`, not Supabase
> directly. For current architecture, always defer to `.claude/CLAUDE.md` (Sections 0, 3, 10–12, 15).
> The dated checklists further down remain useful as historical sprint records.

---

## What This Is

This folder contains four specialized AI agent personas for the continuous development,
quality assurance, and handover of the DEVCON+ platform. Each agent is a Claude Code
context file — a structured set of instructions and project knowledge that tells Claude
Code exactly how to behave when acting in that role.

These agents exist because the team is small (2 interns), the deadline is fixed, and
knowledge must not live only in people's heads. Any future developer, intern, or officer
can pick up this project using these files.

---

## The Four Agents

| Agent | File | Best Used For |
|-------|------|---------------|
| **PM Agent** | `agents/PM_AGENT.md` | Sprint planning, feature decisions, roadmap, handover docs |
| **QA Agent** | `agents/QA_AGENT.md` | Test cases, bug triage, pre-demo QA checklist |
| **Dev Onboarding Agent** | `agents/DEV_ONBOARDING_AGENT.md` | Explaining the codebase to new devs, architecture walkthroughs |
| **Security Auditor Agent** | `agents/SECURITY_AGENT.md` | OWASP pen testing, security headers, RLS audit |

---

## How to Invoke an Agent in Claude Code

At the start of a Claude Code session, paste this command:

```
Read the file agents/PM_AGENT.md and act as the DEVCON+ Product Manager Agent
for this session. Confirm you've loaded the context before we begin.
```

Replace `PM_AGENT.md` with whichever agent you need.

You can also chain agents in one session:

```
Read agents/QA_AGENT.md. I need you to write test cases for the QR check-in flow,
then switch to agents/PM_AGENT.md to help me update the remaining MVP checklist.
```

---

## Project Context Summary (Shared Across All Agents)

### Stack (current — see CLAUDE.md for full detail)
- React 19 + Vite 7 + TypeScript (strict)
- Tailwind CSS v3 + framer-motion
- **Auth: Firebase Auth** (Google OAuth + email/password) — Supabase Auth was cut
- **Backend: NestJS gateway (`server/`)** — frontend calls it via `apiFetch`/`publicFetch`;
  direct `supabase-js` survives only for a few legacy paths via a short-lived bridge JWT
- Supabase Postgres (DB) + a small set of Edge Functions (QR check-in flow)
- Zustand v5 for state, React Hook Form + Zod for forms
- Font: **Proxima Nova** (self-hosted woff2, 6 weights — `font-proxima` / `font-sans`)
- MD3 type scale: 15 `text-md3-*` tokens in `tailwind.config.js`
- Frontend deployed on Vercel → https://devcon.plus · Backend on EC2 + nginx → https://api.devcon.plus

### Codebase Location
```
devcon-plus/
├── web/                  ← ALL UI lives here (member + organizer + admin); DB types in web/src/types/
├── server/               ← NestJS gateway (primary backend)
└── supabase/functions/   ← Edge functions (QR check-in + a few legacy paths)
```
> `apps/` and `packages/` directories, if present locally, are untracked leftovers from an
> earlier Turbo-monorepo layout — not the live code.

### Roles
- `member` — standard user (register, earn points, browse jobs, request upgrade)
- `chapter_officer` — create events, approve registrations, scan QR at door
- `hq_admin` — manage rewards, manage all chapters, review upgrade requests
- `super_admin` — full access, kiosk

### Key Deadlines
| Date | Milestone |
|------|-----------|
| April 4 | Week 1 complete (auth, cleanup, security foundations) |
| April 11 | Week 2 complete (infra, admin UX, input security) |
| April 18 | Week 3 complete (QR system, value-added features) |
| April 26 | Week 4 complete — **Claude Code ends** |
| April 30 | **Cohort 3 Graduation.** Stabilization complete. No new features. |
| May 15 | **Public preview. Dev B presents.** |

### Non-Negotiables
1. Auth: Google OAuth + Email/Password only. Apple Sign-In is permanently out of scope.
2. Mobile-first: 390px viewport is the primary target. On desktop (md+), layouts switch
   to sidebar + main card. `<DesktopGuard />` is a **pass-through no-op** — it no longer
   blocks desktop. Do not reintroduce a desktop block.
3. TypeScript strict: no `any`, no `@ts-ignore`
4. No dead navigation: every route resolves to content or `<ComingSoonModal />`
5. Primary color: always `bg-primary` / `text-primary` (CSS var). Never hardcoded hex.
6. Supabase is live: always use real client, never mock data in production code.
7. **`spendable_points`** — NOT `total_points`. The field was renamed in v1.4.
   `total_points` no longer exists on the `profiles` table.

### What's Already Done (as of April 15, 2026)
- Full auth flow (SignIn, SignUp, Google OAuth, OrganizerCodeGate, password reset)
- All member screens (Dashboard, Events, Jobs, Points, Rewards, Profile)
- All organizer screens (Dashboard, EventCreate/Edit, QRScanner, RewardsManagement)
- Full admin panel (Users, OrgCodes, Chapters, Events, CMS/Upgrades, Kiosk)
- All Supabase stores wired to live DB (auth, events, jobs, news, points, rewards,
  notifications, volunteers, org-volunteers, referrals, theme)
- In-app organizer upgrade flow (`organizer_upgrade_requests` + admin review)
- `event_announcements` table + `<SendAnnouncementSheet />` component
- Volunteer system end-to-end (member apply + organizer approval queue)
- All 4 Edge Functions + `generate-user-qr` deployed with QR token kinds `r` / `u` / `p`
- `checked_in` atomic update on `event_registrations` (double-award prevention)
- `username` field on profiles — unique, set on sign-up
- Per-event theme overrides via `devcon_category` + `lib/eventTheme.ts`
- Realtime recovery pattern (visibilitychange + online + 5-min poll) in all layouts
- CSP headers enforced, RLS policies applied, rate limiting on all endpoints
- 17+ DB migrations applied
- Responsive layouts (mobile pill nav + desktop sidebar for both MemberLayout and OrganizerLayout)
- **Proxima Nova** font migration (self-hosted woff2, 6 weights — replaces Geist)
- **MD3 type scale** — 15 `text-md3-*` tokens added to `tailwind.config.js` + applied across all UI components (PR #6)
- **Form draft persistence** — `useFormDraft` hook (localStorage/sessionStorage) wired to sign-in, sign-up, event create/edit, volunteer form, custom registration fields
- **5th program theme: purple** (`#7C3AED` / `#6D28D9`) added to theme system
- Cloudflare Turnstile CAPTCHA on auth forms (commit 9ca7272)
- XP Tier System — milestone definitions + progress bar wired to lifetime_points
- `/qr` MyQR page + `generate-user-qr` edge function deployed
- PWA manifest — icons 192/512/maskable, shortcuts, apple-touch-icon
- Custom event registration fields — modular form schema + DB migration
- Missions System — basic gamified missions flow
- Event URL slugs — /events/:slug (human-readable) replacing /events/:uuid

### What's Still Open (as of April 15, 2026 — Week 3)
- [ ] Remove all test accounts from production Supabase — **Kenshin** (ongoing)
- [x] Easter eggs — Konami restricted to hq_admin/super_admin only (commit c8d926d) ✅
- [ ] PROMOTED badge audit on live Supabase data (Sui Foundation + 2nd Tech news post) — **Kenshin**
- [ ] Final end-to-end QA pass on all flows — **Kenshin**
- [ ] Google OAuth (Task 4) — credentials + callback URL for `plus.devcon.com` — **Kenshin**
- [ ] Add `plus.devcon.com` to Edge Function CORS allowlist — **Kenshin**
- [ ] DNS + Cloudflare setup for `plus.devcon.com` — **Kenshin**
- [~] Email SMTP (Resend) — edge function deployed Apr 6; end-to-end test still pending — **Kenshin**
- [~] DB connection resilience — hardening applied; verify fix holds — **Kenshin**
- [ ] Documentation: README, FEATURES, API, SECURITY, HANDOVER (all due April 26) — **Kenshin**

---

## Audience Notes

Agents must adapt their language to the audience:

| Audience | Language Style |
|----------|---------------|
| **Claude Code** | Precise, structured, code-aware instructions |
| **Dev A (Kenshin)** | Explain what and why. Working code > abstract patterns. Diagnose before rewriting. |
| **Dev B (Kien)** | Plain English. No backend jargon. He needs to understand flows, not schema. |
| **DEVCON HQ** | Business outcomes. No technical terms unless explained. |
| **Future interns** | Assume zero prior context. Step-by-step. Link to actual files. |
