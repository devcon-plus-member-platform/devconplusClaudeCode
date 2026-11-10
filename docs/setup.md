# Setup Guide — DEVCON+

Step-by-step setup for running DEVCON+. Read [`prerequisites.md`](./prerequisites.md) first for the tools
and the full env-var reference.

There are two paths:

- **A. Join the existing project:** you're on the team and the Supabase/Firebase projects already exist.
  Takes about 10 minutes.
- **B. Fresh setup from scratch:** you're standing up your own copy (a fork, a sandbox, or a new environment).

> ⚠️ With path A, your local app talks to the **live production database**. Real accounts, real points.
> Test carefully, or use path B for a sandbox.

---

## Path A — Join the existing project

1. **Clone and install**
   ```bash
   git clone https://github.com/rocketwolf98/devconplusClaudeCode
   cd devconplusClaudeCode
   cd web && npm install
   cd ../server && npm install
   ```
2. **Get credentials** from the team lead (see README §13). Then create the env files:
   ```bash
   cp web/.env.example    web/.env.local
   cp server/.env.example server/.env
   ```
   Fill in the values. The [`prerequisites.md` §3](./prerequisites.md#3-environment-files) tables list
   which ones are required.
3. **Run**
   ```bash
   cd web && npm run dev       # terminal 1 → http://localhost:5173
   cd server && npm run dev    # terminal 2 → http://localhost:8000
   ```
   Frontend-only work: set `VITE_API_URL=https://api.devcon.plus` and don't start the server. Then
   you only need `web/.env.local`.
4. **Get a role** (optional). Sign up at `/sign-up`. For organizer or admin pages, ask the team lead to
   set your `role` in `profiles` (see [§B7](#b7-create-your-first-admin)).

Then continue with [Verify](#verify).

---

## Path B — Fresh setup from scratch

### B1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) and note the **project ref**.
2. Go to **Project Settings → API** and copy the **URL**, the **anon key**, and the **service-role key**.
3. Go to **Project Settings → JWT** and copy the **JWT secret**. The gateway signs HS256 bridge JWTs, so on newer
   projects use the **legacy JWT secret**.
4. Link the CLI and apply the schema:
   ```bash
   supabase login
   supabase init          # only if supabase/config.toml doesn't exist; keeps existing migrations
   supabase link --project-ref <project-ref>
   supabase db push       # applies all supabase/migrations/* in order
   ```
5. Seed the reference data (chapters, sample jobs, rewards, events, news). Paste
   [`supabase/seed.sql`](../supabase/seed.sql) into the Supabase **SQL Editor** and run it.
   `ON CONFLICT DO NOTHING` makes it safe to re-run.

> The migrations have only been applied incrementally to the existing DB. If `db push` fails on a fresh
> project, fix the failing migration rather than skipping it, because later ones depend on earlier ones.

### B2. Supabase edge functions

Set the secrets. All `SUPABASE_*` values (URL, anon key, service-role key, and JWT secret) are injected
automatically, and the CLI won't accept custom names starting with `SUPABASE_`:

```bash
supabase secrets set QR_JWT_SECRET=<same value as server/.env>
supabase secrets set RESEND_API_KEY=<resend key>   # only needed for the send-email function
```

Deploy:

```bash
for fn in generate-qr-token generate-user-qr generate-pending-qr award-points-on-scan \
          approve-at-door check-rate-limit send-email delete-user; do
  supabase functions deploy "$fn"
done
```

CORS allowlists are hardcoded in each function's `index.ts`. `http://localhost:5173` is already allowed. For a new
deployed origin, add it to **every** function, then redeploy all of them.

### B3. Firebase (auth)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. Go to **Authentication → Sign-in method** and enable **Google** and **Email/Password**.
3. Go to **Authentication → Settings → Authorized domains**. `localhost` is there by default. Add your deployed
   domains later.
4. Go to **Project Settings → General → Your apps** and add a **Web app**. Copy `apiKey`, `authDomain`,
   `projectId`, and `appId` into the `VITE_FIREBASE_*` vars. The same `apiKey` goes into `FIREBASE_WEB_API_KEY`.
5. Go to **Project Settings → Service accounts → Generate new private key**. Minify it into
   `FIREBASE_SERVICE_ACCOUNT_JSON` (single-quoted), then **delete the downloaded file**:
   ```bash
   node -e "console.log(JSON.stringify(require('./firebase-adminsdk.json')))"
   ```

### B4. Cloudflare Turnstile (CAPTCHA)

Go to **Cloudflare dashboard → Turnstile → Add widget** and add `localhost` as a hostname. The site key goes in
`VITE_TURNSTILE_SITE_KEY` and the secret in `TURNSTILE_SECRET_KEY`.

For local-only work you can use Cloudflare's official always-pass test keys instead:

| | Test value |
|-|-----------|
| Site key | `1x00000000000000000000AA` |
| Secret key | `1x0000000000000000000000000000000AA` |

### B5. Optional services

- **Email (Gmail SMTP).** Use a dedicated Gmail or Workspace account. Turn on 2-Step Verification, then create
  an App Password under **Google Account → Security → App Passwords**. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD`.
  Without these, email sign-up returns 503, but Google sign-in still works.
- **Upstash Redis.** Create a database (region `ap-southeast-1`) and copy the **REST** URL and token into
  `UPSTASH_REDIS_REST_*`. Leaving it blank runs the cache and rate limits in no-op mode.

### B6. Env files, then run

```bash
cp web/.env.example    web/.env.local
cp server/.env.example server/.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # run twice: EMAIL_VERIFICATION_SECRET, QR_JWT_SECRET
```

Fill in everything from B1–B5, then install and run as in [Path A](#path-a--join-the-existing-project),
steps 1 and 3.

### B7. Create your first admin

Sign up through the app. Then run this in the Supabase SQL Editor:

```sql
UPDATE profiles SET role = 'super_admin' WHERE email = 'you@example.com';
```

Roles are `member < chapter_officer < hq_admin < super_admin`. `/admin` needs `hq_admin` or higher, and
`/admin/kiosk` needs `super_admin`. Sign out and back in to pick up the role, because profiles are cached.

---

## Verify

- [ ] Server boots with no `Invalid environment configuration` error
- [ ] `http://localhost:5173` loads (use DevTools device mode at 390px, since the app is mobile-first)
- [ ] Google sign-in opens a popup and lands on `/complete-profile` or `/home`
- [ ] `/events` lists events (this confirms frontend → gateway → Supabase works)
- [ ] `cd web && npm run typecheck` and `cd server && npm run typecheck` pass

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| Blank white screen | Missing `VITE_*` var, or `VITE_API_URL` points at a server that isn't running |
| Server exits on boot | Required `server/.env` var missing. The error names it |
| CORS errors in console | `CORS_ORIGIN` doesn't exactly match `http://localhost:5173` (no trailing slash) |
| `auth/unauthorized-domain` | Domain not in Firebase **Authorized domains** |
| Turnstile widget won't load | Hostname not added to the widget, or wrong site key |
| QR scan says token invalid | `QR_JWT_SECRET` differs between `server/.env` and the Supabase secrets |
| Organizer/admin pages redirect away | Account `role` too low (see [B7](#b7-create-your-first-admin)) |
| Email sign-up returns 503 | `GMAIL_USER` / `GMAIL_APP_PASSWORD` not set |

More: [`docs/auth/troubleshooting.md`](./auth/troubleshooting.md) and README §12.
