# DEVCON+ — Claude Code Master Context File
> Last Updated: June 21, 2026
> Version: MVP 1.8 (post-launch hardening — Firebase auth + NestJS gateway migration)
> Team: DEVCON Jumpstart interns + Claude Code
> Status: MVP shipped & live; in post-launch hardening (auth migration, security audit, resilience)
> Live App (production): https://devcon.plus
>   ↳ `devconplusbeta-v1.vercel.app` and `plus-beta.devcon.ph` 301-redirect here. Staging: https://staging.devcon.plus (noindex)
> Backend API: https://api.devcon.plus  (NestJS gateway, self-hosted EC2 + nginx)
> Lovable Prototype (UX Reference ONLY): https://devconplusrndprototype.lovable.app/onboarding

> **⚠️ Architecture has shifted since MVP 1.7.** DEVCON+ is no longer a pure-Supabase, no-backend app.
> Authentication is now **Firebase Auth** (Google OAuth + email/password), the frontend talks to a
> **NestJS gateway** (`server/`) over HTTP (`apiFetch`/`publicFetch`), and Realtime is **best-effort
> only** (polling-first recovery). Direct `supabase-js` access survives only via a short-lived
> **bridge JWT** and is being retired (migration "Phase 7"). Read Sections 3, 10–12, and 15 before
> assuming the old model. See `.claude/rules/db-connection-resilience.md` for the realtime rule.

---

## 0. CRITICAL RULES FOR CLAUDE CODE

These rules are non-negotiable. Read before generating anything.

1. **Never generate Apple Sign-In code.** Auth is Google OAuth + Email/Password only, via **Firebase Auth** (the NestJS gateway verifies Firebase ID tokens + `email_verified`). Supabase Auth was cut in migration `20260531_phase4_cut_supabase_auth.sql`.
2. **Never mix emoji and images in the same section.** Pick one per screen/section and be consistent.
3. **Never leave placeholder text.** No `"________"`, `"Lorem ipsum"`, or empty strings — use a `<ComingSoonModal />` component for incomplete features instead.
4. **Never create dead-end navigation.** Every tap must resolve to content or a `ComingSoonModal`.
5. **Always pre-fill registration forms** from the authenticated Supabase user's profile data.
6. **Always use TypeScript strict mode.** No `any` types.
7. **The Member App and Organizer flow share ONE frontend codebase** (`web/`) but use separate layouts and route trees. Member routes are under `MemberLayout`. Organizer routes are under `OrganizerLayout` at `/organizer/*`. Admin routes are under `AdminLayout` at `/admin/*`. Do not mix their components. The frontend is backed by a separate **NestJS gateway** in `server/` — components fetch data through it via `apiFetch`/`publicFetch`, not directly from Supabase.
8. **Jobs Board is manually seeded in Supabase for MVP.** No external API integration needed.
9. **Photos in onboarding are real chapter group photos** served from `public/photos/`. If assets are missing, use named gradient placeholders — never stock illustration components.
10. **The 2nd job listing and 2nd news post always get an orange `PROMOTED` badge.** This is a design mandate, not optional.
11. **The member app is a mobile-first web app** (React + Vite, not Expo). All UI must be designed for a 390px-wide mobile viewport. On desktop (md+), `MemberLayout` and `OrganizerLayout` switch to a sidebar + main card layout — they are fully responsive, not blocked. `<DesktopGuard />` is a pass-through no-op.
12. **Primary color is CSS-custom-property driven** (`rgb(var(--color-primary))`). Always use `text-primary`, `bg-primary`, etc. — not hardcoded hex. Only use `text-blue` / `bg-blue` when you explicitly need the non-themed DEVCON blue alias.
16. **Never use `lucide-react`.** The icon library is `solar-icon-set` (outline variant only). `solar-icon-set` icons do NOT respond to Tailwind `text-*` color classes — use the `color` prop instead: `<HomeOutline color="rgb(var(--color-primary))" />`.
17. **Never use Tailwind `slate-600` or `slate-800`.** These steps don't exist in the configured scale. Use `slate-500` or `slate-700`.
13. **Data goes through the NestJS gateway, not directly to Supabase.** Stores call the backend via `apiFetch()` (authenticated — injects the Firebase ID token) or `publicFetch()` (public reads), both in `web/src/lib/api.ts`. Direct `supabase-js` access (`web/src/lib/supabase.ts`) survives only for a few legacy paths via the **bridge JWT** and is being retired (migration "Phase 7") — **do not add new direct `supabase.from(...)` / `supabase.rpc(...)` calls in components or stores.** The `MOCK_*` exports in `web/src/types/mock/` are reference-only and unused. (See `.claude/rules/db-connection-resilience.md`.)
14. **Figma MCP: Claude Code supports it (native claude.ai integration — no setup needed) but captures elements poorly per developer observation. Gemini CLI is preferred when available.** Both tools can connect to Figma MCP. Claude Code has a built-in Figma integration via claude.ai (tools: `get_design_context`, `get_screenshot`, `get_metadata`, etc. — available in any claude.ai/code session without `.mcp.json` config). However, per developer observation, Claude Code does not read Figma elements accurately — layouts and tokens are often misread. Gemini CLI produces better design-to-code results. Use Gemini CLI for Figma work if access is provisioned; otherwise use Claude Code + Figma MCP with manual verification, or fall back to the human Figma Inspect panel method. **Figma MCP is free; Figma Dev Mode (recommended for accurate specs) requires a paid Figma plan.**
15. **MCPs are recommended for automated workflows.** Supabase MCP is already configured in `.mcp.json`. Figma MCP (local server) and Vercel MCP should be added when the corresponding tokens are available. Note: Figma MCP is also available natively in claude.ai sessions without any `.mcp.json` setup. See `README.md` Section 15 for setup instructions.

---

> **Addendum — Tool Recommendation & MCP Clarification (April 21, 2026)**
>
> **Figma MCP facts (as of April 21, 2026):**
> - Claude Code has **native Figma MCP** via claude.ai integration (tools: `get_design_context`, `get_screenshot`, `get_metadata`, etc.) — no `.mcp.json` config needed when running in a claude.ai/code session.
> - Per developer observation, Claude Code does not capture Figma elements accurately — layouts and tokens are often misread.
> - Gemini CLI is preferred for Figma design work — better element capture.
> - Gemini CLI requires organizational access not provisioned to DEVCON Philippines by default.
> - Figma MCP server is free. Figma Dev Mode (provides precise layout specs to the model) requires a paid Figma plan.
>
> **Recommended MCPs (add to `.mcp.json` for local/automated use):** Figma (local server), Supabase (already configured), Vercel.
> MCPs enable automated workflows: Supabase (schema/migrations), Figma (design-to-code), Vercel (deploy/build inspection).

---

## 1. PROJECT OVERVIEW

**DEVCON+** is the "Tech Community Unified Platform" for DEVCON Philippines — the country's largest volunteer tech community with 11 nationwide chapters, 60,000+ members, and 14,000+ annual attendees.

**Tagline:** Sync. Support. Succeed.

**What this platform does:**
- Mandatory event registration tool for all 100+ annual chapter events
- Gamified volunteer engagement via the Points+ system
- Global tech career opportunities for Filipino developers
- Chapter officer management layer (Organizer flow)

**UX Benchmark:** The nmblr+ app (reference photos — dashboard, events list, points history, profile screens). Pattern-match the layout, card style, navigation feel, and points display format exactly.

---

## 2. REPOSITORY STRUCTURE

Co-located independent apps (no npm workspace manager / Turbo at root — each app installs and builds on its own).

```
devcon-plus/
├── web/                     # React + Vite — mobile-first web app (self-contained, @devcon-plus/web)
│   │                        # Contains member UI, organizer UI, AND admin UI
│   │                        # (separate route trees: MemberLayout / OrganizerLayout / AdminLayout)
│   ├── src/                 # types live in web/src/types/ (alias @devcon-plus/supabase)
│   ├── public/
│   ├── package.json         # Frontend deps (framer-motion lives here; React 19 pinned via `overrides`)
│   ├── vercel.json          # Vercel deployment config + security headers (CSP/HSTS/...)
│   ├── .env.example
│   └── ...
├── server/                  # NestJS gateway (self-contained, @devcon-plus/server)
│   ├── src/                 # modules: auth, users, events, points, registrations, rewards,
│   │                        #          missions, volunteers, qr, upgrades, admin, news, jobs,
│   │                        #          chapters, interests, announcements, referrals, email
│   ├── package.json
│   ├── .env.example / .env.production.example
│   └── ...                  # Deployed to EC2 behind nginx → https://api.devcon.plus
├── supabase/                # Supabase CLI — migrations, Edge Functions, seed
└── docs/                    # auth/* docs, migration-plans/*
```

> **Heads-up:** `apps/` and `packages/` directories may exist locally but are **untracked build leftovers** from the old `apps/member` Turbo monorepo layout. They are NOT the live app — ignore them. The live, git-tracked code is `web/` + `server/` + `supabase/`.

---

## 3. TECH STACK


### Member App + Organizer UI (`web/`)
| Concern | Choice |
|---------|--------|
| Framework | **React 19** + **Vite 7** |
| Router | **React Router DOM v7** (flat `createBrowserRouter`) |
| Styling | **Tailwind CSS v3** |
| Animation | **framer-motion** (`web/` dependency) |
| State | **Zustand v5** |
| Forms | **React Hook Form v7** + **Zod** |
| Data access | **`apiFetch` / `publicFetch`** (`web/src/lib/api.ts`) → NestJS gateway over HTTP. `@supabase/supabase-js` is used only for legacy bridge-JWT paths (being retired) |
| QR Display | `qrcode.react` |
| QR Scanning | `@zxing/browser` + `@zxing/library` (lazy-loaded) |
| Icons | `solar-icon-set` outline variant (only — no emoji icons in JSX) |
| Auth | **Firebase Auth** (Google OAuth via popup + email/password). `firebase` web SDK on the client; Firebase Admin verifies ID tokens on the gateway |
| Language | TypeScript (strict) |
| Font | **Proxima Nova** (self-hosted woff2, 6 weights — loaded in `index.css`). Tailwind: `font-proxima` / `font-sans` |

> This is a **web app**, not React Native. There is no Expo, no NativeWind, no RN StyleSheet. All styling is plain Tailwind CSS classes.

### Backend Gateway (`server/`)
| Concern | Choice |
|---------|--------|
| Framework | **NestJS 10** (Express platform) |
| Runtime | Node 20, deployed on **EC2 behind nginx** → `https://api.devcon.plus` |
| Global prefix | `/api` (auth routes are at `/auth/*`, outside the prefix). Port `8000` |
| Auth | `AuthGuard` verifies the **Firebase ID token** (firebase-admin) + `email_verified` gate, then resolves the profile by `auth_uid`. `RolesGuard` + `@Roles()` enforce the role hierarchy `member < chapter_officer < hq_admin < super_admin` |
| Supabase access | `SupabaseService` uses the **service-role key** (bypasses RLS). `supabase-jwt.service.ts` mints the short-lived **bridge JWT** the browser uses for direct PostgREST |
| Caching / rate limit | **Upstash Redis** (REST) for profile cache + identity-keyed rate-limit buckets; global `ThrottlerGuard` (300 req/min/IP) |
| Email | `nodemailer` via Gmail SMTP (`GMAIL_USER`/`GMAIL_APP_PASSWORD`) — degrades gracefully if unset |
| Validation | global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) |

### Auth & Data Flow (current)
```
Firebase Auth (Google popup / email+password)
  → Firebase ID token
  → NestJS /auth/firebase/exchange (or /auth/refresh)
      → verifies token, resolves/links profile (auth_uid)
      → mints a Supabase "bridge JWT" (HS256, sub=profiles.id, role='authenticated', TTL 3600s)
  → web/src/lib/api.ts:
      • apiFetch()    → backend /api/* with `Authorization: Bearer <Firebase ID token>` (auto-refresh on 401)
      • publicFetch() → backend public GETs, no auth
  → web/src/lib/supabase.ts injects the bridge JWT on the few remaining direct PostgREST/Storage calls
```

> **Responsive layout:** `MemberLayout` and `OrganizerLayout` are fully responsive. On mobile (< md): floating pill bottom nav + full-screen scroll container. On desktop (md+): fixed sidebar (bg-primary / bg-blue) + main content card. `<DesktopGuard />` is now a pass-through component — it renders its children directly. All UI still targets 390px-wide as the primary viewport.

### Type Definitions (`web/src/types/`)
| File | Contents |
|------|----------|
| `types.ts` | Domain interfaces: Profile, Event, Job, Mission, etc. |
| `database.types.ts` | Generated Supabase DB types — regenerate via `supabase gen types typescript > web/src/types/database.types.ts` |
| `mock/` | Mock data (kept for reference, not used by the app) |

All imports use the `@devcon-plus/supabase` alias (configured in `vite.config.ts` + `tsconfig.app.json` → resolves to `web/src/types/`).

---

## 4. DATABASE SCHEMA

Run in order via `supabase db push` or Supabase SQL editor.

### `chapters`
```sql
CREATE TABLE chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  region text CHECK (region IN ('Luzon', 'Visayas', 'Mindanao')),
  created_at timestamptz DEFAULT now()
);
```

### `profiles`
```sql
CREATE TABLE profiles (
  id uuid REFERENCES auth.users PRIMARY KEY,
  full_name text NOT NULL,
  username text UNIQUE,                -- display handle, set on sign-up
  email text UNIQUE NOT NULL,
  school_or_company text,
  chapter_id uuid REFERENCES chapters(id) NOT NULL,
  role text CHECK (role IN ('member', 'chapter_officer', 'hq_admin', 'super_admin')) DEFAULT 'member',
  avatar_url text,
  spendable_points integer DEFAULT 0,  -- decremented on reward redemptions
  lifetime_points integer DEFAULT 0,   -- never decremented (for tier tracking)
  referral_code text UNIQUE,           -- used in referrals system
  pending_role text,                   -- set when organizer upgrade is pending review
  pending_chapter_id uuid REFERENCES chapters(id), -- target chapter for pending upgrade
  created_at timestamptz DEFAULT now()
);
```

> **Note:** The live DB uses `spendable_points` (not `total_points`) and `lifetime_points`. Generated types in `database.types.ts` reflect this.

### `organizer_codes`
```sql
CREATE TABLE organizer_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  chapter_id uuid REFERENCES chapters(id),   -- nullable; null = HQ-scope code
  program_id uuid REFERENCES programs(id),   -- optional program association
  assigned_role text CHECK (assigned_role IN ('chapter_officer', 'hq_admin')),
  is_active boolean DEFAULT true,
  usage_limit integer,                        -- null = unlimited
  usage_count integer DEFAULT 0,
  expires_at timestamptz,                     -- null = never
  scope_type text,                            -- 'chapter' | 'hq'
  created_at timestamptz DEFAULT now()
);
```

### `events`
```sql
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid REFERENCES chapters(id),
  title text NOT NULL,
  description text,
  location text,
  event_date timestamptz,
  end_date timestamptz,
  end_time time,                       -- event end time (separate from end_date)
  category text CHECK (category IN ('tech_talk','hackathon','workshop','brown_bag','summit','social','networking')),
  devcon_category text,                -- program theme override: 'devcon'|'she'|'kids'|'campus'
  tags text[] DEFAULT '{}',
  visibility text CHECK (visibility IN ('public','unlisted','draft')) DEFAULT 'public',
  privacy_status text,                 -- additional privacy field
  is_free boolean DEFAULT true,
  ticket_price integer DEFAULT 0,      -- alias for ticket_price_php
  ticket_price_php integer DEFAULT 0,
  capacity integer,                    -- null = unlimited
  points_value integer DEFAULT 100,
  volunteer_points integer DEFAULT 500,
  requires_approval boolean DEFAULT false,
  status text CHECK (status IN ('upcoming', 'ongoing', 'past')) DEFAULT 'upcoming',
  is_featured boolean DEFAULT false,
  is_promoted boolean DEFAULT false,
  cover_image_url text,
  is_external boolean DEFAULT false,           -- if true, registration is handled outside the platform
  external_registration_url text,              -- URL to external form/site; use 'tba' when URL is not yet known
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
```

> **`devcon_category`** drives per-event theme overrides via `getEventThemeStyle()` in `lib/eventTheme.ts`. When set, event pages override `--color-primary` / `--color-primary-dark` as inline styles (scoped to the page, not global state).

### `event_registrations`
```sql
CREATE TABLE event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id),
  user_id uuid REFERENCES profiles(id),
  status text CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  qr_code_token text UNIQUE,
  checked_in boolean DEFAULT false,    -- set to true atomically on first QR scan
  registered_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  UNIQUE(event_id, user_id)
);
```

> **Approval logic:** If `events.requires_approval = false` → auto-set status to `approved` and generate `qr_code_token` on insert via Edge Function. If `true` → status stays `pending` until an officer approves.
> **Double-award prevention:** `checked_in` is updated atomically (`false → true`). Concurrent scans will not double-award points.

### `event_announcements`
```sql
CREATE TABLE event_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) NOT NULL,
  organizer_id uuid REFERENCES profiles(id) NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```
Created by organizers via `<SendAnnouncementSheet />`.

### `point_transactions`
```sql
CREATE TABLE point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  amount integer NOT NULL,
  description text NOT NULL,
  transaction_ref text UNIQUE DEFAULT upper(substring(gen_random_uuid()::text, 1, 8)),
  source text CHECK (source IN (
    'signup', 'event_attendance', 'brown_bag',
    'speaking', 'content_like', 'content_share',
    'volunteering', 'redemption', 'bonus',
    'referral',                          -- added 20260318_rewards_engine
    'reset'                              -- added 20260708_reset_points_annual (annual June-24 reset rows)
  )),
  created_at timestamptz DEFAULT now()
);
```

> **Annual points reset (June 24, PHT).** Both `spendable_points` and `lifetime_points` reset to 0 for
> every profile once a year, at **June 24 00:00 Philippine time** (= June 23 16:00 UTC). Implemented as the
> `reset_points(p_user_id uuid DEFAULT NULL)` SECURITY DEFINER function (service_role-only) in migration
> `20260708_reset_points_annual.sql` — `NULL` resets all profiles, a uuid resets just one. It writes one
> `source='reset'` ledger row per member (both pre-reset balances captured in the description) for audit
> + undo. Scheduled via **pg_cron**: `cron.schedule('annual-points-reset', '0 16 23 6 *', $$SELECT reset_points()$$)`.
> The migration ships only the function/constraint/grant; the cron schedule is a manual go-live step.
> ⚠️ Because tiers/Prestige/theme-unlock all derive from `lifetime_points` (`web/src/lib/tiers.ts`,
> threshold 3000), the reset also drops every member to Novice each year.

### `rewards`
```sql
CREATE TABLE rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  points_cost integer NOT NULL,
  type text CHECK (type IN ('digital', 'physical')),
  claim_method text CHECK (claim_method IN ('onsite', 'digital_delivery')),
  image_url text,
  stock_remaining integer,             -- null = unlimited
  max_per_user integer,                -- null = unlimited
  financial_cost_php integer,          -- internal cost tracking
  is_active boolean DEFAULT true,
  is_coming_soon boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

### `reward_redemptions`
```sql
CREATE TABLE reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  reward_id uuid REFERENCES rewards(id),
  status text CHECK (status IN ('pending', 'claimed', 'cancelled')) DEFAULT 'pending',
  redeemed_at timestamptz DEFAULT now(),
  claimed_at timestamptz
);
```

### `jobs`
```sql
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  company text NOT NULL,
  location text,
  work_type text CHECK (work_type IN ('remote', 'onsite', 'hybrid', 'full_time', 'part_time')),
  description text,
  apply_url text,
  logo_url text,                               -- optional company logo URL for display in job cards
  is_promoted boolean DEFAULT false,
  is_active boolean DEFAULT true,
  posted_at timestamptz DEFAULT now()
);
```

### `news_posts`
```sql
CREATE TABLE news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  category text CHECK (category IN ('devcon', 'tech_community')),
  is_featured boolean DEFAULT false,
  is_promoted boolean DEFAULT false,
  cover_image_url text,
  author_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
```

### `programs`
```sql
CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  theme_id text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

### `xp_tiers`
XP tier milestone definitions (e.g. "Bronze", "Silver", "Gold"). Seeded manually.

### `missions`
Gamified missions/challenges that members can complete to earn points. Managed via AdminCMS.

Key columns (partial — full definition in migration files):
```
submission_type text CHECK (submission_type IN ('proof_upload', 'link', 'self_attest')) DEFAULT 'self_attest'
  -- proof_upload: member submits a proof link; admin reviews and approves
  -- link:         member opens a URL; participation tracked, no submission queue
  -- self_attest:  member clicks "Mark as Done"; creates a pending submission for admin review
is_active boolean DEFAULT true   -- togglable from AdminCMS; inactive missions are hidden from members
```
> Migration: `supabase/migrations/20260513_missions_submission_type.sql`

### `volunteer_applications`
```sql
CREATE TABLE volunteer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id),
  user_id uuid REFERENCES profiles(id),
  status text CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);
```
Approved by organizer via `approve_volunteer_application(p_application_id, p_organizer_id)` RPC.
Points awarded = `events.points_value + events.volunteer_points`.

### `referrals`
```sql
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES profiles(id),
  referred_user_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
```

### `organizer_upgrade_requests`
```sql
CREATE TABLE organizer_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  organizer_code text NOT NULL,        -- the code they submitted
  requested_role text,                 -- 'chapter_officer' | 'hq_admin'
  chapter_id uuid REFERENCES chapters(id),
  status text DEFAULT 'pending',       -- 'pending' | 'approved' | 'rejected'
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```
Created by `useAuthStore.requestOrganizerUpgrade()`. Reviewed by admins in `/admin/upgrades` (AdminCMS). Rate-limited to 1 request per 25 hours per user via `check-rate-limit`.

---

## 5. ROLE-BASED ACCESS CONTROL

| Role | Key Capabilities |
|------|-----------------|
| `member` | Register for events, earn/redeem points, browse jobs, view own QR ticket, request organizer upgrade |
| `chapter_officer` | All member + create events, approve/reject registrations, scan QR at door |
| `hq_admin` | All officer + manage rewards catalog, manage all chapters, review upgrade requests |
| `super_admin` | Full system access, role assignment, platform config, kiosk access |

### Organizer Gateway Flow
```
Sign Up → "DO YOU HAVE AN ORGANIZER CODE?"
  → YES: validate against organizer_codes table
         → assign role + chapter_id to profile
         → route to /organizer (OrganizerLayout)
  → NO:  default to member role
         → route to /home (MemberLayout)
```
> **Current state:** the `/organizer-code-gate` route is **temporarily disabled** in `router.tsx` (commented
> out). After sign-up, users route to `/complete-profile` (set full_name / username / chapter — required for
> OAuth and new accounts, gated by `MemberLayout`) then to `/home`. Organizers self-onboard via the in-app
> upgrade flow below until the gate is re-enabled.

### In-App Organizer Upgrade (post sign-up)
```
Profile → "Request Organizer Access"
  → Submit organizer code
  → Rate limit check (1 per 25h via check-rate-limit)
  → Insert into organizer_upgrade_requests
  → sets profiles.pending_role + profiles.pending_chapter_id
  → Admin reviews at /admin/upgrades
  → On approval: role + chapter_id updated, pending fields cleared
```

### Key RLS Policies
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON profiles
  USING (auth.uid() = id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events are public" ON events FOR SELECT USING (true);
CREATE POLICY "Officers create events" ON events FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('chapter_officer', 'hq_admin', 'super_admin'))
);

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own registrations" ON event_registrations
  FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own points" ON point_transactions
  FOR SELECT USING (auth.uid() = user_id);
```

> **Security note (bridge-JWT era):** because the browser holds a bridge JWT and can hit PostgREST/RPCs
> directly, **RLS policies and RPC grants — not the NestJS gateway — are the real authorization boundary**
> for those paths. The June 2026 security audit (`SECURITY_AUDIT_2026-06-19.md`, kept local / gitignored)
> found several policies weaker than the gateway they sit behind (e.g. `profiles` UPDATE lacking a
> `WITH CHECK`, actor-id-trusting `SECURITY DEFINER` RPCs). Treat every policy/RPC as internet-exposed to
> all authenticated users until "Phase 7" retires direct `supabase-js`. Harden RLS before relying on the
> gateway alone.

---

## 6. APPLICATION SCREENS & ROUTES

### React Router (flat `createBrowserRouter` in `web/src/router.tsx`)

> **Note:** event routes are keyed by human-readable **slug** (`/events/:slug`), not UUID
> (migration `20260331_event_slugs`). Some routes are lazy-loaded (QR scanner, wheel, all admin pages).

```
— Public (no layout, no auth) —
/                        → SplashScreen
/events/:slug            → EventDetail (publicly viewable without sign-in)
/officer-resources/:category → OfficerResources (public)
/wheel                   → WheelPage (lazy — public raffle "wheel of names")
/wheel/:eventId          → WheelPage (lazy — per-event raffle, password-gated)

— Auth flow (no layout) —
/onboarding              → Onboarding (4-step swipeable, real chapter photos)
/sign-in                 → SignIn
/sign-up                 → SignUp
/interests               → InterestQuiz (interest selection)
/oauth-callback          → OAuthCallback (Firebase Google redirect handler)
/complete-profile        → CompleteProfile (set full_name / username / chapter — required for OAuth & new accounts)
/forgot-password         → ForgotPassword
/email-sent              → EmailSent (Turnstile captcha on resend)
/reset-password          → ResetPassword
/email-confirm           → EmailConfirm
/terms-and-conditions    → TermsAndConditions (public)
/privacy-policy          → PrivacyPolicy (public)
# /organizer-code-gate   → OrganizerCodeGate  (TEMPORARILY DISABLED — commented out in router.tsx)

— MemberLayout (floating pill bottom nav on mobile, sidebar on desktop) —
/home                    → Dashboard
/events                  → EventsList (guest-browsable — see GUEST_PATHS)
/events/:slug/register   → EventRegister
/events/:slug/pending    → EventPending
/events/:slug/ticket     → EventTicket
/events/:slug/volunteer  → EventVolunteer
/jobs                    → JobsList
/jobs/:id                → JobDetail
/points                  → Points
/points/history          → PointsHistory
/news/:id                → NewsDetail
/rewards                 → Rewards
/qr                      → MyQR (user-identity QR page)
/profile                 → Profile
/profile/edit            → ProfileEdit
/notifications           → NotificationsInbox
/profile/notifications   → Notifications
/profile/privacy         → Privacy

— OrganizerLayout (floating pill bottom nav on mobile, sidebar on desktop) —
/organizer                           → OrgDashboard
/organizer/events                    → OrgEventManagement
/organizer/events/create             → OrgEventCreate
/organizer/events/:id                → OrgEventDetail
/organizer/events/:id/edit           → OrgEventEdit
/organizer/events/:id/registrants    → OrgEventRegistrants
/organizer/events/:id/summary        → OrgEventSummary
/organizer/scan                      → OrgQRScanner (lazy-loaded — pulls in @zxing)
/organizer/rewards                   → Rewards (same member-style catalog/redemption view — management moved to /admin/rewards)
/organizer/profile                   → OrgProfile
/organizer/profile/edit              → OrgProfileEdit
/organizer/profile/co-organizers     → OrgCoOrganizers
/organizer/notifications             → NotificationsInbox (isOrganizer)
/organizer/profile/notifications     → Notifications (shared)
/organizer/profile/privacy           → Privacy (shared)

— AdminLayout (requires hq_admin or super_admin — all lazy-loaded) —
/admin                               → AdminDashboard (stats overview)
/admin/users                         → AdminUsers (search, role assignment)
/admin/org-codes                     → AdminOrgCodes (code generation + management)
/admin/chapter-officers              → AdminChapterOfficers (officer email assignments)
/admin/events                        → AdminEvents (all events across chapters)
/admin/rewards                       → AdminRewards (catalog add/edit/remove + claim approve/refund)
/admin/chapters                      → AdminChapters (chapter management)
/admin/upgrades                      → AdminCMS (upgrade review + missions — labeled "CMS" in sidebar)
/admin/officer-resources             → AdminOfficerResources (officer resource library)
/admin/kiosk                         → AdminKiosk (on-site check-in kiosk — super_admin only)

— Catch-all —
*                                    → NotFound (404 page)
```

### Bottom Tab Navigation (MemberLayout — mobile)
```
[Home]  [Rewards]  [● Events ●]  [Jobs]  [Profile]
                        ↑
     Floating pill nav, fixed bottom-4. Events is center hero
     button (elevated circle, QrCode icon, bg-primary).
     Active state: text-primary / icon strokeWidth 2.5.
     Inactive: text-slate-400 / strokeWidth 1.8.
```

### Desktop Sidebar (MemberLayout — md+)
```
Left sidebar: bg-primary, w-48 lg:w-56, rounded-2xl
  Logo + "Member" label
  Nav items: Home | Rewards | Events (circle accent) | Jobs | Profile
Right: bg-white main content card
```

### Bottom Tab Navigation (OrganizerLayout — mobile)
```
[Home]  [Rewards]  [● Scan ●]  [Events]  [Profile]
                       ↑
     Scan is center hero (ScanLine icon).
     Active hero: bg-navy. Inactive hero: bg-blue.
     Active tabs: text-blue. Inactive: text-slate-400.
     OrganizerLayout does NOT apply program themes.
```

### Desktop Sidebar (OrganizerLayout — md+)
```
Left sidebar: bg-blue, w-48 lg:w-56, rounded-2xl
  Logo + "Organizer" label
  Nav items: Home | Rewards | Scan (circle accent) | Events | Profile
```

---

## 7. KEY USER FLOWS

### Onboarding (4 Screens — Swipeable)
```
Slide 1: /photos/devcon-summit-group.jpg
         "The Philippines' Largest Volunteer Tech Community"
Slide 2: /photos/devcon-luzon-chapters.png       ← updated May 2026
         "11 Chapters. 16 Years. 60,000+ Geeks for Good."
Slide 3: /photos/devcon-certificate-ceremony.jpg
         "Volunteer. Earn Points. Unlock Rewards."
Slide 4: /photos/devcon-jumpstart-internships.jpg
         "Access Global Opportunities. Level Up Your Career."

CTA: [Get Started] → /sign-up | [I have an account] → /sign-in
Each slide: DEVCON+ logomark top-left, Skip button top-right.
```

### Event Registration Lifecycle
```
Event Card → Event Detail → [Request to Join]
  → Form pre-filled: Name ✓  Email ✓  School/Company ✓
  → T&C + Privacy Consent checkbox (required)
  → Submit

IF requires_approval = false → instant QR Ticket
IF requires_approval = true  → Pending screen (Realtime subscription)
                             → Officer approves → QR Ticket
```

### QR Check-In at Venue
```
Member: shows QR Ticket screen (calls generate-qr-token → short-lived JWT)
Officer: /organizer/scan → camera opens
Officer: scans member QR → award-points-on-scan Edge Function
  → validates token (kind 'r' = registration, 'u' = user identity, 'p' = pending)
  → atomic checked_in update (false → true) prevents double-award
  → inserts point_transaction
  → updates profiles.spendable_points + lifetime_points
Officer sees: "✓ Juan dela Cruz — 200 pts awarded"
```

### Points Earning Reference
| Activity | Points | Source Tag |
|----------|--------|-----------|
| Sign up | 500 | `signup` |
| Attend event (QR scan) | 100–300 | `event_attendance` |
| Brown Bag Session | 250 | `brown_bag` |
| Speak at event | 700 | `speaking` |
| Like content | 5 | `content_like` |
| Share content + link submit | 10–25 | `content_share` |
| Volunteer at chapter | 100–500 | `volunteering` |
| Redeem reward | negative | `redemption` |
| Annual reset (June 24 PHT) | zeroes balances | `reset` |

> **Points expiry:** all Points+ (spendable + total earned) are **valid until June 24** and reset annually
> — see the "Annual points reset" note under `point_transactions` in Section 4. The UI surfaces this as a
> "Valid until Jun 24, YYYY" label (dashboard tooltip + profile card) via `getPointsExpiry()` in
> `web/src/lib/dates.ts`; the Terms/Privacy copy ("Annual Reset (June 24)") matches.

### Points History Display Format (match nmblr+ exactly)
```
[Date]         [Description]            [+N pts]
               Transaction no. [REF]   [MM/DD/YYYY HH:MM]
```
Group by date. Redemptions show negative. End with "That's it!" empty state.

---

## 8. DASHBOARD LAYOUT (Strict — Do Not Reorder)

```
1. Sticky greeting bar (bg-primary, "Hi, {firstName}!")
   + DEVCON+ logo-horizontal top-right
   + Gradient tail that fades in on scroll (framer-motion)

2. Blue cradle (bg-primary, oval bottom border)
   XP card (white, rounded-3xl, shadow-xl):
     - "Current DEVCON Points" label
     - Star icon (gold fill) + point total
     - Gold progress bar toward next milestone
     - "Attend Our Events" CTA button

3. Quick Actions row (3 cols):
   Find Jobs → /jobs
   Volunteer → ComingSoonModal
   Redeem    → /rewards

4. Rotating banner (crossfade, 4s interval, h-44)
   #SheIsDEVCON | Kids Hour of AI | 16 Years of DEVCON
   Dot indicator below (animated width pill)

5. Events For You (max 3, See All → /events)

6. Hot Jobs — horizontal scroll carousel (max 4, See All → /jobs)
   2nd listing → orange PROMOTED badge

7. Updates — tabbed DEVCON / Tech
   2nd post in Tech tab → orange PROMOTED badge

8. XP History preview (last 4 transactions, View All → /points/history)
```

---

## 9. DESIGN SYSTEM

### Color Tokens
```
primary           → CSS var: rgb(var(--color-primary))   — driven by program theme
primary-dark      → CSS var: rgb(var(--color-primary-dark))

blue              #1152D4   legacy alias — non-themed DEVCON blue (links, organizer nav, fallback)
blue-dark         #0D42AA
blue-light        #6099F4
navy              #1E2A56   deep navy (banner dot indicator, dark text, organizer scan hero active)
gold              #F8C630   XP bar fill, star icon fill
promoted          #F97316   ONLY for PROMOTED badge
green             #21C45D   success / positive XP
red               #EF4444   error / negative XP / sign out button
slate-50          #F8FAFC   page background
slate-100         #F1F5F9
slate-200         #E2E8F0   card borders
slate-300         #CBD5E1
slate-400         #94A3B8   muted text, inactive icons
slate-500         #64748B
slate-700         #334155
slate-900         #0F172A   primary text
```
> Tailwind slate scale has NO 600 or 800 — do not use them.

### Program Themes (user-selectable in Profile)
```
DEVCON+       id=devcon   primary=#1152D4   dark=#0D42AA
She is DEVCON id=she      primary=#BE185D   dark=#9D174D
DEVCON Kids   id=kids     primary=#059669   dark=#047857
Campus        id=campus   primary=#D97706   dark=#B45309
DEVCON Purple id=purple   primary=#7C3AED   dark=#6D28D9
```
Theme is persisted via `useThemeStore` (Zustand persist). CSS custom properties
`--color-primary` and `--color-primary-dark` are injected on the `<html>` element
by the MemberLayout on mount. Organizer routes do NOT apply program themes.

Per-event theme override: when `events.devcon_category` is set, event pages use
`getEventThemeStyle(devcon_category)` (from `lib/eventTheme.ts`) as inline styles
scoped to the page root — does not mutate global state.

### Box Shadows
```
shadow-card     0 1px 4px rgba(0,0,0,0.07)
shadow-blue     0 4px 24px rgba(54,123,221,0.12)
shadow-primary  var(--shadow-primary)   (driven by theme)
```

### Typography (Proxima Nova font)

**MD3 type scale** (preferred for new components — additive tokens in `tailwind.config.js`):
```
text-md3-display-lg   57px  — hero sections only
text-md3-headline-lg  32px  — page titles
text-md3-headline-sm  24px  — section titles
text-md3-title-lg     22px  — card titles, prominent labels
text-md3-title-md     16px  — subheadings
text-md3-body-lg      16px  — body (large)
text-md3-body-md      14px  — standard body content
text-md3-body-sm      12px  — small body
text-md3-label-lg     14px  — button labels
text-md3-label-md     12px  — chips, badges, timestamps
text-md3-label-sm     11px  — compact metadata
```
When using MD3 scale, pair with `font-proxima` and appropriate `font-weight`.

**Legacy scale** (existing components — backward compatible, do not migrate unless reworking):
```
Display: text-3xl font-black   — hero headers
H1:      text-2xl font-semibold — page titles
H2:      text-base font-bold   — section headers
Body:    text-sm               — body
Caption: text-xs / text-[10px] — timestamps, refs
```
> MD3 tokens are additive — legacy classes remain valid. Prefer MD3 for any new component going forward.

### Spacing & Shape
```
Border radius:  rounded-xl=20px  rounded-2xl=24px  rounded-3xl=28px+
Card padding:   p-4 (standard)   p-5 (hero cards)
Page gutters:   px-4
Safe bottom:    pb-24 in scroll containers (clears floating nav)
```

### Chips & Tab Toggles (white-outlined style — updated June 2026)

Pill-shaped filter chips and segmented tab toggles use a **white, outlined** treatment —
NOT a filled light-blue (`bg-primary/10`) inactive state. Every chip/tab carries a 1px `border`
on ALL states so widths never shift when selection changes. Two variants:

**Segmented tab toggle** — full-width `flex-1` buttons that switch between views (e.g. Discover /
My Tickets, Updates / Featured, Ways to Earn / Share & Earn, Redeem / Missions). Active = solid fill:
```
base:     ...rounded-full ... border          (add `border` to the base class)
active:   bg-primary text-white font-semibold border-primary shadow-sm
inactive: bg-white text-slate-700 font-medium border-slate-200
```

**Filter chip** — horizontal-scroll pills that narrow a list (e.g. All Events / Near You / DEVCON,
points-history filters, mission/reward category chips). Active = white with a colored border:
```
base:     ...rounded-full ... border          (add `border` to the base class)
active:   bg-white text-primary font-semibold border-primary
inactive: bg-white text-slate-500 font-medium border-slate-200
```

Notes:
- On the **organizer** surface (non-themed), swap `primary` → `blue`: active tab toggle is
  `bg-blue text-white border-blue shadow-sm`, inactive `bg-white text-slate-700 border-slate-200`.
- Both variants assume a **light backdrop** (`bg-slate-50` glassmorphism header or page body).
  Do not place white-outlined chips on the blue header ellipse.
- This is distinct from `<ChipBar />` (a slate-100-track segmented control with a white active pill)
  and from the AdminCMS folder-tab bar (`rounded-t-lg` underline tabs) — leave those as-is.
- Files using this pattern: `EventsList`, `Dashboard` (Updates/Featured), `Points`,
  `PointsHistory`, `Rewards` (main tab + mission/category chips), `organizer/RewardsManagement`.
  `solar-icon-set` count/badge spans inside a chip keep their own styling.

### Animation (framer-motion)
```js
// web/src/lib/animation.ts — always import from here, never redefine inline
fadeUp            — page entrances, card list entry (y: 10→0, 0.22s)
fade              — page-level opacity transitions (0.18s)
slideUp           — bottom sheets and modals (y: 100%→0, custom easing)
backdrop          — backdrop fade (0.2s)
staggerContainer  — parent wrapper for staggered child lists
cardItem          — individual staggered card/list item (y: 10→0, 0.2s)
NAV_SPRING        — spring config for nav tab indicator (stiffness: 380, damping: 28)
```

Spring values for interactive elements:
```js
Card (full tap area): whileTap={{ scale: 0.97 }}, type: 'spring', stiffness: 400, damping: 25
Button / control:     whileTap={{ scale: 0.95 }}, type: 'spring', stiffness: 400, damping: 25
Nav item:             whileTap={{ scale: 0.88 }}, type: 'spring', stiffness: 400, damping: 20
```
> Stagger container `animate` key is `"visible"` — never `"show"`. Match variant keys exactly.

### Core Components (built — reuse everywhere)
```
<MemberLayout />             responsive layout: floating pill nav (mobile) + sidebar (desktop), auth guard
                             Guest access: unauthenticated users may browse GUEST_PATHS (currently ['/events'])
                             without being redirected to sign-in. All other member routes still require auth.
<OrganizerLayout />          responsive layout: floating pill nav (mobile) + sidebar (desktop), organizer guard
<AdminLayout />              desktop-only sidebar nav, hq_admin/super_admin guard, recovery remount
<DesktopGuard />             pass-through no-op — renders children directly (responsive handled in layouts)
<EventCard />                dashboard + events list cards (compact prop)
<JobCard />                  jobs board full card
<NewsCard />                 DEVCON + Tech Community feed items
<PromotedBadge />            orange "PROMOTED" tag
<ComingSoonModal />          reusable for incomplete features
<TransactionRow />           points history list item
<StatusPill />               Pending / Approved / Rejected / You're In
<ChipBar />                  horizontal scroll chip filter bar
<XPCard />                   standalone XP display card
<OrgBanner />                organizer top banner strip
<ApprovalCard />             organizer event registration approval card
<VolunteerApprovalCard />    organizer volunteer application approval card
<StatusBadge />              organizer status badge
<AddToCalendarSheet />       bottom sheet for adding event to device calendar
<SendAnnouncementSheet />    organizer bottom sheet for broadcasting announcements (creates event_announcements row)
<PasswordConfirmModal />     confirm password for sensitive actions
<PasswordStrengthMeter />    password strength indicator (used in SignUp / ProfileEdit)
<LegalModal />               inline bottom sheet for Terms & Conditions / Privacy Policy (used in SignUp, EventRegister)
<Skeleton />                 loading skeleton placeholder
<RouteErrorBoundary />       React error boundary wrapping all route trees — catches unhandled errors, renders a branded fallback with navigation options
<KonamiCodeWrapper />        Easter egg wrapper (to be removed before production — see Section 17 "Remaining")
<KonamiModal />              Easter egg modal dialog
```

### Icon Rules
- Use `solar-icon-set` exclusively (outline variant) — no emoji icons in JSX. Import type `SolarIcon` from `lib/icons` for prop typing.
- **`solar-icon-set` does NOT support Tailwind `text-*` color classes.** Icons do not use `currentColor`, so `text-primary`, `text-slate-400`, etc. have zero effect. Use the `color` prop instead: `<HomeOutline color="rgb(var(--color-primary))" />`. See `.claude/rules/solar-icon-styling.md`.
- Icon in colored container: `<div className="w-10 h-10 rounded-xl bg-primary/10 ..."><Icon color="rgb(var(--color-primary))" width={20} height={20} /></div>`
- Back navigation: `<ArrowLeftOutline />`
- Location: `<MapPointOutline />`
- Events center tab: `<QRCodeOutline />`
- Points: `<StarOutline color="#F8C630" width={20} height={20} />`

---

## 10. STORES (`web/src/stores/`)

```
useAuthStore.ts           — user (Profile|null), initials, chapterName, isInitialized,
                            isOrganizerSession, initialize(), signIn(), signUp(),
                            signOut(), setOrganizerSession(), updateProfile(),
                            updateEmail(), updatePassword(), uploadAvatar(),
                            deleteAccount(), resetPassword(),
                            requestOrganizerUpgrade(), checkUsernameAvailable()
useEventsStore.ts         — events[], registrations[], register(), getById(),
                            fetchEvents(), fetchRegistrations(),
                            subscribeToChanges(), subscribeToEventChanges()
useJobsStore.ts           — jobs[], fetchJobs(), getById()
usePointsStore.ts         — transactions[], loadTotalPoints(), loadTransactions()
useNewsStore.ts           — newsPosts[], fetchNews()
useRewardsStore.ts        — rewards[], fetchRewards(), fetchAllRewards(),
                            subscribeToChanges()
useNotificationsStore.ts  — notifications[], fetchRecent(), subscribe(), markRead()
useVolunteerStore.ts      — member volunteer applications, loadApplications(),
                            applyToVolunteer()
useOrgVolunteerStore.ts   — organizer volunteer queue, loadApplications(),
                            approveApplication(), rejectApplication()
useMissionsStore.ts       — missions[], fetchMissions(), startMission(),
                            submitMission(); subscribeToChanges() is a no-op
useChaptersStore.ts       — chapters[], fetchChapters() (publicFetch)
useReferralsStore.ts      — referrals[], referralCode, loadReferralData()
useOrgAuthStore.ts        — organizer session state
useThemeStore.ts          — themeId, setTheme(), activeTheme()
                            persisted to localStorage as 'devcon-theme'
```

Stores fetch through the **NestJS gateway** via `apiFetch()` (authenticated, injects the Firebase ID
token, auto-refresh on 401) or `publicFetch()` (public reads), both from `web/src/lib/api.ts`. Examples:
`usePointsStore` → `/api/points/transactions` + `/api/points/summary`; `useEventsStore` → `/api/events`
(read) + `/api/registrations` (write); `useRewardsStore` → `/api/rewards` + `/api/rewards/.../redeem`;
`useMissionsStore` → `/api/missions`; `useChaptersStore` → `/api/chapters`. Direct `supabase-js` is used
only for a few residual paths (password reset, the best-effort announcements realtime channel, two admin
pages) and is being retired. `subscribeToChanges()` on events/points/rewards/missions is a **no-op**
(polling-first — see Section 15 and the resilience rule).

---

## 11. LIB UTILITIES (`web/src/lib/`)

```
api.ts               — apiFetch() (authenticated — injects Firebase ID token, auto-refresh
                       on 401) and publicFetch() (public reads). The primary data path: all
                       stores call the NestJS gateway through here. Base URL = VITE_API_URL.
firebase.ts          — Firebase web app init (auth). Source of truth for sign-in.
authBridge.ts        — exchanges the Firebase ID token at the gateway for the Supabase
                       bridge JWT; setBridgeToken()/setupSupabaseSession() inject it
animation.ts         — framer-motion variants: fadeUp, fade, slideUp, backdrop,
                       staggerContainer, cardItem, NAV_SPRING
constants.ts         — VOLUNTEER_APPROVAL_POINTS (35), ROLE_DISPLAY_NAMES,
                       WORK_TYPE_LABELS, CATEGORY_LABELS
dates.ts             — formatDate.compact(), formatDate.full(), formatDate.time()
eventTheme.ts        — getEventThemeStyle(devcon_category): inline CSS vars for
                       per-event theme overrides (scoped, does not mutate global state)
                       resolveEventTheme(devcon_category, fallbackTheme): hex values
supabase.ts          — Supabase client (legacy/bridge-JWT path only). Injects the bridge
                       JWT as Bearer on direct PostgREST/Storage calls via fetchWithTimeout
                       (retry logic, 'reload' cache, abort support)
validation.ts        — form validation helpers (Zod schemas, reusable validators)
```

### Hooks (`web/src/hooks/`)
```
useRecoverOnFocus.ts — recovery hook (polling-first): refetches data on visibilitychange
                       (visible), window.online, and a 60-second interval. NO resubscribe —
                       there are no always-on realtime channels to keep alive.
useFormDraft.ts      — saves form state to localStorage (cross-tab, default) or
                       sessionStorage (within-tab, pass storage: 'session').
                       Used in: sign-in email, sign-up form, event create/edit,
                       volunteer form, custom registration fields.
                       Clears draft on successful form submission.
useKonamiCode.ts     — Konami code easter egg detector (restricted to hq_admin/super_admin)
```

---

## 12. EDGE FUNCTIONS (`supabase/functions/`)

> **Note:** the **NestJS gateway is now the primary backend.** QR generation/scan and rate limiting are
> also exposed as `/api/qr/*` and the gateway's `RateLimitGuard`; several edge functions below are the
> older path and/or are invoked server-side. Current functions in `supabase/functions/`:
> `generate-qr-token`, `generate-user-qr`, `generate-pending-qr`, `award-points-on-scan`,
> `approve-at-door`, `check-rate-limit`, `send-email`, `delete-user`.
> Shared: `_shared/auth.ts`, `_shared/emailTemplates.ts`, `_shared/logger.ts`.

### `generate-qr-token`
- Input: `{ registration_id: string }`
- Returns: `{ token: string, expires_at: number }`
- Generates a compact JWT-based QR token (kind=`'r'`, sub=registration_id)
- Rate limited: 10 token requests/user/60s (fail closed)

### `award-points-on-scan`
- Input: `{ token: string }` — the short-lived JWT from `generate-qr-token`
- Returns: `{ success: boolean, member_name?, points_awarded?, event_title?, already_checked_in?, error? }`
- Token kinds (discriminated by `k` claim):
  - `k='r'` — registration token (sub = registration_id): standard check-in
  - `k='u'` — user identity token (sub = user_id): finds most imminent approved event in chapter
  - `k='p'` — pending door-approval token (sub = registration_id): returns pending state for Approve/Reject UI
- Validates token signature + expiry (HMAC-SHA256)
- Atomically sets `checked_in: false → true` to prevent double-award
- Rate limited: 60 scans/organizer/60s

### `approve-at-door`
- Input: `{ registration_id: string, action: 'approve' | 'reject' }`
- Called by QR scanner after scanning a pending member QR
- Returns (approve): `{ success: true, member_name, points_awarded, event_title }`
- Returns (reject): `{ success: true, rejected: true, member_name }`

### `check-rate-limit`
- Input: `{ bucket: string, email?: string }`
- Returns: `{ allowed: boolean, retryAfterSeconds?: number }`
- IP-keyed buckets (no JWT required): `login`, `login_ip`, `signup`, `username_check`
- User-keyed buckets (JWT required): `org_upgrade`
- Rate limit windows: login=300s, signup=3600s, username_check=60s, org_upgrade=90000s (25h), qr_generate=60s, qr_scan=60s
- Fails open on RPC error (GoTrue + RLS are final backstops)

### `send-email`
- Sends transactional/branded HTML email via Resend (verification, reset, officer invite, event mail)
- Templates in `_shared/emailTemplates.ts`. Also reachable from `EventRegister` / `EventRegistrants`
- ⚠️ Security: gated only by caller-JWT identity + a 30/min rate limit (see audit M1 — server-render planned)

### `delete-user`
- Cascade-deletes a profile's data on account deletion

### `generate-user-qr` / `generate-pending-qr`
- `generate-user-qr` — user-identity token (kind `u`) for the `/qr` MyQR page
- `generate-pending-qr` — pending door-approval token (kind `p`)

### `_shared/logger.ts`
- Structured JSON logger used by all edge functions
- Format: `{ level, event, ts, ...data }` → stdout → Supabase Dashboard Logs
- Levels: `info`, `warn`, `error`

> CORS allowlists are origin-exact: production `https://devcon.plus`, staging `https://staging.devcon.plus`,
> the NestJS origin, and `http://localhost:5173` for local dev. (Audit I2 notes a stale
> `staging.cloud-engineer.dev` entry to prune.) The gateway's own `CORS_ORIGIN` is set via env.

---

## 13. SEED DATA

### All 11 Chapters
```sql
INSERT INTO chapters (name, region) VALUES
  ('Manila', 'Luzon'), ('Laguna', 'Luzon'), ('Pampanga', 'Luzon'), ('Bulacan', 'Luzon'),
  ('Cebu', 'Visayas'), ('Iloilo', 'Visayas'), ('Bacolod', 'Visayas'),
  ('Davao', 'Mindanao'), ('Cagayan de Oro', 'Mindanao'),
  ('General Santos', 'Mindanao'), ('Zamboanga', 'Mindanao');
```

### 8 Sample Jobs (manually seeded)
```sql
INSERT INTO jobs (title, company, location, work_type, is_promoted) VALUES
  ('Senior Frontend Developer', 'Accenture Philippines', 'BGC, Taguig', 'onsite', false),
  ('Blockchain Developer', 'Sui Foundation', 'Remote', 'remote', true),
  ('UI/UX Designer', 'ING Philippines', 'Makati', 'hybrid', false),
  ('Full Stack Engineer', 'Thinking Machines', 'Remote', 'remote', false),
  ('DevOps Engineer', 'Globe Telecom', 'BGC, Taguig', 'onsite', false),
  ('Mobile Developer (React Native)', 'Kumu', 'Remote', 'remote', false),
  ('Data Engineer', 'GCash', 'Mandaluyong', 'hybrid', false),
  ('Product Manager', 'Maya', 'BGC, Taguig', 'onsite', false);
```
> Sui Foundation is `is_promoted = true` → renders as 2nd listing with orange PROMOTED badge.

### Rewards Catalog
```sql
INSERT INTO rewards (name, points_cost, type, claim_method, is_coming_soon) VALUES
  ('Lanyard', 25, 'physical', 'onsite', true),
  ('Coffee Voucher', 500, 'digital', 'digital_delivery', true),
  ('DEVCON Cap', 100, 'physical', 'onsite', true),
  ('Keyboard', 250, 'physical', 'onsite', true),
  ('Headset', 950, 'physical', 'onsite', true),
  ('DEVCON Shirt', 2000, 'physical', 'onsite', true),
  ('DEVCON Mug', 2500, 'physical', 'onsite', true);
```

---

## 14. ENVIRONMENT VARIABLES

### `web/.env.local` (frontend — see `web/.env.example`)
```env
# Supabase (bridge-JWT path; anon key is public-by-design)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
# Auth
VITE_GOOGLE_CLIENT_ID=
# Cloudflare Turnstile (CAPTCHA on auth forms)
VITE_TURNSTILE_SITE_KEY=
# Firebase Auth (web app config — public identifiers, not secrets)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
# App + SEO
VITE_APP_ENV=development
VITE_ALLOW_INDEXING=          # "true" only on production (devcon.plus); unset on staging → robots.txt Disallow
# Backend gateway
VITE_API_URL=http://localhost:8000
```
> All `VITE_*` values are public-by-design (baked into the bundle). No secret-class value carries a `VITE_` prefix.

### `server/.env` (NestJS gateway — see `server/.env.example` / `.env.production.example`)
```env
PORT=8000
NODE_ENV=development
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=            # server-only — bypasses RLS, NEVER in the frontend bundle
SUPABASE_JWT_SECRET=                  # signs the bridge JWT (HS256)
FIREBASE_WEB_API_KEY=                 # Firebase REST sign-in
FIREBASE_SERVICE_ACCOUNT_JSON=        # Firebase Admin SDK (minified JSON)
GMAIL_USER=                           # nodemailer SMTP (optional — degrades gracefully)
GMAIL_APP_PASSWORD=
EMAIL_VERIFICATION_SECRET=            # HS256 secret for stateless email-verify links
APP_URL=                             # frontend base URL (post-verify redirects)
SERVER_URL=                          # backend base URL (verification links)
QR_JWT_SECRET=                        # HMAC-SHA256 for QR JWTs (must match the edge function secret)
TURNSTILE_SECRET_KEY=                 # server-side Turnstile verification (optional)
CORS_ORIGIN=                          # comma-separated allowed origins (no trailing slash)
UPSTASH_REDIS_REST_URL=               # cache + rate-limit buckets (optional)
UPSTASH_REDIS_REST_TOKEN=
CACHE_PREFIX=                         # isolates staging/prod on a shared Redis
```

---

## 15. CODING STANDARDS

- TypeScript strict mode — no `any`, no `@ts-ignore`
- `PascalCase.tsx` for components, `camelCase.ts` for lib/store files
- Co-locate component + types in the same folder when complex
- All Supabase calls typed with generated types — regenerate with `supabase gen types typescript > web/src/types/database.types.ts`
- Every async call has loading + error + empty state
- React Hook Form + Zod for every form — no uncontrolled inputs
- Constants in `lib/constants.ts` — no magic strings/numbers inline
- No dead navigation — every route renders something
- `framer-motion` `whileTap={{ scale: 0.95 }}` on all tappable cards and buttons
- Use `motion.div` + `variants={staggerContainer}` + `variants={cardItem}` for list sections
- **Data through the gateway:** no direct `supabase.from(...)` / `supabase.rpc(...)` in components or stores — go through `apiFetch`/`publicFetch` (NestJS). Direct `supabase-js` is bridge-JWT legacy, being retired.
- **Polling-first recovery (realtime is best-effort):** app correctness must NOT depend on a realtime channel. `recover()` (HTTP refetch) must run on `visibilitychange` (visible), `window.online`, a **60-second interval**, and auth-change, with debounced follow-ups at +5 s and +15 s. There is **no `resubscribe()`** — `subscribeToChanges` on events/points/rewards/missions is a no-op; only announcements use a best-effort channel that gives up on `CHANNEL_ERROR`/`TIMED_OUT`. Mirror `MemberLayout`/`OrganizerLayout`. See `.claude/rules/db-connection-resilience.md`.

---

## 16. BUILD COMMANDS

Each app is self-contained — run commands from the relevant subdirectory.

```bash
# Frontend (web/)
cd web && npm install        # install deps (no --legacy-peer-deps — uses overrides)
cd web && npm run dev        # Vite dev server (port 5173)
cd web && npm run build      # tsc -b && vite build (mirrors Vercel exactly)
cd web && npm run typecheck  # tsc -b --noEmit (same strictness as build)

# Backend (server/)
cd server && npm install     # install NestJS deps
cd server && npm run dev     # NestJS watch mode (port 3000)
cd server && npm run build   # compile NestJS to dist/
```

---

## 17. CURRENT BUILD STATUS (as of June 21, 2026)

> **July 2026 — most recent:**
> - [x] **Annual points reset (June 24, PHT)** — `reset_points(uuid DEFAULT NULL)` fn + `'reset'` ledger
>       source in `20260708_reset_points_annual.sql`; scheduled via pg_cron `'0 16 23 6 *'` (all users).
>       Zeroes both `spendable_points` + `lifetime_points` (drops everyone to Novice). UI "Valid until
>       Jun 24" labels via `getPointsExpiry()`; Terms/Privacy updated to "Annual Reset (June 24)".
>       See the "Annual points reset" note in Section 4.

> **June 2026 — major changes since MVP 1.7 (most recent first):**
> - [x] **Auth migrated to Firebase** (Google OAuth + email/password). Supabase Auth cut
>       (`20260528_firebase_auth_foundation.sql`, `20260531_phase4_cut_supabase_auth.sql`). Profiles gain
>       `auth_uid`; `profiles.id` FK dropped (`20260615`). `/oauth-callback` + `/complete-profile` flows added.
> - [x] **NestJS gateway (`server/`) is the primary backend** — deployed to EC2 + nginx at
>       `https://api.cloud-engineer.dev`. Frontend stores moved off direct Supabase to `apiFetch`/`publicFetch`.
>       Auth = Firebase ID-token verify + `email_verified` + role/chapter/owner scoping; Upstash Redis cache + rate limits.
> - [x] **Bridge-JWT era** — gateway mints a short-lived Supabase JWT so residual direct PostgREST calls keep
>       working; "Phase 7" will retire `supabase-js` entirely.
> - [x] **Realtime inverted to polling-first** (2026-06-14) — `subscribeToChanges` no-ops on events/points/
>       rewards/missions; only a best-effort announcements channel remains; `recover()` polls every 60 s.
>       (Free-tier 200-connection cap + WAL load.) See `db-connection-resilience.md`.
> - [x] **Custom domain live** — production is `https://devcon.plus`; `devconplusbeta-v1.vercel.app` and
>       `plus-beta.devcon.ph` 301-redirect to it. Staging `staging.devcon.plus` (noindex via `VITE_ALLOW_INDEXING`).
> - [x] **Transactional email working** — NestJS email module (nodemailer/Gmail) + `send-email` edge fn +
>       redesigned unified DEVCON+ brand email shell; officer-invite email on assignment; deliverability fixes.
> - [x] **Public raffle "Wheel of Names"** — `/wheel` + `/wheel/:eventId` (password-gated, branded).
> - [x] **Interest quiz** (`/interests`, `20260419_interest_quiz.sql`); **officer resources** library +
>       **co-organizers**; **reward claim PIN workflow** (`20260414_reward_claim_*`); **missions** moved to
>       its own schema (`20260406_missions.sql`).
> - [x] **Security audit performed (June 19–20)** — see `SECURITY_AUDIT_2026-06-19.md` /
>       `SECURITY_AUDIT_REMEDIATION_2026-06-20.md` (kept local, gitignored). Gateway authz is strong; open
>       items are RLS/RPC hardening on the direct-PostgREST path (see Section 5 note + Remaining below).

### Completed (MVP 1.x foundation — carried forward)
- [x] Monorepo scaffold (web, server) — types in web/src/types/
- [x] Tailwind + Geist font + design tokens + CSS custom property theming
- [x] Program theme system (4 themes, CSS vars, persisted via Zustand)
- [x] Per-event theme overrides via `devcon_category` + `lib/eventTheme.ts`
- [x] Auth flow (SplashScreen, Onboarding, SignIn, SignUp, OrganizerCodeGate)
- [x] Password reset + email confirmation flows (ForgotPassword, EmailSent, ResetPassword, EmailConfirm)
- [x] MemberLayout — responsive (floating pill nav on mobile, sidebar on desktop md+)
- [x] OrganizerLayout — responsive (floating pill nav on mobile, sidebar on desktop md+)
- [x] AdminLayout (desktop sidebar nav, hq_admin/super_admin guard, lazy-loaded routes)
- [x] DesktopGuard (pass-through — responsive handled in each layout)
- [x] Dashboard (cradle XP card, quick actions, rotating banner, events, jobs carousel, news tabs, XP history preview)
- [x] EventsList, EventDetail, EventRegister, EventPending, EventTicket, EventVolunteer
- [x] JobsList, JobDetail
- [x] Points, PointsHistory
- [x] Rewards (catalog grid + ComingSoonModal)
- [x] Profile (program theme selector, XP badge, menu, sign out)
- [x] ProfileEdit (photo upload, username edit), Notifications, NotificationsInbox, Privacy
- [x] NewsDetail
- [x] Organizer: Dashboard, EventManagement, EventCreate, EventDetail, EventEdit, EventRegistrants, EventSummary, QRScanner (lazy), RewardsManagement, RewardCreate, RewardEdit, Profile, ProfileEdit
- [x] Admin panel: Dashboard, Users, OrgCodes, Events, Chapters, CMS/Upgrades, Kiosk (super_admin only)
- [x] Admin attendance CSV export with event/chapter/date/status filters (AdminEvents)
- [x] All core components (see Section 9) including KonamiCodeWrapper + KonamiModal (Easter egg)
- [x] framer-motion animations across all list/card sections
- [x] Supabase project provisioned + real client wired (`web/src/lib/supabase.ts`)
- [x] Custom navigator.locks auth (no timeout) + realtime throttle (10 events/sec)
- [x] Real Supabase auth (signIn, signUp, Google OAuth, session persistence)
- [x] All stores migrated to real Supabase queries (auth, events, jobs, news, points, rewards, notifications, volunteers, referrals)
- [x] useAuthStore: updateEmail, updatePassword, uploadAvatar, deleteAccount, requestOrganizerUpgrade, checkUsernameAvailable
- [x] username field on profiles — unique, set on sign-up
- [x] In-app organizer upgrade request flow (organizer_upgrade_requests table + admin review)
- [x] event_announcements table + SendAnnouncementSheet
- [x] DB schema migrations applied (001–017 + all sprint/feature migrations through `20260324_volunteer_indexes.sql`)
- [x] DB types regenerated from live Supabase DB (March 24)
- [x] Seed data seeded (chapters, jobs, rewards)
- [x] RLS policies + security hardening (IDOR hardening, rate limiting, security fixes)
- [x] Performance indexes applied (`20260324_performance_indexes.sql`)
- [x] Realtime extensions applied (`20260324_realtime_extensions.sql`)
- [x] Realtime recovery pattern (visibilitychange + online + 5min poll) in MemberLayout, OrganizerLayout, AdminLayout
- [x] Volunteer system wired end-to-end (member apply flow + organizer approval queue)
- [x] Edge functions deployed: `generate-qr-token`, `award-points-on-scan`, `approve-at-door`, `check-rate-limit`
- [x] QR token kinds: `'r'` (registration), `'u'` (user identity), `'p'` (pending door-approval)
- [x] Rate limiting: login (5/5min), signup (1/hr), username_check (10/min), org_upgrade (1/25hr), qr_generate (10/min), qr_scan (60/min)
- [x] Shared edge function logger (`_shared/logger.ts`)
- [x] NotFound (404) — creative branded page. Also rendered inline by EventDetail, JobDetail, NewsDetail, EventVolunteer, EventEdit, RewardEdit when a resource is not found.
- [x] CSP headers enforced (promoted from Report-Only)
- [x] Deployed to Vercel → https://devconplusbeta-v1.vercel.app
- [x] Proxima Nova font migrated (self-hosted woff2, 6 weights — replaces Geist)
- [x] MD3 type scale tokens added to `tailwind.config.js` + applied across all UI components (PR #6)
- [x] Form draft persistence — `useFormDraft` hook (localStorage/sessionStorage) for sign-in, sign-up, event create/edit, volunteer form, custom registration fields
- [x] 5th program theme: DEVCON Purple (`#7C3AED` / `#6D28D9`) added to theme system
- [x] Cloudflare Turnstile CAPTCHA on auth forms (commit 9ca7272, Apr 8)
- [x] XP Tier System — milestone definitions + progress bar wired to lifetime_points
- [x] `/qr` MyQR page + `generate-user-qr` edge function deployed
- [x] PWA manifest — icons 192/512/maskable, shortcuts, apple-touch-icon
- [x] Custom event registration fields — modular form schema + DB migration
- [x] Missions System — basic gamified missions flow
- [x] Event URL slugs — /events/:slug (human-readable) replacing /events/:uuid
- [x] password_reset rate limit deployed
- [x] Terms & Conditions page (`/terms-and-conditions`) + Privacy Policy page (`/privacy-policy`) — public routes, no auth required
- [x] `<LegalModal />` component — inline bottom sheet for T&C / Privacy Policy linked from SignUp + EventRegister
- [x] Google Tag Manager integrated (GTM-N6PD5PJQ) in `index.html`
- [x] Turnstile CAPTCHA extended to EmailSent component (resend email flow)
- [x] `fetchWithTimeout` utility in `supabase.ts` — wraps `fetch` with retry logic, 'reload' cache strategy, and abort support for network resilience
- [x] Realtime recovery pattern enhanced: debounced trigger + follow-up attempts at +5 s and +15 s; polling interval reduced to **90 seconds**
- [x] Loading skeleton refined — shown only when no cached data is available (avoids flash on cached page)
- [x] Chapter sorting fix — Manila prioritized first in Luzon region list during sign-up
- [x] Onboarding slide 2 image updated to `devcon-luzon-chapters.png`
- [x] Safe return URL handling in OAuth callback and SignIn (prevents open redirect)
- [x] Event detail publicly accessible without auth (unauthenticated users can view event info)
- [x] Admin CSV export enhanced: date range inputs, attendance status filter, improved filename generation with event labels + Philippine date format

**May 2026 additions (MVP 1.7):**
- [x] External event registration — `is_external` + `external_registration_url` fields on `events` table; EventCreate/EventEdit/AdminEvents support setting external URL or 'tba' placeholder; EventDetail/EventCard/EventsList redirect to external link instead of in-app registration flow
- [x] Admin cover image upload — organizers can upload a cover image directly from AdminEvents (with validation and preview before save)
- [x] `<RouteErrorBoundary />` — React error boundary wrapping all three route trees; renders branded fallback on unhandled render errors
- [x] Region-based chapter filtering on EventsList — members can filter events by region (Luzon / Visayas / Mindanao)
- [x] Event-type chip filter on EventsList — filter by category (Tech Talk, Workshop, Hackathon, etc.)
- [x] Event share — native share sheet / clipboard fallback on EventDetail
- [x] Guest / unauthenticated access to EventsList — `MemberLayout` now allows browsing `/events` without sign-in; `GUEST_PATHS = ['/events']` constant controls which paths are open
- [x] Browse Events button added to Onboarding final slide for unauthenticated entry
- [x] Conditional Sign Up CTA on EventsList for unauthenticated users
- [x] Missions — `submission_type` column added (`proof_upload` / `link` / `self_attest`); migration `20260513_missions_submission_type.sql`
- [x] Missions — `is_active` flag; AdminCMS toggle to activate/deactivate individual missions
- [x] Jobs — `logo_url` field added to `jobs` table; logo rendered in job cards and admin job forms
- [x] Jobs board header updated to "AI & Dev Jobs"
- [x] Safe Space & Event Risk Consent section added to Terms & Conditions and `<LegalModal />`
- [x] OrganizerCodeGate navigation temporarily disabled (post-sign-up routing goes directly to member home)
- [x] Organizer events list — chapter-scoped filtering so officers only see their chapter's events

### Remaining / Ongoing (as of June 21, 2026)
- [ ] **Security audit remediation** (highest priority) — `profiles` UPDATE RLS needs `WITH CHECK` (C1, privilege-escalation), `redeem_reward`/`manual_checkin` RPCs trust an actor-id param (H1, BOLA), `events` UPDATE not chapter-scoped (M2), `rewards` writes admit officers (M3). Rotate prod `EMAIL_VERIFICATION_SECRET`; deploy `web/vercel.json` CSP `frame-ancestors`; bump `multer`/NestJS. **Verify C1/H1/M2/M3 against the live DB first** (migration drift). See `SECURITY_AUDIT_*.md`.
- [ ] **Retire direct `supabase-js` ("Phase 7")** — route remaining reads/writes through the NestJS gateway, then scope/retire the bridge JWT. Collapses the audit's C1/H1/M2/M3 reachability.
- [ ] Re-enable `OrganizerCodeGate` routing once the post-sign-up flow is confirmed stable
- [ ] Remove test accounts + Easter eggs (KonamiCodeWrapper / KonamiModal)
- [ ] PROMOTED badge audit (verify 2nd job + 2nd Tech news post are `is_promoted = true` in live data)
- [ ] Final QA on all flows on a real mobile device (iPhone Safari + Android Chrome)

### Resolved since May (no longer blocking)
- [x] Custom domain live (`devcon.plus`); beta + `plus-beta.devcon.ph` redirect to it
- [x] Google OAuth on production domain (now Firebase OAuth) + Edge Function/gateway CORS for prod
- [x] Transactional email working end-to-end (NestJS email + `send-email`; June email redesign)

---

## 18. OUT OF SCOPE FOR MVP

Show `<ComingSoonModal />` if user reaches any of these:

- Apple Sign-In
- Push notifications
- Reward shipping / delivery
- Partner analytics dashboard
- External Jobs API integration
- DEVCON TV / video content
- Developer Spotlight CMS
- Multi-language support


---

## 19. PHASE 2 ROADMAP (Post-Graduation — May 15, 2026+)

These features are **not in scope for MVP**. Do not build them before April 30. After graduation, they define the next evolution of the platform. Use `<ComingSoonModal />` if a user reaches any of these entry points.

### 19.1 Kotlin Multiplatform (KMP) Migration
**Goal:** Port the React + Vite web app to a true cross-platform native app (Android + iOS + Web) using Kotlin Multiplatform and Compose Multiplatform.

- Shared business logic in Kotlin (stores, API calls, validation)
- Compose Multiplatform UI for Android and iOS
- Web target retained via Kotlin/Wasm or a thin React wrapper
- Supabase has a Kotlin client (`supabase-kt`) — direct migration path for all stores
- Auth: Supabase Auth via `supabase-kt`, replacing `@supabase/supabase-js`
- Points, events, registrations, QR scanning all need Kotlin equivalents

**Why deferred:** Requires a full architecture rewrite. Not feasible before April 30.

### 19.2 Group Chat
**Goal:** Async chapter-scoped message board for members within the same chapter.

- Minimum: chapter-scoped threads (topic + replies)
- Stretch: real-time via Supabase Realtime (broadcast)
- Moderation: officers can delete messages
- Entry point: Dashboard quick action or Profile → Community
- DB tables needed: `chat_threads`, `chat_messages`

**Why deferred:** L2 item in current sprint. Only ship if Kenshin confirms bandwidth in Week 4.

### 19.3 Swipe Left/Right Social Feed
**Goal:** TikTok/Instagram Reels-style vertical swipe feed for DEVCON content (events, posts, spotlights).

- Vertical swipe gesture (framer-motion `drag` + `dragConstraints`)
- Cards: event promos, news highlights, chapter spotlights, job opportunities
- Swipe right = save/bookmark, swipe left = dismiss
- Feed algorithm: mix of upcoming events + recent news + hot jobs
- Entry point: dedicated tab or Dashboard banner expansion

**Why deferred:** High-complexity UX requiring gesture tuning, feed ranking logic, and new data structures. Post-KMP migration it would be built natively with Compose.

### 19.4 Realtime / Connection Model (RESOLVED by inversion — 2026-06-14)
**What changed:** Rather than chase always-on Supabase Realtime resilience, the model was **inverted to
polling-first** (June 14). Supabase Free tier caps Realtime at 200 concurrent connections (fails hard past
it) and WAL→JSON replication was ~76% of DB execution time, so always-on subscriptions were removed.

- Current state: `recover()` (HTTP refetch) on `visibilitychange` / `online` / 60 s / auth-change, with
  +5 s/+15 s follow-ups. `subscribeToChanges` on events/points/rewards/missions are no-ops; only a
  **best-effort** announcements channel remains (gives up on `CHANNEL_ERROR`/`TIMED_OUT`).
- The `supabase_realtime` publication is pruned to `event_registrations` + `event_announcements` only.
- To re-enable always-on realtime (e.g. after a Supabase Pro upgrade lifts the 200-connection cap), restore
  the handlers from git history and re-add tables to the publication.
- Key files: `MemberLayout.tsx`, `OrganizerLayout.tsx`, `useEventsStore.ts`, `useNotificationsStore.ts`.
- See `.claude/rules/db-connection-resilience.md` for the full (inverted) spec.

---

## 📁 Related Documents

- [`README.md`](../README.md) — developer setup guide (install, run, build, deploy, env)
- [`PRD.md`](../PRD.md) — product requirements + developer handover
- [`.claude/context/HANDOVER.md`](./context/HANDOVER.md) — full project transition documentation
- [`.claude/rules/db-connection-resilience.md`](./rules/db-connection-resilience.md) — polling-first realtime rule (non-negotiable)
- [`.claude/rules/vercel-build-safety.md`](./rules/vercel-build-safety.md) — TypeScript flags that fail the Vercel build
- [`docs/auth/`](../docs/auth/) — Firebase auth + bridge-JWT architecture, flows, edge-function auth, troubleshooting

> **Note:** earlier versions referenced a `DEVCON_PLUS.md` companion file; it does not exist in this repo. The
> content it described (team setup, roadmap, feature checklist) now lives in `PRD.md` and `HANDOVER.md`.
