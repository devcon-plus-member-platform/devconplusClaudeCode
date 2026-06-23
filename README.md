# DEVCON+ — Developer Setup Guide

> **Last Updated:** June 21, 2026 · **Version:** MVP 1.8
> **Tagline:** Sync. Support. Succeed.
> Platform for DEVCON Philippines — 11 chapters, 60,000+ members.
>
> **Live app (production):** https://devcon.plus  (beta + `plus-beta.devcon.ph` 301-redirect here; staging: `staging.devcon.plus`)
> **Backend API:** https://api.cloud-engineer.dev  (NestJS gateway — self-hosted EC2 + nginx)
> **Repo:** https://github.com/rocketwolf98/devconplusClaudeCode

> **⚠️ Architecture note (June 2026):** This is now a **two-app** repo — a React frontend in `web/` **and** a
> NestJS gateway in `server/`. Auth is **Firebase** (Google + email/password), the frontend talks to the
> gateway over HTTP (`apiFetch`/`publicFetch`), and Realtime is best-effort (polling-first). Older docs
> describing an `apps/member/` Turbo monorepo, `--legacy-peer-deps`, or pure-Supabase auth are out of date.

---

## Quick Start for AI (Claude Code / Gemini CLI)

> **Tool split:** Use **Claude Code** for implementation (logic, stores, Supabase, TypeScript). For UI/UX design from Figma, **Gemini CLI is preferred** — both tools support the Figma MCP, but developer observation shows Claude Code does not capture Figma elements accurately. See Section 15 for the full MCP and tool guide.
> **Access note:** Gemini CLI requires organizational Gemini access not provisioned to DEVCON Philippines by default. If unavailable, Claude Code + Figma MCP is the fallback (with known element-capture limitations). See Section 15.

If you are a new AI instance picking up this codebase, read these files **in order** before generating a single line of code:

| Priority | File | Why |
|----------|------|-----|
| 1 | [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | The law. DB schema, routes, every design decision. Non-negotiable rules in Section 0. |
| 2 | [`.claude/context/HANDOVER.md`](.claude/context/HANDOVER.md) | Current state, L1 blockers, what the last team left and why. |
| 3 | [`.claude/rules/vercel-build-safety.md`](.claude/rules/vercel-build-safety.md) | Vercel exits code 2 if TypeScript fails. Know what breaks before you write. |
| 4 | [`.claude/rules/db-connection-resilience.md`](.claude/rules/db-connection-resilience.md) | Required pattern for every layout + Realtime store. Non-negotiable. |
| 5 | [`PRD.md`](PRD.md) | Product context, user stories, KPIs. Read before touching UI. |

**Facts every AI session must have:**
- The repo is **two apps**: `web/` (React + Vite frontend) and `server/` (NestJS gateway). No root workspace/Turbo.
- **Auth is Firebase** (Google OAuth + email/password). Supabase Auth was cut. No Apple Sign-In.
- Data goes through the **NestJS gateway** via `apiFetch`/`publicFetch` (`web/src/lib/api.ts`). Don't add direct `supabase.from(...)` calls — direct `supabase-js` survives only on a legacy bridge-JWT path being retired.
- **Realtime is best-effort / polling-first.** `recover()` refetches on visibility/online/60 s; `subscribeToChanges` is a no-op for most stores. See `.claude/rules/db-connection-resilience.md`.
- Install with **plain `npm install`** per app — React 19 is pinned via `overrides`. `--legacy-peer-deps` is no longer needed.
- Font is **Proxima Nova** (self-hosted woff2). Tailwind: `font-proxima` / `font-sans`. Not Geist, not Inter.
- Icons are **`solar-icon-set` outline variant only**. Never `lucide-react`, never emoji in JSX.
- Color system is CSS-custom-property driven. Always `text-primary`/`bg-primary`. Never hardcode hex for primary.
- Tailwind slate scale has **no 600 or 800** — use 500 or 700.
- `<DesktopGuard />` is a **pass-through no-op** — it renders children directly. The layouts handle responsiveness.
- `spendable_points` ≠ `total_points`. The field was renamed. `total_points` does not exist in the live DB.
- Run `npm run typecheck` before every commit — the Vite dev server does NOT catch TypeScript errors that fail the Vercel build.

---

## Prerequisites

| Tool | Required Version |
|------|-----------------|
| Node.js | **v20.x** (LTS) |
| npm | v10+ (comes with Node) |
| Git | any recent version |

> **Windows users:** Use **Git Bash** or **WSL** — not Command Prompt or PowerShell.

---

## 1. Clone and Install

Each app installs independently — there is no root `package.json`/workspace.

```bash
git clone https://github.com/rocketwolf98/devconplusClaudeCode
cd devconplusClaudeCode

cd web && npm install        # frontend (React 19 pinned via `overrides` — no flags needed)
cd ../server && npm install  # backend gateway (NestJS)
```

> Plain `npm install` works — `web/package.json` uses `overrides` to resolve the React 19 peer graph.
> `--legacy-peer-deps` is **no longer needed**.

---

## 2. Environment Setup

You need two env files (both gitignored — never commit). Ask the team lead for the values.

**`web/.env.local`** (frontend — see [`web/.env.example`](web/.env.example)):

```env
# Supabase (bridge-JWT path; anon key is public-by-design)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
# Auth
VITE_GOOGLE_CLIENT_ID=<gcp-oauth-client-id>
VITE_TURNSTILE_SITE_KEY=<turnstile-site-key>
# Firebase Auth (web config — public identifiers, not secrets)
VITE_FIREBASE_API_KEY=<firebase-web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<firebase-project-id>
VITE_FIREBASE_APP_ID=<firebase-app-id>
# App + backend
VITE_APP_ENV=development
VITE_ALLOW_INDEXING=          # "true" only on production; unset on staging → robots.txt Disallow
VITE_API_URL=http://localhost:8000
```

**`server/.env`** (NestJS gateway — see [`server/.env.example`](server/.env.example)): includes
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `FIREBASE_WEB_API_KEY`,
`FIREBASE_SERVICE_ACCOUNT_JSON`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, `EMAIL_VERIFICATION_SECRET`,
`QR_JWT_SECRET`, `CORS_ORIGIN`, `APP_URL`/`SERVER_URL`, and optional Upstash Redis keys.

> Without `web/.env.local`, the app can't reach the backend or Firebase and you'll get a blank screen / auth errors.

---

## 3. Running the App

Run the two apps in separate terminals:

```bash
# Terminal 1 — frontend (Vite, port 5173)
cd web && npm run dev

# Terminal 2 — backend gateway (NestJS, port 8000)
cd server && npm run dev
```

Frontend opens at [http://localhost:5173](http://localhost:5173); the API runs at `http://localhost:8000`
(set `VITE_API_URL` to match). For frontend-only work you can point `VITE_API_URL` at the deployed staging
API (`https://api.cloud-engineer.dev`) and skip running `server/` locally.

Open Chrome DevTools → Toggle Device Toolbar (`Ctrl+Shift+M`) → set width to **390px**. The app is designed for 390px mobile. Desktop gets a sidebar layout automatically at `md` breakpoint.

---

## 4. Login

The app uses real Supabase auth hitting the **live production database**. Create an account on the sign-up screen, or ask the team lead for a test account.

### Member flow

Sign up at `/sign-up` with any email + password. Creates a real Supabase account with `member` role.

### Organizer flow

The sign-up organizer-code gate is **temporarily disabled**. To become an organizer, request an upgrade in-app (Profile → Request Organizer Access) with a valid code from the `organizer_codes` table, or have an admin set your `role`. Officers/admins are routed to `/organizer`.

### Admin flow (`/admin`)

Requires `hq_admin` or `super_admin` role. Either use an existing admin account or ask the team lead to promote your account in the Supabase dashboard (`profiles` table → set `role = 'hq_admin'`).

> The **Kiosk** page (`/admin/kiosk`) is only visible to `super_admin` accounts.

---

## 5. App Structure

The frontend (`web/`) contains three distinct user experiences in **one React app**, backed by the NestJS gateway (`server/`):

| Layout | Route Prefix | Guard | Nav Style |
|--------|-------------|-------|-----------|
| `MemberLayout` | `/home`, `/events/*`, `/jobs/*`, `/points/*`, `/rewards`, `/qr`, `/profile/*` | Auth | Floating pill nav (mobile) + primary sidebar (desktop) |
| `OrganizerLayout` | `/organizer/*` | Role: officer/admin | Floating pill nav (mobile) + blue sidebar (desktop) |
| `AdminLayout` | `/admin/*` | Role: hq_admin/super_admin | Desktop-only sidebar |

> **Never mix layout components between route trees.** Shared utility components (`<ComingSoonModal />`, `<Skeleton />`, `<StatusPill />`) are safe; layout shells are not.

### Repository layout

```
devcon-plus/
├── web/                            React + Vite frontend (@devcon-plus/web)
│   ├── src/
│   │   ├── router.tsx              All routes — the map of the app
│   │   ├── components/             MemberLayout, OrganizerLayout, AdminLayout, shared UI
│   │   ├── pages/                  member/, organizer/, admin/, auth/
│   │   ├── stores/                 Zustand stores (one per domain) — fetch via lib/api.ts
│   │   ├── lib/                    api.ts (apiFetch/publicFetch), firebase.ts, authBridge.ts,
│   │   │                           supabase.ts (bridge-JWT only), animation.ts, eventTheme.ts
│   │   ├── hooks/                  useFormDraft.ts, useRecoverOnFocus.ts (polling recovery)
│   │   └── types/                  types.ts + generated database.types.ts (@devcon-plus/supabase alias)
│   ├── tailwind.config.js          Design tokens + MD3 type scale
│   ├── vite.config.ts              Build + robots.txt generator (VITE_ALLOW_INDEXING)
│   └── vercel.json                 Deploy config + security headers (CSP/HSTS/...)
├── server/                         NestJS gateway (@devcon-plus/server) → EC2 + nginx
│   └── src/                        modules: auth, users, events, points, registrations, rewards,
│                                   missions, volunteers, qr, upgrades, admin, news, jobs,
│                                   chapters, interests, announcements, referrals, email
├── supabase/
│   ├── functions/                  Edge Functions (Deno)
│   └── migrations/                 SQL migrations (apply in order)
└── docs/                           auth/* (Firebase + bridge JWT), migration-plans/*
```

> `apps/` and `packages/` may exist locally but are **untracked leftovers** from the old Turbo layout — ignore them.

---

## 6. Design System Essentials

### Program Themes (5 total)

Users can switch their app theme from the Profile screen. The primary color drives all `bg-primary`, `text-primary`, and shadow tokens.

| Theme | id | Primary | Dark |
|-------|----|---------|------|
| DEVCON+ (default) | `devcon` | `#1152D4` | `#0D42AA` |
| She is DEVCON | `she` | `#BE185D` | `#9D174D` |
| DEVCON Kids | `kids` | `#059669` | `#047857` |
| Campus | `campus` | `#D97706` | `#B45309` |
| DEVCON Purple | `purple` | `#7C3AED` | `#6D28D9` |

Persisted via `useThemeStore` → localStorage key `devcon-theme`.

### Typography

Two-tier type system — both are valid, MD3 preferred for new work:

| Tier | Tokens | Use For |
|------|--------|---------|
| **MD3** (preferred, new components) | `text-md3-title-lg`, `text-md3-body-md`, `text-md3-label-md`, etc. (15 tokens) | New components |
| **Legacy** (existing components) | `text-sm`, `text-xs`, `text-base`, `text-3xl` | Do not migrate unless reworking |

### Color Reference

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | CSS var (theme-driven) | Buttons, active nav, headers |
| `blue` | `#1152D4` | Non-themed DEVCON blue alias |
| `navy` | `#1E2A56` | Dark text, indicator dots |
| `gold` | `#F8C630` | XP bar fill, star icon |
| `promoted` | `#F97316` | PROMOTED badge **only** |
| `green` | `#21C45D` | Positive XP, success states |
| `red` | `#EF4444` | Error, sign out |
| `slate-*` | — | 50/100/200/300/400/500/700/900 only — **no 600 or 800** |

### Animation

All framer-motion variants live in [`web/src/lib/animation.ts`](web/src/lib/animation.ts). **Never redefine inline.**

```ts
import { fadeUp, staggerContainer, cardItem } from '@/lib/animation'
// Stagger animate key is "visible" — never "show"
```

### Icon Rule

```tsx
// Always solar-icon-set outline variant — no lucide-react, no emoji
import { HomeOutline } from 'solar-icon-set'

// ❌ WRONG — solar-icon-set ignores text-* classes (no currentColor)
<HomeOutline className="text-primary w-5 h-5" />

// ✅ CORRECT — use the color prop directly
<HomeOutline color="rgb(var(--color-primary))" width={20} height={20} />

// ✅ CORRECT — in a colored container:
<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
  <HomeOutline color="rgb(var(--color-primary))" width={20} height={20} />
</div>

// ✅ Inactive nav icon (slate-400):
<HomeOutline color="#94A3B8" width={20} height={20} />
```

> See [`.claude/rules/solar-icon-styling.md`](.claude/rules/solar-icon-styling.md) — `text-*` classes silently do nothing on solar icons.

---

## 7. Non-Negotiable Rules

These rules are enforced by CLAUDE.md Section 0. Violating them breaks the product contract.

1. **No Apple Sign-In** — Google OAuth + email/password only
2. **No placeholder text** — use `<ComingSoonModal />` for incomplete features
3. **No dead-end navigation** — every route renders content
4. **2nd job listing + 2nd Tech news post** always get an orange `PROMOTED` badge
5. **TypeScript strict mode** — no `any`, no `@ts-ignore` without explanation
6. **Forms** use React Hook Form + Zod — no uncontrolled inputs
7. **Primary color** — always `text-primary` / `bg-primary`, never hardcode hex for primary
8. **Icons** — `solar-icon-set` outline variant only, no emoji in JSX
9. **Data through the NestJS gateway** — use `apiFetch`/`publicFetch` (`web/src/lib/api.ts`); no new direct `supabase.from(...)`/`supabase.rpc(...)` in components or stores (direct `supabase-js` is legacy bridge-JWT, being retired). `MOCK_*` exports in `web/src/types/mock/` are reference-only — never import in production
10. **Polling-first recovery** — app correctness must not depend on Realtime. `recover()` (HTTP refetch) runs on `visibilitychange`, `online`, a 60-second interval, and auth-change; there is **no `resubscribe()`** and `subscribeToChanges` is a no-op for most stores. Realtime is best-effort only. See `.claude/rules/db-connection-resilience.md`
11. **Use Gemini CLI for Figma MCP design tasks** — do not guess or approximate Figma specs in Claude Code; use Gemini CLI to inspect frames and extract tokens directly from the source file

---

## 8. Build + Typecheck

```bash
# Frontend (web/) — mirrors Vercel's exact build command
cd web && npm run typecheck   # tsc -b --noEmit
cd web && npm run build       # tsc -b && vite build  → web/dist/

# Backend (server/)
cd server && npm run typecheck # tsc --noEmit
cd server && npm run build     # nest build → server/dist/
```

> **Critical:** The Vite dev server is lenient with TypeScript. `tsc -b` enforces `noUnusedLocals`, `noUnusedParameters`, and `strictNullChecks`. Always run `typecheck` before pushing — Vercel exits with code 2 on any TS error, aborting the frontend deploy.

---

## 9. After Any Database Schema Change

```bash
# Regenerate TypeScript types from the live DB
supabase gen types typescript --project-id <project-ref> \
  > web/src/types/database.types.ts

# Verify downstream consumers still build
cd web && npm run typecheck && npm run build
```

---

## 10. Deploying Edge Functions

```bash
supabase functions deploy generate-qr-token
supabase functions deploy generate-user-qr
supabase functions deploy generate-pending-qr
supabase functions deploy award-points-on-scan
supabase functions deploy approve-at-door
supabase functions deploy check-rate-limit
supabase functions deploy send-email
supabase functions deploy delete-user

# After changing the CORS allowlist (in each function / _shared), redeploy ALL functions.
```

> Most data now flows through the NestJS gateway (`/api/*`); the QR generate/scan paths are also exposed at
> `/api/qr/*`. The edge functions above remain for QR, email, rate-limit, and account-deletion.

---

## 11. Deployment

**Frontend (Vercel).** Every push to `master` triggers an automatic production deploy of `web/`.

| Project | Root Directory | Build Command | Output |
|---------|---------------|---------------|--------|
| Web app | `web` | `tsc -b && vite build` | `dist` |

Env vars are set in Vercel project Settings → Environment Variables. Production sets `VITE_ALLOW_INDEXING=true`
(emits `robots.txt` `Allow: /`); staging leaves it unset (`Disallow: /`).

**Backend (`server/`).** The NestJS gateway is **self-hosted on EC2 behind nginx** at
`https://api.cloud-engineer.dev` (not Vercel). Deploy/restart the Node process there and set the
`server/.env` values in that environment. nginx terminates TLS and sets edge security headers.

---

## 12. Common Issues & Gotchas

| Symptom | Cause | Fix |
|---------|-------|-----|
| `npm install` peer warnings | React 19 peer graph | Harmless — `web/package.json` `overrides` pins it. Don't add `--legacy-peer-deps` |
| Blank screen / auth errors | Missing `web/.env.local` or backend unreachable | Get credentials from team lead; check `VITE_API_URL` points at a running gateway |
| Organizer pages redirect away | Account needs officer role | Enter organizer code at sign-up, or ask team lead to update `role` in `profiles` |
| Admin pages redirect away | Account needs `hq_admin` role | Ask team lead to update `role` in Supabase |
| TypeScript errors after pull | New package added | Re-run `npm install` in the affected app (`web/` and/or `server/`) |
| QR scanner "camera not available" | Requires HTTPS or localhost | Use `localhost:5173` — works on Chrome desktop and Android |
| Vercel build exits code 2 | TypeScript error (unused import, param, etc.) | Run `npm run typecheck` locally and fix before pushing |
| Stale UI after device sleep | Recovery poll didn't fire | Check `recover()` runs on visibility/online/60 s in the layout — see `.claude/rules/db-connection-resilience.md` (polling-first; realtime is best-effort) |
| `total_points` TS error | Field was renamed | Use `spendable_points` for redeemable balance, `lifetime_points` for tiers |
| CSS primary color wrong | Theme not applied | Check `useThemeStore` is mounted; verify `MemberLayout` injects CSS vars on mount |
| Cloudflare DNS blocking SSL | Orange-cloud proxy enabled | Set DNS records to "DNS only" (grey cloud) for Vercel CNAME + Resend DKIM |

---

## 13. Credentials & Access

| Credential | Where used | Who to ask |
|-----------|-----------|------------|
| Supabase URL + anon key | `.env.local` | Kenshin (outgoing lead) |
| Supabase service role key | `supabase/.env` | Kenshin |
| Google OAuth client ID | `.env.local` | Kenshin |
| Vercel project access | Deployment, env vars | Kenshin |
| GCP Console access | OAuth redirect URI config | Kenshin |
| Resend account | Email domain verification | DEVCON HQ IT officer |
| Cloudflare DNS panel (`devcon.ph`) | Custom domain + email DNS | DEVCON HQ IT officer |

> Never commit secrets. `.env.local` and `supabase/.env` are gitignored.

---

## 14. Reference Documents

| Document | Location | Focus |
|----------|----------|-------|
| Master architecture + DB schema | [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | The authoritative technical reference |
| Developer handover + status | [`.claude/context/HANDOVER.md`](.claude/context/HANDOVER.md) | L1/L2 items, credentials, knowledge transfer |
| PRD + product context | [`PRD.md`](PRD.md) | User stories, KPIs, milestones |
| Domain + email setup | [`.claude/docs/DOMAIN_AND_EMAIL_SETUP.md`](.claude/docs/DOMAIN_AND_EMAIL_SETUP.md) | Step-by-step DNS, Supabase, GCP config |
| DB connection resilience | [`.claude/rules/db-connection-resilience.md`](.claude/rules/db-connection-resilience.md) | Realtime recovery pattern |
| Vercel build safety | [`.claude/rules/vercel-build-safety.md`](.claude/rules/vercel-build-safety.md) | TS flags that cause deploy failures |
| Agentic workflows | [`.claude/context/agentic-workflows.md`](.claude/context/agentic-workflows.md) | Claude Code workflows + Skill 6 (Figma MCP design via Gemini CLI) |
| Context anchor | [`.claude/context/memory.md`](.claude/context/memory.md) | Decision log, architecture evolution, state of play |
| Auth architecture | [`docs/auth/`](docs/auth/) | Firebase auth, the Supabase bridge JWT, flows, edge-function auth, troubleshooting |

---

## 15. AI Tool Recommendations & MCP Setup

### Tool Clarifications

| Claim | Reality |
|-------|---------|
| "Claude Code cannot use Figma MCP" | **False.** Claude Code has **native Figma MCP** built into claude.ai sessions — tools include `get_design_context`, `get_screenshot`, `get_metadata`, and more. No `.mcp.json` config needed. However, per developer observation, element capture is often inaccurate. Gemini CLI produces better results. |
| "Figma MCP requires payment" | **Partially true.** The Figma MCP server itself is **free**. However, **Figma Dev Mode** — which passes precise layout specs, CSS values, and component context to the model — requires a **paid Figma plan**. Without Dev Mode, accuracy suffers for both Claude Code and Gemini CLI. |
| "Gemini CLI is always available" | **False.** Gemini CLI requires organizational Google/Gemini access. **DEVCON Philippines does not have this provisioned by default.** Confirm with the team lead before using it. |

### Recommended MCPs

MCPs (Model Context Protocol servers) automate common workflows by giving the AI direct access to external services. These three are recommended for this project:

| MCP | Status | Cost | What it enables |
|-----|--------|------|-----------------|
| **Supabase MCP** | Configured in `.mcp.json` | Free | Schema inspection, query execution, migration assistance directly from the AI session |
| **Figma MCP** (claude.ai native) | Built into claude.ai/code sessions | Free (Dev Mode needs paid Figma plan) | Available without any setup — `get_design_context`, `get_screenshot`, `get_metadata`, etc. Per developer observation: element capture accuracy is limited. |
| **Figma MCP** (local server) | Not configured in `.mcp.json` | Free (Dev Mode needs paid Figma plan) | Local Figma MCP server — alternative to the native integration. Requires a Figma PAT. |
| **Vercel MCP** | Not configured in `.mcp.json` | Free | Trigger deploys, check build logs, inspect env vars, manage project settings from the AI session |

To add the local Figma MCP server or Vercel MCP, append to [`.mcp.json`](.mcp.json):

```json
"figma": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "figma-mcp"],
  "env": { "FIGMA_API_KEY": "<your-figma-personal-access-token>" }
},
"vercel": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@vercel/mcp-adapter"],
  "env": { "VERCEL_TOKEN": "<your-vercel-token>" }
}
```

> Figma personal access tokens: Figma → Account Settings → Personal Access Tokens.
> Dev Mode requires the file owner to have a paid Figma plan (Professional or Organization).

> **Note (April 21, 2026):** Claude Code (claude.ai/code) already has Figma MCP built in — no token or `.mcp.json` entry is needed. The local Figma MCP server in `.mcp.json` is only needed for non-claude.ai environments or automated pipelines.

### AI Tool Decision Table

| Task | Best tool | Notes |
|------|-----------|-------|
| Implement features, fix bugs, wire stores | **Claude Code** | Primary tool for all code work |
| Supabase schema, Edge Functions, RLS | **Claude Code + Supabase MCP** | Supabase MCP already configured in `.mcp.json` |
| Vercel deploys, build inspection | **Claude Code + Vercel MCP** | Add Vercel MCP to `.mcp.json` first |
| UI/UX design from Figma *(Gemini CLI available)* | **Gemini CLI + Figma MCP** | Best accuracy for element capture |
| UI/UX design from Figma *(no Gemini access)* | **Claude Code + Figma MCP** | Works but element capture is less accurate; use Figma Inspect panel to supplement |
| UI/UX design *(no MCP at all)* | **Claude Code + human Figma Inspect** | Manual — human copies values from Figma Inspect panel into the AI session |

### Figma MCP Workflow *(Gemini CLI + Dev Mode — highest accuracy)*

```
1. Gemini CLI  — open Figma frame via MCP, extract layout / colors / spacing / typography
2. Gemini CLI  — generate React + Tailwind skeleton using project MD3 tokens
3. Claude Code — replace any hardcoded values with correct Tailwind/CSS-var tokens
4. Claude Code — wire real store data, add framer-motion variants, solar icons (color prop)
5. Gemini CLI  — compare finished component to Figma frame for fidelity check
6. Claude Code — npm run typecheck && npm run build
```

### Fallback Workflow *(no Gemini CLI — Claude Code + Figma MCP or manual)*

```
1. Claude Code — connect Figma MCP, read the frame (note: element capture may be inaccurate)
   OR Human    — open Figma in browser, copy values from Inspect panel manually
2. Claude Code — map extracted values to project tokens (no hardcoded hex, no magic px)
3. Claude Code — build component with framer-motion variants, solar icons (color prop), CSS vars
4. Human       — visually compare rendered component at 390px against Figma frame
5. Claude Code — npm run typecheck && npm run build
```

> Full workflow + checklist: [`.claude/context/agentic-workflows.md`](.claude/context/agentic-workflows.md) — Skill 6: `FigmaMCPDesign`.

---

*DEVCON Philippines · React 19 + Vite 7 (web/) · NestJS 10 (server/) · Firebase Auth · Supabase · Vercel + EC2*
*MVP 1.8 · Last updated June 21, 2026 · Live at https://devcon.plus*
