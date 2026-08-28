# DEVCON+ — Context Anchor (memory.md)
> For AI instances picking up this project mid-stream.
> Updated: April 17, 2026
>
> ⚠️ **This is a historical snapshot from Weeks 1–3 (pre-launch), not current state.** Since this was
> written: auth moved from Supabase Auth to **Firebase Auth**; the app split from an npm-workspace/Turbo
> monorepo (`apps/member/`, `packages/supabase/`) into two independent apps (`web/`, `server/`) behind a
> **NestJS gateway**; and realtime was **inverted to polling-first** (no more always-on WebSocket
> subscriptions/re-subscribe pattern). The Decision Log below (Section 2) is still useful for *why*
> things like the points ledger and QR token format work the way they do, but treat any current-tense
> claim about "what's wired up" as outdated — see `.claude/CLAUDE.md` and `.claude/context/HANDOVER.md`
> for the current architecture.

---

## 1. Project Evolution — Architecture Timeline

Understanding *how* the project got here explains why things look the way they do.

### March 29 — Week 1: Foundations
- Monorepo scaffolded (npm workspaces + Turbo).
- Auth first: Supabase email/password + Google OAuth, RLS policies on all sensitive tables.
- Early design system: Tailwind with CSS custom property theming (`--color-primary`), 4 program themes.
- `DesktopGuard` was initially a blocking gate — showed "open on mobile" on desktop.

### Early April — QR & PWA Sprint
- QR system built as three Deno Edge Functions: `generate-qr-token` → `award-points-on-scan` → `approve-at-door`.
- Critical design decision: **QR token is a short-lived HMAC-SHA256 JWT** (not a stored code) to prevent replay attacks.
- Atomic `checked_in: false → true` in a single SQL UPDATE — prevents double-award under concurrent scans.
- `DesktopGuard` removed/made pass-through. MemberLayout and OrganizerLayout became fully responsive (sidebar on desktop).
- PWA manifest added (add-to-home-screen, shortcuts).
- Cloudflare Turnstile CAPTCHA added to all auth forms after rate limiting alone felt insufficient.

### Mid April — Polish & Type Scale
- Geist font replaced with **Proxima Nova** (self-hosted woff2, 6 weights). The swap was a visual identity requirement from DEVCON HQ — not a technical decision.
- MD3 type scale (15 `text-md3-*` tokens) added to `tailwind.config.js` alongside the legacy scale. Both are valid; MD3 is preferred for new components but old components were not migrated wholesale.
- 5th program theme added: **DEVCON Purple** (`#7C3AED`).
- Form draft persistence added via `useFormDraft` hook — prevents data loss on accidental navigation.
- XP Tier System wired to `lifetime_points` (the field that never decrements).
- Event URL slugs replaced UUIDs in routes (`/events/:slug` not `/events/:uuid`).

### Current State (April 17, 2026)
- MVP is ~90% complete and live on Vercel.
- Remaining 10% is infrastructure (custom domain, email SMTP, Google OAuth redirect URI) blocked on external access, plus final QA and data cleanup.
- Claude Code AI assistance ends April 26. Dev freeze April 30. Public preview May 15.

---

## 2. Decision Log — The "Why" Behind the "What"

### Why Supabase instead of a custom backend?
Two-person intern team with a 7-week runway. Supabase gives auth, Postgres, Realtime, and Edge Functions with zero infrastructure management. The tradeoff: you're locked into Supabase patterns and the free-tier quirks (WebSocket drops on mobile Safari). Acceptable for MVP.

### Why a monorepo with npm workspaces + Turbo?
Member app and shared DB types need to stay in sync. The `packages/supabase/database.types.ts` file is generated from the live DB and shared across the app. Turbo gives filtered builds (`@devcon-plus/member`) without a complex setup.

### Why `navigator.locks` on the Supabase auth client?
Supabase's `@supabase/supabase-js` can have race conditions when multiple tabs try to refresh the session token simultaneously. The `navigator.locks` approach serializes token refreshes so only one tab does it at a time. The `no timeout` variant was chosen deliberately — if the lock is held, we wait. A timeout would cause auth failures on slow devices.

### Why are realtime channels torn down and recreated (not just resubscribed)?
Supabase Realtime channels can enter a silently `CLOSED` state after device sleep or mobile Safari's aggressive tab suspension. Simply calling `.subscribe()` again on a closed channel doesn't reliably reopen it. The pattern of `removeChannel()` + creating a new channel is the only reliable fix, even though it's heavier.

### Why are MOCK_* exports kept in packages/supabase/?
Reference documentation. The team built against mocks in Week 1 before Supabase was provisioned. Once the real client was wired, the mocks were kept as type-checked examples of what the data looks like. They are never imported in production code — TypeScript will flag it if you do because the types are structurally the same but the exports are separate.

### Why is the jobs board manually seeded?
MVP scope decision. External jobs API (JobStreet, LinkedIn) integration requires partner agreements and API keys. For Cohort 3 launch, 8 curated listings are sufficient. Phase 2 adds real-time external feeds.

### Why `spendable_points` and `lifetime_points` as separate fields?
`spendable_points` decrements on reward redemptions. If we used a single field, a user who redeemed 500 points after earning 1000 would show as "500 lifetime" which is factually wrong. The split field design lets us track "total ever earned" (for tier progression) separately from "current balance" (for spending). This is a deliberate ledger pattern.

### Why does `OrganizerLayout` not apply program themes?
The organizer interface is DEVCON-branded, not member-personalized. Themes are a member engagement feature (the user chooses their program alignment: DEVCON, She, Kids, Campus, Purple). Organizers are working in an admin context where the primary color should always be the neutral `blue` (#1152D4), not whatever theme the officer personally selected. Mixing them caused visual confusion in early prototypes.

### Why is `framer-motion` a workspace root dependency?
It needs to be a singleton across the monorepo. If `apps/member` and any future package each bundle their own copy of framer-motion, React will throw errors about multiple animation contexts. Installing at the root ensures one instance.

### Why the two-tier typography system (legacy + MD3)?
Migrating all 117 `.tsx` files to MD3 tokens at once would have been risky and time-consuming with a hard deadline. The additive approach lets new code use the better system while existing code stays stable. The legacy scale remains in `tailwind.config.js` and will coexist until a future cleanup sprint.

---

## 3. State of Play — Where the Next Dev Starts

### What is actually done (verified, live, working)
- Full member flow: sign-up → events → QR ticket → points history
- Organizer flow: create event → approve registrants → scan QR at venue
- Admin panel: user management, org codes, chapters, upgrade requests, kiosk
- All 5 edge functions deployed and live
- All 13 Zustand stores wired to real Supabase (no mocks in production)
- RLS policies, rate limiting, Cloudflare Turnstile CAPTCHA
- Realtime recovery pattern (two-layer: HTTP refetch + WebSocket re-subscribe)
- MD3 type scale applied across all UI components

### What is blocked on external access (not code problems)
| Item | Blocked by | Action |
|------|-----------|--------|
| `plus-beta.devcon.ph` custom domain | DEVCON HQ DNS admin must add CNAME in Cloudflare | Provide DNS record values; they apply it |
| Transactional email (`no-reply-plus@devcon.ph`) | Same — Resend DKIM/SPF records need to be added | Provide DNS record values; they apply it |
| Google OAuth on production domain | GCP Console — add redirect URI | `https://plus-beta.devcon.ph/auth/v1/callback` |
| After domain goes live: CORS update | Code change required | Add domain to `_shared/cors.ts`, redeploy all 5 functions; add to Supabase Auth redirect URLs |

### What needs code work before April 30 (L1)
- Remove `<KonamiCodeWrapper />` and `<KonamiModal />` from the codebase entirely (currently guarded by `hq_admin/super_admin` but must be deleted)
- Remove test accounts from live Supabase Auth users
- OWASP Top 10 security pass (25 CVEs cleared; pen test pass still needed)
- PROMOTED badge data audit (verify `is_promoted = true` for Sui Foundation job + 2nd Tech news post)
- Final QA: member, organizer, and admin flows on real mobile device (iPhone Safari + Android Chrome)

### What is scaffolded but not fully verified (L2 — do if there's bandwidth)
- `<SendAnnouncementSheet />` creates `event_announcements` rows — verify members see them in notifications
- Missions system (`useMissionsStore`) — basic flow built, needs end-to-end test
- Custom event registration fields — organizer creates field, member fills it on registration
- Auto-apply chapter theme on login (currently manual via Profile)
- Boosted/promoted events surfacing in events list

### Known technical debt
1. **Mobile Safari WebSocket resilience** — The two-layer recovery pattern handles 95% of cases. Under aggressive Safari background tab suspension, channels can still silently die. Full fix involves exponential backoff + a visible "Reconnecting..." banner + automated reconnect tests. Deferred to Phase 2.
2. **No staging database** — Local dev hits the same live Supabase project as production. There is no separate staging environment. This is a risk — a bad migration in dev applies to production data.
3. **Email SMTP not end-to-end tested** — The edge function and Resend config are deployed (April 6), but actual email delivery hasn't been verified because the domain DNS is pending. Test immediately after domain goes live.
4. **`database.types.ts` staleness risk** — Types are generated from the live DB at a point in time. If schema changes are made directly in the Supabase dashboard without regenerating types, the TypeScript layer will drift from reality. Always run `supabase gen types typescript` after any schema change.
5. **Two-tier typography system** — Legacy and MD3 scales coexist. Future maintainers may not know which to use. The rule: MD3 for new components, legacy for existing ones (don't migrate unless reworking).

### Where to start (recommended order for a new dev)
1. Get credentials from a teammate, set up `web/.env.local` + `server/.env`, run `cd web && npm run dev` and `cd server && npm run dev`
2. Read `.claude/CLAUDE.md` Sections 0, 4 (DB schema), 6 (routes), 9 (design system) in that order
3. Watch the Loom recordings (Section 4.1 of HANDOVER.md) — 2 hours of video context
4. Coordinate with DEVCON HQ IT on DNS records (custom domain + email) — this unblocks the most L1 items
5. Remove Easter egg code (Konami wrapper) — 30-minute task, high visibility, good warm-up
6. Run OWASP Top 10 checklist; fix critical + high findings
7. Final QA on a real device

---

## 4. Architectural Invariants (Things That Must Never Change)

These are decisions baked so deep into the system that reversing them would require significant migration work:

| Invariant | Why it can't be casually changed |
|-----------|----------------------------------|
| `spendable_points` / `lifetime_points` field names | All stores, edge functions, and TypeScript types reference these names. Renaming requires a DB migration, type regen, and find/replace across 13+ files. |
| Flat `createBrowserRouter` in `router.tsx` | The route tree structure (MemberLayout / OrganizerLayout / AdminLayout as wrapper roots) is the foundation of auth guards, nav, and theme injection. Restructuring would touch every page component. |
| CSS custom property primary color | All 5 themes work by setting `--color-primary` on `<html>`. Every `text-primary` / `bg-primary` in every component relies on this. Switching to hardcoded colors would break theming entirely. |
| QR token as short-lived HMAC-SHA256 JWT | The security model for check-in relies on token expiry (not DB invalidation). Changing the token format requires updating both `generate-qr-token` and `award-points-on-scan` in sync. |
| `checked_in` atomic update (false → true) | The double-award prevention relies on a single SQL UPDATE with a `WHERE checked_in = false` condition. Any change to how check-in is recorded must maintain this atomicity guarantee. |
