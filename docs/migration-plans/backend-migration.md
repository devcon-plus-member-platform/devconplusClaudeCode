# Backend Migration Plan — Move Data Operations from Frontend (supabase-js) into NestJS Gateway

> Executes **Phases 5–6** of [auth-migration.md](./auth-migration.md). Companion doc, not a replacement.
>
> **Host decision change:** this plan targets **AWS EC2** for the NestJS service, superseding the Cloud Run decision recorded in [auth-migration.md](./auth-migration.md) (§"Cloud Run deployment specifics") and project memory. Rationale is in §5 (cold starts now hit latency-sensitive paths once NestJS is on the critical write/scan path). The same Docker image runs on both, so the choice is reversible.
>
> **Progress — as of 2026-06-04:**
> - ✅ Scaffolding PR — `common/authz/`, `base.repository.ts`, `common/throttler/`, ESLint DAL rule, global prefix, health endpoint, `QR_JWT_SECRET` env validation
> - ✅ Slice 1 — `UsersModule` (GET/PATCH `/api/users/me`, POST `/api/users/me/avatar`); `useAuthStore.updateProfile`/`uploadAvatar` migrated to `apiFetch`; 4 security issues addressed (mass-assign, magic-byte MIME, Multer size cap, avatar URL injection); 107 tests passing
> - ✅ Slice 2 — `RewardsModule` (8 endpoints, 3 atomic RPCs: `redeem_reward`, `approve_reward_claim`, `refund_reward_claim`); `useRewardsStore` 8 operations migrated to `apiFetch`
> - ⏳ **Next: Slice 3 — `VolunteersModule`** (`approve_volunteer_application` RPC; `useVolunteerStore`, `useOrgVolunteerStore`)

## Context

**Why this is happening.** The auth migration (Firebase Auth + NestJS JWT bridge, Phases 0–4) is **complete and live**. Today the frontend still talks to Supabase *directly* via supabase-js for all data, injecting a NestJS-signed bridge JWT so RLS keeps working. We now move backend operations off the frontend and into NestJS, behind a clean layered architecture so the database (and Supabase as a whole) becomes swappable later.

**Target architecture:** `Controller (presentation) → Service (business logic) → Repository (DAL) → Supabase Postgres`. The DAL is the *only* layer that imports supabase-js.

**Locked decisions:**
1. **Scope = Prioritized cutover.** Before mid-June launch: move all **writes**, all **RPC business logic**, and all **owner-scoped/sensitive reads** to NestJS. Public reads (events list, jobs, news, chapters, rewards catalog, interest_options) may stay on direct supabase-js until after launch.
2. **DAL = supabase-js (service role) behind repository interfaces.** Only `*.repository.ts` files import supabase-js. Controllers/services never touch it.
3. **Realtime = stays on Supabase.** Frontend keeps a thin supabase-js client solely for the 10 realtime channels. Not migrated now.
4. **Host = AWS EC2** (see §5).

---

## What already exists (reuse, don't rebuild)

| Primitive | Location | Role in this migration |
|---|---|---|
| `AuthGuard` (Firebase ID token → resolves `profile`) | [server/src/auth/auth.guard.ts](../../server/src/auth/auth.guard.ts) | Auth for **every** new endpoint; basis for `RolesGuard` |
| `@CurrentUser()` → `{firebaseUid, profileId, profile}` | [server/src/auth/current-user.decorator.ts](../../server/src/auth/current-user.decorator.ts) | Source of identity, role, chapter — never trust client body |
| `SupabaseService` (service-role client + `.raw`) | [server/src/supabase/supabase.service.ts](../../server/src/supabase/supabase.service.ts) | The single supabase-js injection point; feeds base repository |
| `apiFetch<T>()` (injects Firebase token, 401 retry) | [web/src/lib/api.ts](../../web/src/lib/api.ts) | The frontend seam every migrated store calls |
| `ConfigModule` + `validateSync` env check | [server/src/config/env.validation.ts](../../server/src/config/env.validation.ts) | Fail-fast on missing secrets; add `QR_JWT_SECRET` |
| Multi-stage Dockerfile (node:20-alpine, non-root) | [server/Dockerfile](../../server/Dockerfile) | Reused as the EC2 artifact (arm64 build) |
| `award-points-on-scan` edge fn | [supabase/functions/award-points-on-scan/index.ts](../../supabase/functions/award-points-on-scan/index.ts) | **Canonical authz/chapter-scope/atomic-checkin logic to port into QrModule** |

---

## Migration surface (what needs a NestJS home)

- **~19 tables** written/owner-read from the frontend across 14 Zustand stores + admin pages.
- **~17 RPCs** = the real business logic: `redeem_reward`, `approve_reward_claim`, `refund_reward_claim`, `approve_volunteer_application`, `manual_checkin`, `approve_organizer_upgrade`/`reject_organizer_upgrade`, `officer_approve_upgrade`, `officer_demote_coorganizer`, `admin_update_user_role`, `approve_mission_winner`, `delete_own_account`, `increment_member_points`, + 5 analytics RPCs.
- **8 Edge Functions** → reimplement as controllers: `generate-qr-token`, `generate-user-qr`, `generate-pending-qr`, `award-points-on-scan`, `approve-at-door`, `check-rate-limit`, `send-email` (EmailModule exists), `delete-user` (covered by `DELETE /auth/account`).
- **3 storage buckets** (`avatars`, `event_covers`, `reward_images`) — `avatars` migrates in the pilot; others can follow post-launch.
- **10 realtime subscriptions** — stay on Supabase (locked).

---

## 1. NestJS structure (layered)

Enforce one invariant with an ESLint `no-restricted-imports` rule: **only `*.repository.ts` may inject `SupabaseService` / import supabase-js.** This is what makes "swap the DB later" real.

```
server/src/
  common/
    authz/  roles.decorator.ts | roles.guard.ts | chapter-scope.ts | authz.ts (role hierarchy)
    repository/ base.repository.ts   # abstract: `get db() { return supabase.raw }`, unwrap(), rpc()
    dto/    pagination.dto.ts | id-param.dto.ts (@IsUUID)
    throttler/ rate-limit.guard.ts | rate-limit.repository.ts  # wraps check_rate_limit RPC
  users/        users.{module,controller,service,repository}.ts   # pilot: profile + avatar
  rewards/      + redemptions.repository.ts                        # redeem/approve/refund RPCs
  volunteers/   organizer-upgrades/   registrations/   points/   missions/   referrals/
  admin/        + analytics.repository.ts                          # role updates + analytics RPCs
  qr/           qr.controller.ts | qr.service.ts | qr-token.service.ts  # the 8 edge fns
```

**Base repository convention** (`common/repository/base.repository.ts`): injects `SupabaseService` once; exposes `protected get db()` (= `supabase.raw`), `unwrap<T>({data,error})` (maps `PostgrestError` → Nest exception, kills `if (error) throw` boilerplate), and `rpc<T>(fn,args)` (maps the `{success,error}` RPC envelope → value or `BadRequestException`). Concrete repos extend it, define **plain interfaces** (e.g. `RewardsRepository`) the service depends on, and are provided via a Nest token (`{ provide: REWARDS_REPOSITORY, useClass: SupabaseRewardsRepository }`) so a future Firestore impl is a one-line swap.

**Routing gotcha:** existing auth routes live at `/auth/*` with **no global prefix**, and `api.ts`/`authBridge.ts` call them by full path. If we add `app.setGlobalPrefix('api')`, those break. Decision: add `setGlobalPrefix('api', { exclude: ['auth/(.*)'] })` so new feature endpoints are `/api/*` while existing `/auth/*` keep working — or namespace new controllers manually (`@Controller('api/rewards')`). Recommend the global-prefix-with-exclude approach.

## 2. Authorization layer

**Auth token = Firebase ID token via the existing `AuthGuard`** (not the bridge JWT). This is the Phase 7 end-state and needs zero `api.ts` changes — it already sends the Firebase token. The bridge JWT (`SupabaseJwtService` / `SUPABASE_JWT_SECRET`) keeps serving **unmigrated** slices + edge functions until Phase 7; do not drop it early.

- `@Roles(...)` + `RolesGuard` (reads `profile.role` off the request via `Reflector`, with an `isAtLeast()` hierarchy helper). Used `@UseGuards(AuthGuard, RolesGuard)`.
- **Chapter-scoping** is data-dependent → a service helper `assertSameChapter(user, resource.chapter_id)` (officer must match; hq/super bypass), ported verbatim from `award-points-on-scan`. Plus `assertChapterLock(event, member)` for locked events.
- **Owner-only** (`auth.uid()=user_id`) → repository query filtered by `user.profileId`; never accept `user_id`/`chapter_id` from the request body (IDOR defense). Pair with `@IsUUID()` on `:id` params.
- **Every migrated slice needs positive AND negative integration tests** (own data accessible; other user's/chapter's data rejected) — without RLS there's no DB backstop.

### RLS-policy-shape → NestJS equivalent

| RLS policy shape | NestJS equivalent |
|---|---|
| `USING (auth.uid() = user_id)` (owner read/write) | Repository query filtered by `user.profileId`; never accept `user_id` from client body |
| `role IN ('chapter_officer','hq_admin','super_admin')` | `@Roles('chapter_officer')` + `RolesGuard` (with hierarchy) |
| officer limited to own chapter | `assertSameChapter(user, resource.chapter_id)` in service after fetch; or repo `chapterId` filter on list |
| chapter-lock on events | `assertChapterLock(event, member)` service helper |
| super_admin-only (role updates) | `@Roles('super_admin')` |
| public read (events/jobs/news catalog) | no guard (stays direct until post-launch) |

## 3. Rate limiting

- **Keep `check_rate_limit` RPC** for security-sensitive identity-keyed buckets (`qr_scan`, `qr_generate`, `login`, `signup`, `org_upgrade`, `password_reset`) wrapped behind `RateLimitGuard` + `rate-limit.repository.ts`. Build identifier from `@CurrentUser` (`user:<profileId>`) or `ip:<x-forwarded-for>`. **Fail closed** (429 on RPC error), matching the edge function.
- **Add `@nestjs/throttler`** (in-memory) as a coarse per-IP flood guard. Single-instance EC2 → in-memory is correct and free; **no Redis** unless/until horizontal scale-out.

---

## 4. Per-slice sequencing

Each slice = NestJS endpoints → frontend store/page switched to `apiFetch` → bake → **drop that table's RLS last** (only after negative tests pass in prod). Deploy NestJS before the frontend that calls it.

**Group A — before mid-June launch (writes + RPCs + sensitive reads):**
1. ✅ **Users/profile + avatar** (`UsersModule`) — *pilot*; proves the triad + `api.ts` round-trip end-to-end. (`useAuthStore.updateProfile`/`uploadAvatar`) — **done 2026-06-04**
2. ✅ **Reward redemptions + reward writes** (`RewardsModule`) — `redeem_reward`/`approve_reward_claim`/`refund_reward_claim`; catalog read may stay direct. (`useRewardsStore`) — **done 2026-06-04**
3. ⏳ **Volunteer applications** — `approve_volunteer_application`. (`useVolunteerStore`, `useOrgVolunteerStore`) — **next**
4. **Organizer upgrades** — `approve/reject/officer_approve/officer_demote` + `organizer_codes` + `org_upgrade` rate bucket. (`useAuthStore.requestOrganizerUpgrade`, `OrgCoOrganizers`, AdminCMS)
5. **Admin role + analytics** (`AdminModule`) — `admin_update_user_role` (super_admin) + 5 analytics RPCs. (`AdminDashboard`, `AdminUsers`)
6. **QR pipeline** (`QrModule`) — port the 5 QR/scan edge functions; **auth flips from `verifyCallerJwt` (bridge JWT) to `AuthGuard` (Firebase)** atomically with its frontend cutover. Highest-risk A slice (points integrity) → sequence last in A. (`EventTicket`, `MyQR`, `AdminKiosk`, `EventRegistrants`)
   > ⚠️ `QR_JWT_SECRET` in `server/.env` is a local placeholder — must be synchronized with the live Supabase Edge Function secret before this slice deploys.
7. **Event registrations + manual check-in** (`RegistrationsModule`) — shares `registrations.repository.ts` with QrModule. (`useEventsStore`)
8. **Points** (`PointsModule`) — `point_transactions` owner reads, `xp_tiers`, `increment_member_points`; ensure write path is server-only after 6/7.
9. **Missions** (`MissionsModule`) — `approve_mission_winner`, submissions/participants.

**Group B — after launch:** broad public reads (events/jobs/news/chapters/interest_options), referrals, then (much later, if ever) realtime.

---

## 5. AWS EC2 deployment

- **Instance:** `t4g.small` (ARM Graviton, 2 vCPU/2 GiB) in `ap-southeast-1` (Singapore). Build the existing Dockerfile for `linux/arm64`.
- **Run:** existing Docker image via **docker compose managed by a systemd unit** (auto-restart, start-on-boot). PM2+node is the fallback.
- **Reverse proxy + TLS:** nginx terminating TLS for `api.devcon.ph`, proxying to `127.0.0.1:8080`; **Certbot/Let's Encrypt** + renewal timer. nginx sets `X-Forwarded-For`/`-Proto`; set Nest `trust proxy` so rate-limit IP extraction works.
- **Secrets:** **AWS SSM Parameter Store** (SecureString) for `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `GMAIL_APP_PASSWORD`, `EMAIL_VERIFICATION_SECRET`, `QR_JWT_SECRET`. Inject into container env at deploy. Root-only `.env` is the acceptable launch fallback. `validateSync` fails the boot if any are missing.
- **Security groups:** 443 + 80 (ACME) open; 22 via SSM Session Manager (no open SSH preferred); 8080 bound to localhost only.
- **CORS:** set `CORS_ORIGIN` (already read in `main.ts`) to the Vercel prod URL(s) + custom domain.
- **Health:** add `GET /api/health` (or reuse `AppController` root) → 200; CloudWatch alarm on status-check + synthetic.
- **Redeploy:** `docker compose up -d` recreate (~1–2s blip); blue/green on 8080/8081 + `nginx -s reload` is the no-drop upgrade path.
- **Logging:** container stdout → CloudWatch Logs (awslogs driver or CW agent).
- **Cost:** ~$16–20/mo on-demand, ~$11–14/mo with a 1-yr Savings Plan (instance + gp3 EBS + CloudWatch + Route53).
- **Tradeoff vs Cloud Run (the prior decision):** Cloud Run min-instances=0 is ~$0–5/mo but has 0.8–1.5s cold starts. That was acceptable for auth-only traffic, but once NestJS is the gateway for all writes + QR scans + redemptions, cold starts hit interactive, latency-sensitive paths (an organizer scanning a queue of attendees can't eat 1.5s on the first scan). EC2 always-on removes cold starts for a fixed ~$15/mo more. Same image → reversible.

---

## Risks

- **RLS safety net gone per slice** → drop RLS last; never trust client `user_id`/`chapter_id`; enforce the repository-only-imports-supabase lint rule.
- **Transaction atomicity** — `award-points-on-scan` is 3 statements (claim → insert txn → increment). Decomposing into 3 supabase-js calls reproduces the non-atomic race. **Keep multi-step money/points logic inside a single Postgres RPC** wrapped by one repo call; revisit when DAL gets real transactions.
- **Bridge JWT coexistence** — keep `SUPABASE_JWT_SECRET` + bridge until the last direct supabase-js write/sensitive-read is gone (Phase 7).
- **EC2 SPOF** — CloudWatch auto-recovery + EBS snapshots + a "relaunch from AMI" runbook; frontend degrades gracefully when API is unreachable. HA (ALB + 2 instances) is the post-launch upgrade.
- **Service-role key leak** is catastrophic (bypasses all RLS) → SSM SecureString, IAM-scoped instance role, `.dockerignore` excludes `.env*`, scrub logs.

---

## Execution order (first PRs)

1. ✅ **Scaffolding PR** — `common/authz/` (`@Roles`, `RolesGuard`, `chapter-scope`), `common/repository/base.repository.ts`, `common/throttler/`, ESLint repository-import rule, `setGlobalPrefix('api', { exclude: ['auth/(.*)'] })`, `GET /api/health`, add `QR_JWT_SECRET` to env validation, `@nestjs/throttler` global config.
2. ✅ **Slice 1 PR (pilot)** — `UsersModule` (profile read/update + avatar upload) end-to-end; refactor `useAuthStore` to `apiFetch`. RLS drop pending prod smoke test.
3. ✅ **Slice 2 PR** — `RewardsModule` (8 endpoints, 3 atomic RPCs); `useRewardsStore` migrated.
4. Proceed slice-by-slice through Group A (§4) — **next: Slice 3 (VolunteersModule)**.

## Verification

- **Per slice:** Jest integration tests — **positive** (own data via new endpoint) + **negative** (other user's/chapter's data rejected); confirm realtime still works for not-yet-migrated tables; commit the RLS-drop migration alongside.
- **Pilot end-to-end:** sign in → edit profile + upload avatar via `/api/users/me` → confirm DB row updated and direct Supabase Storage upload with a bridge JWT is now rejected (RLS dropped).
- **QR slice:** organizer scan → points awarded once (double-scan idempotent), chapter-scope + chapter-lock enforced, rate limit returns 429 past the bucket.
- **Build gate:** `cd server && npm run build && npm test`; `cd web && npm run typecheck && npm run build` (Vercel parity per [.claude/rules/vercel-build-safety.md](../../.claude/rules/vercel-build-safety.md)).
- **EC2 smoke:** `curl https://api.devcon.ph/api/health` → 200; sign-in + a migrated write from the deployed Vercel frontend pointed at `VITE_API_URL`.
