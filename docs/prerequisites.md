# Prerequisites — Running DEVCON+ Locally

Everything you need before `npm run dev` works. The app is two independent projects:

- **`web/`**: React 19 + Vite frontend, port **5173**
- **`server/`**: NestJS gateway, port **8000**

The `.env.example` files and the validators listed under each env table are the source of truth. If this
doc and the code disagree, trust the code.

---

## 1. Tools

| Tool | Version | Needed for |
|------|---------|-----------|
| Node.js | **20.x LTS** | both apps |
| npm | 10+ (ships with Node 20) | both apps |
| Git | any recent | cloning |
| Supabase CLI | latest | *optional*: migrations, edge functions, `database.types.ts` regen |
| Docker | latest | *optional*: only for the server's prod-style `docker-compose.*.yml` |

> **Windows:** use Git Bash or WSL, not Command Prompt or PowerShell.

---

## 2. External services / accounts

| Service | What it's for | Required? |
|---------|---------------|-----------|
| **Supabase** project | Postgres DB, Storage, edge functions. Needs URL, anon key, service-role key, JWT secret | **Yes** |
| **Firebase** project | Auth. Enable the **Google** and **Email/Password** providers, register a **web app** (for its config), and generate a **service account** key | **Yes** |
| **Cloudflare Turnstile** | CAPTCHA on auth forms. Site key (web) + secret key (server) | Site key **yes** (web build fails without it); secret optional |
| **Gmail / Workspace** account + App Password | Sends verification emails | Optional: without it, email sign-up returns 503, but Google sign-in still works |
| **Upstash Redis** | Profile cache + rate-limit buckets | Optional: no-op mode when unset |

> Team members: ask the team lead for existing values rather than creating new projects.

---

## 3. Environment files

Both files are gitignored. Never commit them.

```bash
cp web/.env.example    web/.env.local
cp server/.env.example server/.env
```

### `web/.env.local`

`npm run build` **hard-fails** if any required var is missing (`REQUIRED_ENV` in `web/vite.config.ts`).
The dev server won't fail, but you'll get a blank screen or auth errors.

| Variable | Required | Source |
|----------|:-:|--------|
| `VITE_SUPABASE_URL` | ✅ | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase → Project Settings → API |
| `VITE_FIREBASE_API_KEY` | ✅ | Firebase → Project Settings → Your apps → Web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | same |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | same |
| `VITE_FIREBASE_APP_ID` | ✅ | same |
| `VITE_TURNSTILE_SITE_KEY` | ✅ | Cloudflare → Turnstile |
| `VITE_API_URL` | ✅ | `http://localhost:8000` (or `https://api.devcon.plus` for frontend-only work) |
| `VITE_APP_ENV` | — | `development` |
| `VITE_ALLOW_INDEXING` | — | leave empty locally (`true` only on production) |

All `VITE_*` values get baked into the browser bundle, so they're public by design. Never put a secret here.

### `server/.env`

The server **refuses to boot** with `Invalid environment configuration` if a required var is missing
(`server/src/config/env.validation.ts`).

| Variable | Required | Notes |
|----------|:-:|-------|
| `NODE_ENV` | ✅ | `development` / `production` / `test` |
| `PORT` | — | defaults to `8000` |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Secret**: bypasses RLS. Server only |
| `SUPABASE_JWT_SECRET` | ✅ | Supabase → Project Settings → API → JWT secret. Signs the bridge JWT |
| `FIREBASE_WEB_API_KEY` | ✅ | Firebase → Project Settings → General |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ✅ | Service account key as **minified one-line JSON, wrapped in single quotes**. Delete the downloaded `.json` file afterwards |
| `EMAIL_VERIFICATION_SECRET` | ✅ | random 32-byte hex (see below) |
| `APP_URL` | ✅ | `http://localhost:5173` |
| `SERVER_URL` | ✅ | `http://localhost:8000` |
| `QR_JWT_SECRET` | ✅ | random 32-byte hex. **Must match** the Supabase edge-function secret (`supabase secrets set QR_JWT_SECRET=...`) |
| `CORS_ORIGIN` | ✅ | `http://localhost:5173` (comma-separated, no trailing slash) |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | — | set **both** to enable email. Use a 16-char App Password, not the account password |
| `TURNSTILE_SECRET_KEY` | — | if blank, server-side CAPTCHA check is skipped |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | — | if blank, cache runs in no-op mode |
| `CACHE_PREFIX` | — | defaults to `NODE_ENV` |

Generate random secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Minify the Firebase service account key with:

```bash
node -e "console.log(JSON.stringify(require('./firebase-adminsdk.json')))"
```

---

## 4. Install & run

```bash
cd web    && npm install   # no --legacy-peer-deps needed
cd ../server && npm install

# two terminals
cd web    && npm run dev   # http://localhost:5173
cd server && npm run dev   # http://localhost:8000
```

**Frontend-only shortcut:** set `VITE_API_URL=https://api.devcon.plus` and skip `server/` entirely.
Then you only need `web/.env.local`.

---

## 5. Sanity checks

- [ ] `node -v` prints `v20.x`
- [ ] Server starts without `Invalid environment configuration`
- [ ] `cd web && npm run typecheck` passes (Vercel runs `tsc -b`, and the dev server does **not** catch TS errors)
- [ ] App loads at `localhost:5173` and Google sign-in opens a popup

---

## See also

- [`setup.md`](./setup.md): step-by-step setup (join the existing project, or set up from scratch)
- [`README.md`](../README.md): full setup, build, and deploy guide
- [`web/.env.example`](../web/.env.example), [`server/.env.example`](../server/.env.example): canonical env templates
- [`docs/auth/`](./auth/README.md): Firebase auth + bridge-JWT architecture and troubleshooting
