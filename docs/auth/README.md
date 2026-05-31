# DEVCON+ Authentication System

> Last Updated: May 31, 2026
> Status: **Firebase Auth + JWT Bridge (Phases 0–4 complete)**

---

## Overview

DEVCON+ uses **Firebase Authentication** as the identity provider, bridged to Supabase via a **NestJS JWT bridge server**. This replaces the original Supabase Auth system through a JIT (Just-In-Time) migration so existing users are migrated transparently on their next sign-in.

### Why This Architecture

| Concern | Decision |
|---|---|
| Identity provider | **Firebase Auth** — handles Google OAuth, email/password, email verification |
| API gateway | **NestJS** — issues Supabase-compatible JWTs, owns sensitive auth operations |
| Database auth | **Supabase PostgREST** — still uses JWT-based RLS via bridge JWTs |
| Frontend auth client | `supabase-js` for DB/Realtime/Storage; Firebase SDK for identity state |

---

## Quick Reference

| Topic | Document |
|---|---|
| Architecture & flow diagrams | [architecture.md](./architecture.md) |
| Sign-in and sign-up flows | [flows.md](./flows.md) |
| JWT bridge — how tokens work | [jwt-bridge.md](./jwt-bridge.md) |
| Edge Function auth (verifyCallerJwt) | [edge-function-auth.md](./edge-function-auth.md) |
| Frontend integration | [frontend-integration.md](./frontend-integration.md) |
| Troubleshooting | [troubleshooting.md](./troubleshooting.md) |

---

## Phase Status

| Phase | Description | Status |
|---|---|---|
| 0 | Firebase Admin SDK + NestJS bridge scaffold | ✅ Done |
| 1 | Google OAuth via Firebase popup + exchange | ✅ Done |
| 2 | Email/password signup via NestJS + Gmail SMTP verification | ✅ Done |
| 3 | Email/password sign-in + legacy Supabase Auth fallback (JIT) | ✅ Done |
| 4 | Cut Supabase Auth from Edge Functions; FK/trigger cleanup | ✅ Done |
| 5 | Migrate Storage auth to NestJS | Planned |
| 6 | Remove RLS; all data access via NestJS | Planned |
| 7 | Remove `SupabaseJwtService`; retire `SUPABASE_JWT_SECRET` | Planned |
