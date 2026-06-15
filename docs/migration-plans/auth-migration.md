# Migrate Auth from Supabase Auth to Firebase Auth (JIT) — Forward-Compatible Architecture

## Context

We're replacing **Supabase Auth** with **Firebase Auth** as the identity provider, via **JIT (Just-In-Time)** migration. Most users sign in with Google OAuth, which makes JIT zero-friction for the majority.

**Forward constraint (new):** Supabase as a whole may exit the stack later — Storage is the first likely cutover, the database is possible after. So this migration must **not deepen Supabase-specific coupling**. In particular: every `auth.uid()` reference in RLS is a Supabase-Auth-shaped contract that becomes dead weight when Supabase leaves. We treat those as transitional from day one.

**What stays (for now):** Supabase Postgres, Realtime, Storage, all 30+ tables that reference `profiles(id)`, the custom QR JWT pipeline (`QR_JWT_SECRET`).

**What's transitional:** Supabase Auth's JWT shape, the `on_auth_user_created` trigger, every RLS policy that uses `auth.uid()`, every direct `supabase.auth.*` call in the frontend.

**The endgame architecture:** Firebase Auth = identity. NestJS = API gateway & authorization. Storage/DB = commodity backends behind NestJS. RLS = removed. Frontend talks to NestJS, not Supabase directly.

---

## Architecture: Transitional JWT Bridge → NestJS Gateway

Two phases of architecture in one migration:

### Today's target (Phases 1–4): JWT Bridge

```
Firebase Auth ──► NestJS /auth/exchange ──► signs Supabase-compatible JWT
                                              (sub = profiles.id)
                                                       │
                                                       ▼
Frontend still calls supabase-js directly ◄── Supabase JWT keeps RLS working
```

NestJS verifies Firebase ID tokens and re-issues Supabase-compatible JWTs signed with `SUPABASE_JWT_SECRET`. The frontend keeps using `supabase-js` for queries; RLS keeps working because `auth.uid()` continues to read the same UUID. No code change to RLS, Realtime, or Storage policies. **Critical:** this bridge is **transitional, not permanent**. Every new feature should land on NestJS endpoints (not direct supabase-js calls) so the bridge has nothing to support eventually.

### Tomorrow's target (Phases 5–7): NestJS Gateway

```
Firebase Auth ──► Firebase ID token ──► NestJS endpoints ──► Supabase (or anything)
                                            │
                                            ▼
                                  authz in application code
                                  (no RLS, no auth.uid())
```

NestJS verifies the Firebase ID token directly. Authorization lives in application code (TypeScript). Supabase is accessed with the service role key (RLS bypassed). Postgres is reduced to a queryable backend. **When Supabase Storage leaves, only NestJS's storage adapter swaps. When Postgres leaves, only NestJS's repositories swap. Frontend doesn't notice.**

`★ Insight ─────────────────────────────────────`
- The end-state architecture (NestJS gateway, authz in code) is **independent of which DB we run**. That's the whole point — we're not "moving to Firestore", we're "removing Supabase-specific coupling so we can choose any DB later, including Firestore, Postgres-on-RDS, or whatever wins next year."
- This is the same architecture every mature SaaS converges on. Supabase RLS was a productivity hack for the MVP phase; it has run its course as the team grows and the storage/DB story changes.
- **The JWT bridge has a sunset date**: it dies the moment the last direct `supabase-js` call from the frontend is migrated to a NestJS endpoint. That's a measurable, finite migration.
`─────────────────────────────────────────────────`

---

## The `auth.uid()` & RLS Exit Path

`auth.uid()` is referenced by **~20 RLS policies** across [supabase/migrations/012_rls_policies.sql](supabase/migrations/012_rls_policies.sql), [014_realtime_and_missing_rls.sql](supabase/migrations/014_realtime_and_missing_rls.sql), [20260318_rewards_engine.sql](supabase/migrations/20260318_rewards_engine.sql), [20260322_idor_hardening.sql](supabase/migrations/20260322_idor_hardening.sql), [20260406_missions.sql](supabase/migrations/20260406_missions.sql), and the avatars storage policy. The exit strategy:

| Phase | `auth.uid()` status |
|-------|---------------------|
| 1–4 (bridge active) | Keeps working unchanged. NestJS issues JWTs with `sub = profiles.id`, so `auth.uid()` returns the right UUID. |
| 5 (pilot) | Pick one slice (recommended: avatar upload + storage RLS). Migrate to NestJS-mediated endpoint. Drop the slice's RLS. Prove the pattern. |
| 6 (roll-out) | For each table, in lowest-risk order: route its read/write through NestJS, then drop its RLS policies. Edge Functions become NestJS controllers in the same step. |
| 7 (sunset) | Last direct supabase-js call gone → drop the JWT bridge → all remaining RLS dropped → `auth.uid()` no longer referenced anywhere. Supabase becomes interchangeable. |

**Authorization logic post-RLS** — every dropped RLS policy gets a NestJS equivalent in code:

```ts
// Before (RLS policy):
//   CREATE POLICY "Members view own registrations" ON event_registrations
//     FOR SELECT USING (auth.uid() = user_id);
//
// After (NestJS controller):
@Get('event-registrations')
async list(@CurrentUser() user: AuthenticatedUser) {
  return this.db.eventRegistrations.findMany({ where: { user_id: user.profileId } });
}
```

This is more verbose but **portable** — works against Postgres, Firestore, MongoDB, anything. And it's testable in isolation without spinning up a database.

### Per-slice migration order (Phase 6 sequencing)

Lowest-risk-first. Each slice = a coordinated change across (a) NestJS controller, (b) frontend store, (c) RLS drop, (d) Edge Function deprecation if applicable.

1. **Avatars** (storage RLS, single endpoint, no realtime) — pilot in Phase 5
2. **Reward redemptions** (read-only from member side; admin writes via existing RPC)
3. **Volunteer applications** (low write rate, queue semantics)
4. **Organizer upgrade requests** (admin-mediated, low traffic)
5. **Event registrations** (high traffic but well-bounded; QR check-in flow needs care)
6. **Point transactions** (read-mostly, write happens only via Edge Functions today — replace those Edge Functions with NestJS controllers in the same step)
7. **Missions** (newer table, RLS easy to swap)
8. **Events / Jobs / News reads** (the broad "browse" surface — biggest frontend refactor)
9. **Realtime channels** (the hardest — needs a NestJS WebSocket gateway, SSE, or kept on Supabase Realtime as the last holdout)

Don't try to do this in one quarter. Spread across the post-MVP roadmap, alongside feature work.

---

## Identity Mapping

Add one column to `profiles` (implemented in [supabase/migrations/20260528_firebase_auth_foundation.sql](supabase/migrations/20260528_firebase_auth_foundation.sql)):

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_uid text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_uid_key
  ON profiles(auth_uid)
  WHERE auth_uid IS NOT NULL;
```

A **partial unique index** is used instead of a `UNIQUE` table constraint: it's idempotent (`IF NOT EXISTS` works), enforces uniqueness only for the non-null rows, and skips indexing the NULL majority during the JIT window. Same uniqueness semantics, smaller index.

- `profiles.id` (UUID) remains the canonical identifier across the schema. **Never changes.**
- `profiles.auth_uid` (text) is the linkage. Populated lazily as users JIT-migrate.
- `profiles.email` is the lookup key during JIT.

### `profiles.id` ≠ `auth_uid` — they are deliberately different values

For **every** user (existing JIT-migrated AND new post-Phase 4 signups), `profiles.id` and `auth_uid` are different values, by design:

| Column | Type | Source | Example |
|--------|------|--------|---------|
| `profiles.id` | `uuid` | We generate (NestJS via `crypto.randomUUID()`, or `gen_random_uuid()` in SQL) | `4a8e1b7c-2d3f-4a5b-9c8d-1e2f3a4b5c6d` |
| `auth_uid` | `text` | Firebase Auth auto-generates | `mYxIrqGn9OO2DhFhrahzMQy8Pte2` |

**Why not unify them?**
- `profiles.id` is *our* identifier — referenced by 30+ FK relationships across the schema. Changing its type to text would be a massive breaking migration.
- Firebase auto-generates UIDs as 28-char base62 strings, not UUIDs. You can't make them match without forcing Firebase to accept our UUID, which is only possible via Admin SDK `createUser({ uid })` — not via the OAuth flow that Google sign-in uses.
- Keeping them separate means our identity layer is portable: if we ever migrate off Firebase (Auth0, Clerk, custom JWT), we drop `auth_uid` and the rest of the schema doesn't care.
- Same pattern as `stripe_customer_id`, `slack_user_id`, `github_id` — external IDs are foreign linkages, not canonical IDs.

**FK to `auth.users` (`profiles.id REFERENCES auth.users`)** gets dropped in Phase 4. From that moment on, `profiles` stands alone and survives a Supabase Auth shutdown.

---

## JIT Migration Mechanics

### Google OAuth users (~80% of users)
1. Click "Continue with Google" → Firebase Web SDK opens Google popup
2. Firebase verifies the Google ID token, returns a Firebase ID token to client
3. Client POSTs Firebase ID token to `POST /auth/firebase/exchange`
4. NestJS verifies ID token (Firebase Admin SDK)
5. **NestJS enforces `decoded.email_verified === true`** — without this, an attacker could sign up to Firebase claiming a victim's email (Firebase does not require verification upfront) and trigger JIT-link to the victim's profile. Google OAuth always sets this true; email/password signups flip true only after the user clicks the verification email. See [.claude/memory/feedback_jit_email_verification.md] for the full rationale.
6. NestJS looks up profile: by `auth_uid` → else by `email` (JIT link) → else call `create_profile_with_bonus()` RPC. The existing `trg_award_signup_bonus` AFTER INSERT trigger on profiles awards the 100pt welcome bonus automatically — NestJS does not duplicate point logic.
7. NestJS signs Supabase JWT: `sub = profiles.id`, `role = 'authenticated'`, `aud = 'authenticated'`, `exp = now + 1h`
8. NestJS also issues an internal session record for refresh tracking
9. Client calls `supabase.auth.setSession({ access_token, refresh_token })` — the bridge JWT becomes the active session

### Email/password users (~20%)
1. User enters email + password → frontend calls `POST /auth/email/signin` (NOT Firebase SDK directly)
2. NestJS checks Firebase first via `admin.auth().getUserByEmail()`:
   - If Firebase user exists → verify password via Firebase Auth REST `signInWithPassword` → exchange normally
3. If Firebase rejects with `user-not-found`, **fall back to legacy**:
   - Call Supabase Auth REST `POST /auth/v1/token?grant_type=password` with same credentials
   - On success (password correct in legacy system): create Firebase user with `admin.auth().createUser({ email, password })` — Firebase auto-hashes with scrypt
   - Look up existing profile by email, set `auth_uid`
   - Sign Supabase JWT and return
4. Next sign-in for this user goes through Firebase directly (legacy fallback never fires again)

### Password reset (during JIT window)
- "Forgot password" routes to Supabase legacy reset until `profiles.auth_uid` is non-null
- Once migrated, password reset routes to Firebase's reset email
- The decision is per-user, based on `auth_uid` being null

### New sign-ups (post-Phase 2)
- New users sign up through Firebase directly via NestJS `/auth/email/signup` (Firebase-only)
- `on_auth_user_created` trigger never fires (no new `auth.users` rows)
- NestJS calls `create_profile_with_bonus()` RPC to create the profile

---

## Components to Build

### 1. NestJS bridge + gateway foundation ([server/](server/))
Currently stub ([server/src/main.ts](server/src/main.ts)). Build:
- **AuthModule** with Firebase Admin SDK (service account JSON from env)
- **JwtService** signs HS256 with `SUPABASE_JWT_SECRET` (using `jsonwebtoken` or `jose`)
- **SupabaseService** (admin client with `SUPABASE_SERVICE_ROLE_KEY`)
- **AuthGuard** that verifies Firebase ID token from `Authorization: Bearer` header — **this is the foundation of the NestJS gateway era**
- **CurrentUser decorator** that resolves to `{ firebaseUid, profileId, profile }` — backed by a single profile lookup, cached per-request
- **Endpoints:**
  - `POST /auth/firebase/exchange` — `{ id_token }` → `{ access_token, refresh_token, profile }`
  - `POST /auth/email/signin` — JIT legacy fallback
  - `POST /auth/email/signup` — Firebase-only
  - `POST /auth/email/reset` — routes to Supabase or Firebase per `auth_uid` state
  - `POST /auth/refresh` — `{ refresh_token }` → new pair
  - `POST /auth/account/delete` — Firebase + legacy + RPC cascade
- **Rate limiting:** reuse the SQL-backed pattern from [supabase/functions/check-rate-limit/](supabase/functions/check-rate-limit/), or migrate to a NestJS Redis-backed guard (the latter is more portable — pick this if Redis is already in the deployment story)

### 2. Frontend Firebase + bridge plumbing ([web/src/lib/](web/src/lib/))
- New: `[web/src/lib/firebase.ts]` — Firebase Web SDK init from `import.meta.env.VITE_FIREBASE_*`
- New: `[web/src/lib/authBridge.ts]` — `exchangeFirebaseToken()`, `refreshSupabaseToken()`, `setupSupabaseSession()`
- New: `[web/src/lib/api.ts]` — typed fetch wrapper for NestJS endpoints (auto-injects Firebase ID token; auto-retries with refresh on 401). **This file is the seed of the Phase 6 NestJS gateway. Every new feature should use it.**

### 3. useAuthStore refactor ([web/src/stores/useAuthStore.ts](web/src/stores/useAuthStore.ts))
- Replace `signInWithOAuth({ provider: 'google' })` → Firebase `signInWithPopup(GoogleAuthProvider)` + bridge exchange
- Replace `signInWithPassword()` → NestJS `/auth/email/signin` (handles JIT)
- Replace `signUp()` → NestJS `/auth/email/signup`
- Replace `resetPasswordForEmail()` → NestJS `/auth/email/reset`
- Replace `updateUser({ email })` / `updateUser({ password })` → NestJS endpoints that call Firebase Admin SDK
- Keep `supabase.auth.onAuthStateChange()` listener — fires when `setSession()` is called; useful for re-establishing realtime channels per [.claude/rules/db-connection-resilience.md](.claude/rules/db-connection-resilience.md)
- Set `autoRefreshToken: false` in [web/src/lib/supabase.ts](web/src/lib/supabase.ts) — NestJS owns refresh now
- Add Firebase `onIdTokenChanged` → triggers `/auth/refresh` automatically

### 4. Replace `handle_new_user()` trigger
- New migration: extract trigger logic into RPC `create_profile_with_bonus(p_id, p_email, p_full_name, p_chapter_id, p_username, p_school_or_company)`
- NestJS calls this RPC when creating a brand-new profile
- Phase 4 drops the trigger (or leaves it as a no-op safety net)

### 5. Update `delete_own_account()` RPC ([supabase/migrations/015_storage_and_account_deletion.sql](supabase/migrations/015_storage_and_account_deletion.sql))
- Remove the `DELETE FROM auth.users` line
- NestJS endpoint orchestrates: call RPC → call Firebase Admin `deleteUser(auth_uid)` → optionally clean up legacy `auth.users` row during JIT window

### 6. Edge Functions: swap `auth.getUser()` for manual JWT verify (Phase 4)
All 7 Edge Functions in [supabase/functions/](supabase/functions/) call `supabase.auth.getUser()` today. After the FK drop, those calls fail. **Mitigation:** add a shared helper `[supabase/functions/_shared/verifyJwt.ts]` that decodes Supabase JWT manually with `SUPABASE_JWT_SECRET` (same djwt pattern already used for `QR_JWT_SECRET`). Replace all 7 call sites. ~5 lines change per function.

In Phase 6, the Edge Functions get rewritten as NestJS controllers per slice. After that the Edge Functions are deleted.

---

## Token Refresh Strategy

Issue **short-lived Supabase JWTs (1h)**, matching Firebase ID token TTL. Two refresh options:

**Option A (recommended for simplicity):** Use Firebase ID token as the refresh proof.
- Client calls `/auth/refresh` with a fresh Firebase ID token (which Firebase SDK rotates silently every hour)
- NestJS verifies the Firebase token, signs a new Supabase JWT
- No `auth_refresh_tokens` table needed

**Option B:** Issue our own opaque refresh tokens, stored in an `auth_refresh_tokens` table. Adds revocation semantics at the cost of more state.

Pick **A** unless revocation is required for compliance.

**Client-side wiring:** Firebase `onIdTokenChanged` event triggers `/auth/refresh`. Result is fed into `supabase.auth.setSession()`. Recovery pattern in [.claude/rules/db-connection-resilience.md](.claude/rules/db-connection-resilience.md) still applies for network/sleep recovery — adds nothing new.

---

## Phasing

### Phase 0 — Foundation (1 day)
- Create Firebase project (dev + prod) **in the same GCP project as Cloud Run** for unified IAM and Workload Identity later
- Enable Google sign-in in Firebase Auth → Sign-in method → Google. **Let Firebase auto-generate its OAuth client** — do not reuse the existing Supabase OAuth client.
- Generate the Firebase Admin SDK service account JSON (Firebase Console → Project Settings → Service Accounts → Generate New Private Key)
- Migration: `ALTER TABLE profiles ADD COLUMN auth_uid text` + partial unique index + `create_profile_with_bonus()` RPC
  - Implemented in [supabase/migrations/20260528_firebase_auth_foundation.sql](supabase/migrations/20260528_firebase_auth_foundation.sql)
- Update [web/.env.example](web/.env.example) with `VITE_FIREBASE_*` + `VITE_AUTH_PROVIDER` feature flag — done
- Update [server/.env.example](server/.env.example) with `FIREBASE_SERVICE_ACCOUNT_JSON`, `CORS_ORIGIN` — done

### Phase 1 — NestJS bridge + gateway foundation (2–3 days)
- Install `firebase-admin`, `jsonwebtoken`, `@supabase/supabase-js` in [server/package.json](server/package.json)
- Build AuthModule, AuthGuard, CurrentUser decorator (the gateway primitives)
- Build all auth endpoints
- Integration tests: exchange happy path, JIT-link by email, brand-new user, expired token rejection
- **Deploy NestJS to GCP Cloud Run** (region: `asia-southeast1` for PH users; min-instances=**0** in both dev and prod — deliberate scale-to-zero for cost savings; cold start budget absorbed by slim container image). See "Cloud Run deployment specifics" below.

### Phase 2 — Frontend dual-mode, Google first (2–3 days)
- Add Firebase Web SDK to [web/package.json](web/package.json)
- Create [web/src/lib/firebase.ts] and [web/src/lib/authBridge.ts] and [web/src/lib/api.ts]
- Refactor `signInWithGoogle()` to use Firebase + bridge
- Wire `onIdTokenChanged` for auto-refresh
- **Feature flag:** `VITE_AUTH_PROVIDER=firebase` env var, fall back to `supabase` for fast rollback
- Smoke test on Vercel preview: sign-in → events list → realtime → avatar upload → QR ticket

### Phase 3 — Email/password JIT (1–2 days)
- Email/password signin via NestJS with legacy fallback
- Email/password signup via NestJS (Firebase-only)
- Password reset routing logic (Supabase if not migrated; Firebase if migrated)
- Test JIT with a real legacy user
- Test idempotency: signing in twice doesn't duplicate-create

### Phase 4 — Cutover (1 day)
- Disable Supabase Auth signup (Supabase dashboard setting)
- Update Edge Functions: swap `auth.getUser()` for manual JWT verify (deploy first, wait 5 min)
- Drop the `on_auth_user_created` trigger
- Drop the `profiles.id REFERENCES auth.users` FK constraint
- Monitor error rates for 48 hours
- Update [.claude/CLAUDE.md](.claude/CLAUDE.md) Section 5

### Phase 5 — NestJS-mediation pilot: avatars (1 week)
**The point of this phase is to prove the pattern that all later slices will follow.**
- Build NestJS endpoint `POST /api/users/me/avatar` that accepts multipart upload, uses service role to write to Supabase Storage, returns the URL
- Refactor `useAuthStore.uploadAvatar()` to call NestJS instead of `supabase.storage.from('avatars').upload(...)`
- Drop the storage RLS policies on `avatars` bucket
- This slice now has zero `auth.uid()` dependency — if Supabase Storage gets swapped later, only the NestJS endpoint changes

### Phase 6 — Per-slice migration (ongoing, over months)
- For each slice in the order listed in "Per-slice migration order": build NestJS controller, refactor the corresponding store/page, drop RLS for that table
- Each slice is a normal-sized PR (1–3 days). No big-bang refactor
- Track progress: a checklist in [.claude/CLAUDE.md](.claude/CLAUDE.md) or a Linear epic

### Phase 7 — JWT bridge sunset
- When the last direct `supabase-js` call from the frontend is gone, drop the JWT bridge endpoint
- Frontend uses Firebase ID tokens directly against NestJS
- Drop `SUPABASE_JWT_SECRET` from NestJS env
- Backend is now "any DB you want behind NestJS"

---

## Critical Files

**New:**
- `[server/src/auth/auth.module.ts]`, `[auth.controller.ts]`, `[auth.service.ts]`, `[firebase.service.ts]`, `[jwt.service.ts]`, `[supabase.service.ts]`, `[auth.guard.ts]`, `[current-user.decorator.ts]`
- `[web/src/lib/firebase.ts]`, `[web/src/lib/authBridge.ts]`, `[web/src/lib/api.ts]`
- [supabase/migrations/20260528_firebase_auth_foundation.sql](supabase/migrations/20260528_firebase_auth_foundation.sql) — **landed**

**Modified:**
- [web/src/stores/useAuthStore.ts](web/src/stores/useAuthStore.ts) — 12 methods touch `supabase.auth.*`; replace per the refactor section
- [web/src/lib/supabase.ts](web/src/lib/supabase.ts) — `autoRefreshToken: false`
- [web/src/pages/auth/](web/src/pages/auth/) — 6 pages, mostly unchanged since they call store methods
- [web/.env.example](web/.env.example) — add Firebase config vars
- [supabase/functions/_shared/](supabase/functions/_shared/) — add `verifyJwt.ts` helper
- All 7 Edge Functions — swap `auth.getUser()` (Phase 4)
- [supabase/migrations/](supabase/migrations/) — drop trigger, drop FK (Phase 4)
- [supabase/migrations/015_storage_and_account_deletion.sql](supabase/migrations/015_storage_and_account_deletion.sql) — remove `auth.users` delete line
- [.claude/CLAUDE.md](.claude/CLAUDE.md) — Section 5 RBAC, Section 10 stores, Section 12 edge functions

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Refresh token bug locks user out** | Feature flag (`VITE_AUTH_PROVIDER`) for instant rollback. Test refresh under real-world network conditions. |
| **Realtime channels not re-authing after token refresh** | `MemberLayout`/`OrganizerLayout` already listen for `TOKEN_REFRESHED`. Verify `setSession()` fires it. If not, call `resubscribe()` after each setSession. [.claude/rules/db-connection-resilience.md](.claude/rules/db-connection-resilience.md) is the spec. |
| **Legacy password fallback abuse** | NestJS rate-limit guard (5/5min/IP). Log every fallback attempt. Supabase REST has its own edge rate limit as backstop. |
| **Two Firebase records for same user** (Google + email/password) | Email is the dedupe key. Use Firebase's `linkWithCredential` or pre-check `getUserByEmail()` before creating. |
| **`isOAuthOnly` flag in useAuthStore breaks** | Rewrite to check Firebase user's `providerData` array. Same concept, different API. |
| **Email confirmation flow uses Supabase PKCE** | Replace with Firebase's email verification deep link. Drop `verifyOtp()` call in [EmailConfirm.tsx](web/src/pages/auth/EmailConfirm.tsx). |
| **Edge Function `auth.getUser()` fails after FK drop** | Phase 4 swaps these for manual JWT verify *before* the FK drop. Order matters. |
| **Authz bugs sneak in during Phase 6** as RLS is dropped per slice | Write integration tests for each migrated slice — both positive (own data accessible) and negative (other user's data rejected) cases. Without RLS, application-level mistakes have no DB-level safety net. |
| **JIT migration leaves Supabase Auth running indefinitely** | After Phase 5 stabilizes, plan a bulk import of remaining bcrypt hashes from `auth.users` into Firebase using Firebase Auth's bulk import tool (supports bcrypt) — eliminates the legacy fallback path. |
| **NestJS deployment introduces a new SPOF** | Pick a host with good uptime SLA. Frontend should degrade gracefully when NestJS is unreachable (cached profile, queue writes, surface a clear error). |
| **Supabase Realtime is hard to replace later** | Defer the realtime migration to Phase 7 or beyond. It's the highest-risk slice; only attempt after Phase 6 has built confidence in NestJS as the gateway. |

---

## Downtime Analysis

**TL;DR: no planned downtime in any phase.** Existing signed-in users keep their session through the entire migration. New sign-ins use whichever path the feature flag points at. Risk windows exist but are narrow and recoverable.

### Per-phase downtime impact

| Phase | Schema changes | Code changes | User impact | Downtime |
|-------|---------------|--------------|-------------|----------|
| **0 Foundation** | `ALTER TABLE ADD COLUMN auth_uid` (online, nullable), `CREATE INDEX CONCURRENTLY`, new RPC | Env vars only | None | **Zero** |
| **1 NestJS bridge** | None | Deploy new service that nothing currently calls | None | **Zero** |
| **2 Google-first** | None | Frontend deploy with feature flag OFF | None until flag flips. After flip: new Google sign-ins go through Firebase; existing sessions untouched | **Zero**. Bug rollback = flip flag back. |
| **3 Email JIT** | None | NestJS adds legacy fallback, frontend routes email signin through NestJS | New email/password sign-ins go through JIT; existing sessions untouched | **Zero**. Same flag rollback. |
| **4 Cutover** | `DROP TRIGGER`, `ALTER TABLE DROP CONSTRAINT` (both metadata-only, instant) | Edge Functions swap `auth.getUser()` → manual JWT verify (functional no-op at runtime — same JWT shape) | None if Edge Function update is deployed **before** the FK drop | **Zero** if order is followed. See gotcha below. |
| **5 Avatar pilot** | Drop storage RLS for `avatars` bucket | NestJS endpoint + frontend swap | None | **Zero** |
| **6 Per-slice** | Drop RLS per migrated table | NestJS endpoint + frontend swap per slice | None per slice if deploy order is correct | **Zero per slice** |
| **7 Bridge sunset** | None | Drop bridge endpoint, drop `SUPABASE_JWT_SECRET` | Only after verifying no direct supabase-js calls remain | **Zero** if precondition holds |

### The three risk windows (all recoverable)

**Window 1 — Phase 2 Google sign-in regression** (minutes, scoped to new sign-ins)
- Symptom: Google sign-in throws an error after flag flip
- Affected: users attempting to sign in *for the first time* during the window. Existing signed-in users are unaffected.
- Recovery: flip `VITE_AUTH_PROVIDER` back to `supabase` — instant. Old code path is still shipped.

**Window 2 — Phase 4 ordering error** (seconds, can be eliminated)
- Symptom: if FK is dropped *before* Edge Functions are updated, `supabase.auth.getUser()` inside the Edge Function fails because `auth.users` no longer has the matching row → QR scan, generate-token, etc. throw 500
- Affected: all authenticated Edge Function calls during the gap
- Prevention: **strict deploy order — Edge Functions first, wait 5 min for caches/edges to roll, then drop FK**. The Edge Function swap is functionally a no-op at runtime (same JWT verified with same secret, just different code path), so deploying it early is safe.
- Recovery if it happens: revert Edge Functions to old code (the FK drop is recoverable too with `ALTER TABLE ADD CONSTRAINT` — instant in Postgres if the data is consistent)

**Window 3 — Refresh-token continuity for legacy sessions** (the subtle one — addressed below)
- See "Session Continuity for Existing Users" — has its own mitigation, not a real risk if planned.

### Session Continuity for Existing Users

This is the gotcha most plans miss. At Phase 2 flag-flip:
- Existing users have a **Supabase Auth session** in localStorage (access_token + refresh_token issued by Supabase Auth)
- New sign-ins get a **bridge session** (access_token signed by NestJS, refresh_token issued by NestJS)
- These two session types coexist for weeks or months — until every old session naturally expires and re-auths through Firebase

**The two session types behave differently:**

| Session type | Access token signed by | Refresh path |
|--------------|-----------------------|--------------|
| Legacy Supabase | Supabase Auth (`SUPABASE_JWT_SECRET`) | Supabase's `/auth/v1/token?grant_type=refresh_token` |
| Bridge | NestJS (with same `SUPABASE_JWT_SECRET`) | NestJS `/auth/refresh` |

**Both must keep refreshing successfully until the user signs out or re-authenticates.** The risk: if you set `autoRefreshToken: false` globally in [web/src/lib/supabase.ts](web/src/lib/supabase.ts), legacy sessions stop auto-refreshing and silently expire after 1 hour, logging out users en masse.

**Mitigation (already part of the architecture, calling out explicitly):**
- Keep `autoRefreshToken: true` in supabase-js for the entire JIT window
- Add a global `onAuthStateChange` listener that fires on `TOKEN_REFRESH_FAILED`:
  - If we have a Firebase ID token in scope → call NestJS `/auth/refresh` and `setSession()` with the bridge JWT
  - Else → user must re-authenticate (show "Please sign in again")
- For bridge sessions: Supabase will *try* to refresh against Supabase's endpoint, fail (because our refresh_token is opaque to it), `TOKEN_REFRESH_FAILED` fires, our handler takes over and refreshes via NestJS
- For legacy Supabase sessions: Supabase's native refresh works as it does today
- Both paths converge in the same handler

**Phase 4 implication:** when Supabase Auth signups are disabled in dashboard, **do NOT also disable token refresh** — legacy sessions must keep refreshing until they naturally drain (1 week refresh-token TTL by default). The Supabase Auth dashboard's "disable signups" toggle is independent from `/token` refresh.

**Long-tail cleanup:** after all phases stabilize and legacy refresh tokens have aged out (~2 weeks post-cutover), you can fully disable Supabase Auth's `/token` endpoint without affecting anyone.

### Hosting / deploy ordering specifics

- **Vercel preview branch for every phase** — flip the flag on the preview URL first, verify all flows, then promote to production
- **NestJS deploy independence** — Vercel rolls forward instantly; Cloud Run deploys take ~30–90s (build + revision rollout). Deploy NestJS first when a phase needs both, so the frontend never references an endpoint that isn't live yet
- **Edge Function deploys are independent of frontend deploys** — they're separate Supabase deployments. Schedule them with their own change windows

### Cloud Run deployment specifics

The NestJS service lives on GCP Cloud Run. Key configuration:

| Setting | Dev | Prod |
|---------|-----|------|
| Region | `asia-southeast1` (Singapore) | `asia-southeast1` |
| Min instances | 0 | **0** — deliberate scale-to-zero, no idle cost |
| Max instances | 2 | 10 (scale-out for traffic spikes) |
| Memory | 256 MiB | 512 MiB |
| CPU | 1 | 1 |
| Concurrency | 80 (default) | 80 |
| Timeout | 60s (default) | 60s |
| Authentication | Allow unauthenticated (frontend calls from browser; auth via Firebase token + CORS) |
| HTTPS | Auto (managed by Cloud Run) |

**Phase 1 prerequisites:**
- Add a `[server/Dockerfile]` (multi-stage Node build → minimal runtime image)
- Server must read `PORT` from env (Cloud Run injects this dynamically). Already in [server/.env.example](server/.env.example).
- Add a `.dockerignore` to exclude `node_modules`, `.env*`, `dist/`
- Set `CORS_ORIGIN` env var on the Cloud Run service to the Vercel production URL + any custom domain. Use a comma-separated list for multiple.

**Identity & secrets:**
- Phase 1 uses `FIREBASE_SERVICE_ACCOUNT_JSON` env var (paste the JSON as a single-line string in Secret Manager → mount into Cloud Run env)
- Phase 1+ migration option: drop the JSON env var and use Workload Identity instead — grant the Cloud Run service account the Firebase Admin role. Cleaner, but defer until the basic flow works.

**Custom domain:** plan for `api.devcon.ph` (or similar) once ready. Cloud Run supports custom domain mapping with auto-SSL via Google-managed certs.

**Cold start budget (min-instances=0):** With a slim image (`node:lts-alpine` multi-stage build, pruned dev deps in runtime stage, ~60–80MB), expect ~800ms–1.5s cold start. Acceptable because:
- `/auth/refresh` fires proactively before token expiry; a brief delay during a background refresh isn't user-visible
- Sign-in already has a loading state — cold start blends into the existing network round-trip
- DEVCON traffic isn't 24/7 — long idle windows make scale-to-zero meaningful cost savings

If a cold start later becomes a real complaint, mitigations in order of cost: (a) further slim the image with `node:lts-slim` + production-only deps, (b) lazy-load NestJS modules, (c) Cloud Scheduler ping every 5 min (~$0/month, basically free), (d) min-instances=1 (~$10/mo). Don't reach for (d) preemptively.

**Cost estimate (prod, min-instances=0):** ~$0–5/month for typical DEVCON+ auth traffic (sign-ins + hourly refreshes per session). Free tier covers the first 180,000 vCPU-seconds and 2 million requests per month. Effectively free for this app's volume.

---

## Verification

### Phase 1 (NestJS bridge ready)
- Unit tests: `JwtService.signSupabaseJwt()` produces a JWT that decodes with `SUPABASE_JWT_SECRET` and has the right `sub`
- Manual: hit `/auth/firebase/exchange` with a Firebase ID token from Auth Emulator
- Manual: use the returned JWT in Postman against `https://[supabase-url]/rest/v1/profiles?select=*` — should return only the user's row (RLS check passes)

### Phase 2 (Google sign-in)
- E2E: `/sign-in` → "Continue with Google" → `/home` renders → dashboard loads
- Inspect: localStorage Supabase session has bridge-issued JWT; decode and confirm `sub` matches `profiles.id`
- Realtime smoke: second browser RSVPs to event, first browser updates live
- Storage: avatar upload via ProfileEdit succeeds (still through supabase-js in this phase)
- Edge Function: `/qr` renders, calls `generate-user-qr`, validates the bridge JWT

### Phase 3 (email/password JIT)
- Pick a legacy test user (bcrypt password in `auth.users`, `auth_uid` IS NULL)
- Sign in → NestJS detects no Firebase user → legacy fallback → creates Firebase user → returns Supabase JWT
- DB check: `profiles.auth_uid` now populated
- Sign in again → no legacy fallback fires (Firebase user exists directly)
- Firebase dashboard: user appears with email/password provider

### Phase 4 (cutover)
- Try to create account via Supabase Auth dashboard → rejected (signups disabled)
- Edge Functions still work after `auth.users` FK drop (because of manual JWT verify swap)
- RLS smoke: `SELECT * FROM events LIMIT 5` as authenticated user with bridge JWT works
- Recovery pattern test: background tab 10 min, foreground → realtime resumes (per db-connection-resilience.md)

### Phase 5 (avatar slice)
- Avatar upload from web app: succeeds via NestJS endpoint (not direct supabase.storage call)
- Direct browser fetch to Supabase Storage upload endpoint with bridge JWT: now rejected (RLS dropped)
- Verify no other code path was depending on the avatars storage RLS

### Phase 6 (each slice, repeating pattern)
- Positive test: own data accessible via new NestJS endpoint
- Negative test: other user's data not accessible (would have been blocked by RLS before; now blocked by NestJS authz)
- Realtime continues working for tables not yet migrated
- Old RLS policy file diff committed alongside the migration so blame history is clean

---

## Decisions & Open Questions

### Decided (2026-05-28)

1. **NestJS host: GCP Cloud Run** — region `asia-southeast1`, min-instances=**0** (deliberate scale-to-zero — "serverless means serverless"). Cold-start budget absorbed by slim container image. See "Cloud Run deployment specifics" above.
2. **Google OAuth client: Firebase manages its own** — when enabling the Google sign-in method in Firebase Auth, let it auto-generate the OAuth client. Do NOT reuse the existing Supabase OAuth client. Clean separation, easier Phase 4 teardown, no cross-contamination of credentials.
3. **Storage exit timeline: not urgent** — Phase 5 (avatars NestJS-mediation) can be deferred. Phases 0–4 proceed; Phase 5 happens when storage exit becomes a real near-term plan.

### Still open

4. **Realtime exit plan?** Realtime is the hardest slice. If Supabase Postgres is staying long-term, Realtime can stay on Supabase indefinitely. If the DB is also leaving, Realtime needs a replacement plan (NestJS WebSocket gateway, Pusher, Ably, Firebase Realtime Database).
5. **Email templates?** Firebase will send its own confirmation/reset emails. Someone needs to design templates and verify the sender domain in Firebase Auth settings.
6. **Bulk import for the long tail?** After Phase 5 stabilizes, do we want to bulk-import the remaining ~20% of email/password users into Firebase to eliminate the legacy fallback path? Firebase's bulk import tool supports bcrypt — should work directly against Supabase's `auth.users.encrypted_password` column.
7. **KMP alignment (Phase 2 roadmap)?** Firebase Auth has a strong Kotlin Multiplatform story (GitLive's Firebase Kotlin SDK). This migration *simplifies* the KMP roadmap rather than complicating it — worth noting to the team.
