# Security & Secrets Management

This document defines where every secret and configuration variable lives for DEVCON+.
All contributors must follow this contract. Do not deviate without team review.

> **Architecture note:** DEVCON+ is a two-app system — a Vercel-hosted frontend (`web/`) and a
> self-hosted NestJS gateway (`server/`) on EC2 behind nginx at `https://api.devcon.plus`. Auth is
> **Firebase Auth** (Google OAuth + email/password); Supabase Auth was cut. The gateway holds the
> Supabase **service-role key** and mints a short-lived "bridge JWT" for the few legacy direct-Supabase
> paths still in the frontend. See `.claude/CLAUDE.md` Sections 3 and 14 for the full picture.

---

## Variable Classification

### Frontend (`web/` — see `web/.env.example`)

| Variable | Type | Lives in | Never in |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Public config | Vercel env vars, `web/.env.local` | Never a secret — safe to expose |
| `VITE_SUPABASE_ANON_KEY` | Public config | Vercel env vars, `web/.env.local` | Governed by RLS — safe to expose |
| `VITE_GOOGLE_CLIENT_ID` | Public config | Vercel env vars, `web/.env.local` | — |
| `VITE_TURNSTILE_SITE_KEY` | Public config | Vercel env vars, `web/.env.local` | — |
| `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` | Public config (Firebase web app identifiers) | Vercel env vars, `web/.env.local` | — |
| `VITE_API_URL` | Plain config | Vercel env vars, `web/.env.local` | — |
| `VITE_ALLOW_INDEXING` | Plain config | Vercel env vars (production only) | — |

> **All `VITE_*` values are public by design.** Vite bundles them into the JavaScript the browser
> downloads. **Never put a secret behind a `VITE_` prefix.**

### Backend gateway (`server/` — see `server/.env.example`)

| Variable | Type | Lives in | Never in |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** — bypasses RLS | `server/.env` on EC2 only | Vercel, frontend code, git, edge function secrets |
| `SUPABASE_JWT_SECRET` | **Secret** — signs the bridge JWT (HS256) | `server/.env` on EC2 only | Frontend code, git |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Secret** — Firebase Admin SDK credential | `server/.env` on EC2 only | Frontend code, git. Delete the downloaded `.json` after minifying it into the env var |
| `FIREBASE_WEB_API_KEY` | **Secret**-adjacent — used server-side for REST password sign-in | `server/.env` on EC2 only | Frontend code |
| `EMAIL_VERIFICATION_SECRET` | **Secret** — signs stateless email-verification JWTs | `server/.env` on EC2 only | Frontend code, git |
| `QR_JWT_SECRET` | **Secret** — HMAC-SHA256 for QR check-in JWTs | `server/.env` on EC2 **and** matching Supabase Edge Function secret | Frontend code, git |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | **Secret** (App Password) | `server/.env` on EC2 only | Frontend code, git |
| `TURNSTILE_SECRET_KEY` | **Secret** — optional, fails open if blank | `server/.env` on EC2 only | Frontend code |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | **Secret** — optional, no-op cache if blank | `server/.env` on EC2 only | Frontend code |
| `CORS_ORIGIN` | Plain config | `server/.env` on EC2 | — |
| `APP_URL` / `SERVER_URL` | Plain config | `server/.env` on EC2 | — |
| `CACHE_PREFIX` | Plain config | `server/.env` on EC2 | — |

> Generate any HS256/HMAC secret with: `openssl rand -hex 32` (or the `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` one-liner already documented inline in `server/.env.example`).

### Supabase Edge Functions (`supabase/functions/`)

| Variable | Type | Lives in | Never in |
|---|---|---|---|
| `QR_JWT_SECRET` | **Secret** — must match the gateway's value exactly | Supabase Edge Function secrets (`supabase secrets set`) | Vercel, frontend code, git |
| `ALLOWED_ORIGIN` | Plain config | Supabase Edge Function environment | Secrets store |

---

## Rules

### 1. `VITE_*` variables are public
Vite bundles `VITE_*` variables into the JavaScript that the browser downloads.
**Never store anything sensitive** — tokens, private keys, passwords — with a `VITE_` prefix.
`VITE_SUPABASE_ANON_KEY` is safe to expose: it is a publishable key governed by Row Level Security.

### 2. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS
This key has full database access with no Row Level Security applied. It lives **only** in
`server/.env` on the EC2 host (read via `SupabaseService` in the NestJS gateway). Never add it to
Vercel, never reference it in frontend code, never commit it to git.

> **Bridge-JWT era caveat:** because the browser also holds a short-lived Supabase "bridge JWT"
> (minted by the gateway, HS256, 3600s TTL) for a few legacy direct-Supabase paths, **RLS policies and
> RPC grants are a real authorization boundary in production** — not just a defense-in-depth layer
> behind the gateway. Treat every RLS policy and `SECURITY DEFINER` RPC as internet-exposed to all
> authenticated users. See `.claude/CLAUDE.md` Section 5 and the local (gitignored) security audit
> reports for open items. This is retired in migration "Phase 7" (see Section 17 of `.claude/CLAUDE.md`).

### 3. Firebase secrets are gateway-only
`FIREBASE_SERVICE_ACCOUNT_JSON` (Admin SDK) and `FIREBASE_WEB_API_KEY` (server-side REST sign-in)
verify ID tokens and passwords on the NestJS gateway. They are never exposed to the frontend — the
frontend only holds the public Firebase web app config (`VITE_FIREBASE_*`).

### 4. `CORS_ORIGIN` / `ALLOWED_ORIGIN` are not secrets
They are the public URL(s) of the deployed app (e.g. `https://devcon.plus`, `https://staging.devcon.plus`).
Store as plain config, comma-separated for multiple origins, no trailing slash. For local development,
`http://localhost:5173`.

### 5. `.env*` files are gitignored — verify before every commit
Run `git status` before committing. If any `.env*` file (`web/.env.local`, `server/.env`) appears as
staged or untracked, do not commit. Add it to `.gitignore` if missing.

### 6. Key rotation procedure
1. Generate the new key/secret.
2. Update it in the relevant store:
   - `VITE_*` vars → Vercel dashboard → Settings → Environment Variables → redeploy.
   - `server/.env` vars → update the file on the EC2 host, then restart the container
     (`docker compose -f docker-compose.prod.yml up -d` per the deploy workflow).
   - `QR_JWT_SECRET` → update **both** `server/.env` and the Supabase Edge Function secret
     (`supabase secrets set QR_JWT_SECRET=<value>`) — they must match.
3. Confirm the old key is revoked at the provider (Firebase console, Supabase dashboard → API settings,
   Gmail App Passwords page, etc.).

---

## Operator Setup Checklist (first deploy)

**Vercel (frontend, `web/`):**
- [ ] Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in Vercel → Settings → Environment Variables
- [ ] Set `VITE_GOOGLE_CLIENT_ID`, `VITE_TURNSTILE_SITE_KEY` in Vercel
- [ ] Set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` in Vercel
- [ ] Set `VITE_API_URL` to `https://api.devcon.plus`
- [ ] Set `VITE_ALLOW_INDEXING=true` on the production project only (leave unset on staging)

**EC2 gateway (backend, `server/`):**
- [ ] Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` in `server/.env`
- [ ] Set `FIREBASE_WEB_API_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON` (minified, single-quoted) in `server/.env`
- [ ] Set `GMAIL_USER` / `GMAIL_APP_PASSWORD` (optional — email degrades gracefully if unset)
- [ ] Set `EMAIL_VERIFICATION_SECRET` (generate with `openssl rand -hex 32`)
- [ ] Set `QR_JWT_SECRET` in `server/.env` (generate with `openssl rand -hex 32`)
- [ ] Set `CORS_ORIGIN` to the deployed frontend origin(s)
- [ ] Optionally set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` / `CACHE_PREFIX`

**Supabase Edge Functions:**
- [ ] Set `QR_JWT_SECRET` in Supabase → Edge Functions → Secrets (**must match** the gateway's value)
- [ ] Set `ALLOWED_ORIGIN` in Supabase → Edge Functions → Environment (plain var, not secret)

---

## Known Open Items

See `.claude/CLAUDE.md` Section 17 ("Remaining / Ongoing") and the local, gitignored
`SECURITY_AUDIT_*.md` reports for the current remediation backlog — notably: `profiles` UPDATE RLS
missing a `WITH CHECK` (privilege-escalation risk), `redeem_reward`/`manual_checkin` RPCs trusting a
client-supplied actor id, and the plan to retire direct `supabase-js` access entirely ("Phase 7").
