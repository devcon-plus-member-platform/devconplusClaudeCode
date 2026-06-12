# DEVCON+ Load & Stress Test Suite (k6)

Diagnoses the Supabase Nano resource exhaustion (CPU 98.5%, disk IO burst drain)
by reproducing realistic and worst-case traffic patterns.

## Setup

1. Install k6: `winget install k6 --source winget` (or `choco install k6`)
2. **Never run 03–07 against production.** Use one of:
   - Local stack: `supabase start` → `SUPABASE_URL=http://127.0.0.1:54321`
   - A Supabase **branch** of the project (preview branch = isolated compute)
3. Get the anon key from the target environment.

```powershell
$env:SUPABASE_URL = "https://<staging-ref>.supabase.co"
$env:SUPABASE_ANON_KEY = "eyJ..."
k6 run -e SUPABASE_URL=$env:SUPABASE_URL -e SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY loadtests/01-smoke.js
```

## The Suite — run in order

| # | Script | What it answers | Prod-safe? | Duration |
|---|--------|-----------------|------------|----------|
| 00 | `00-hello-k6.js` | Is k6 installed and working? (hits test.k6.io, not our app) | ✅ Yes | until Ctrl+C |
| 01 | `01-smoke.js` | Does every endpoint work at all? | ✅ Yes | 1 min |
| 02 | `02-load.js` | Can we handle a normal peak (50 users)? | ⚠️ Off-peak only | 14 min |
| 03 | `03-stress.js` | Where exactly does Nano break (50→300 VUs)? | ❌ Never | 13 min |
| 04 | `04-spike.js` | "Hot event posted" surge — and does it recover? | ❌ Never | 6 min |
| 05 | `05-soak.js` | Does steady traffic drain the disk IO burst budget? | ❌ Never | 60 min |
| 06 | `06-polling-storm.js` | How much load do our OWN 90s keepalive polls create? | ❌ Never | 15 min |
| 07 | `07-auth-flows.js` | GoTrue CPU cost + does rate limiting fail fast? | ❌ Never | 3 min |

## Run commands (PowerShell — copy/paste)

Set the environment once per terminal session:

```powershell
$env:SUPABASE_URL = "https://<staging-ref>.supabase.co"   # NEVER prod for 03-07
$env:SUPABASE_ANON_KEY = "eyJ..."
```

Then run each tier:

```powershell
# 01 — Smoke (always first; prod-safe)
k6 run -e SUPABASE_URL=$env:SUPABASE_URL -e SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY loadtests/01-smoke.js

# 02 — Load (50 users, realistic journeys)
k6 run -e SUPABASE_URL=$env:SUPABASE_URL -e SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY loadtests/02-load.js

# 03 — Stress (find the breaking point)
k6 run -e SUPABASE_URL=$env:SUPABASE_URL -e SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY loadtests/03-stress.js

# 04 — Spike ("hot event posted" surge)
k6 run -e SUPABASE_URL=$env:SUPABASE_URL -e SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY loadtests/04-spike.js

# 05 — Soak (1 hour; diagnoses disk IO burst drain)
k6 run -e SUPABASE_URL=$env:SUPABASE_URL -e SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY loadtests/05-soak.js

# 06 — Polling storm (100 idle tabs running the app's own 90s keepalive)
k6 run -e SUPABASE_URL=$env:SUPABASE_URL -e SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY loadtests/06-polling-storm.js

# 07 — Auth flows (needs a throwaway test account)
k6 run -e SUPABASE_URL=$env:SUPABASE_URL -e SUPABASE_ANON_KEY=$env:SUPABASE_ANON_KEY `
       -e TEST_EMAIL=loadtest@example.com -e TEST_PASSWORD=<password> loadtests/07-auth-flows.js
```

Useful flags:

```powershell
# Save full results to JSON for later comparison
k6 run --out json=results-load.json ... loadtests/02-load.js

# Quick dry run of any script with tiny load (overrides stages)
k6 run --vus 2 --duration 30s ... loadtests/03-stress.js

# Live web dashboard at http://localhost:5665 while the test runs
$env:K6_WEB_DASHBOARD = "true"; k6 run ... loadtests/05-soak.js
```

## Reading k6 output — the 4 numbers that matter

| Metric | Meaning | Healthy |
|---|---|---|
| `http_req_duration p(95)` | 95% of requests finished within this time | < 800ms reads |
| `http_req_failed` | Fraction of failed requests | < 1–2% |
| `checks` | App-level assertions (status 200, JSON shape) | > 99% |
| `vus` at failure onset | Concurrency where errors start climbing | = your capacity ceiling |

A test that exits non-zero means a **threshold** failed — the limits are declared
at the top of each script in `options.thresholds`.

## Mapping results to your dashboard symptoms

| Symptom | Most diagnostic test | What to look for |
|---|---|---|
| CPU at 98.5% | `06-polling-storm` then `02-load` | If 100 *idle* tabs alone push CPU high → fix the polling pattern, not compute |
| Disk IO burst drained | `05-soak` | Steady decline of burst budget during the hold = missing indexes / seq scans |
| Memory creep | `05-soak` | Memory should plateau; climbing = connection/cache bloat |
| "Performance affected" banner | `03-stress` | The VU count where p95 explodes = your true capacity |

## While tests run, also check

- Supabase Dashboard → Reports → Database (CPU/IO/connections in real time)
- `get_advisors` (MCP) for unindexed-query and RLS-performance warnings
- Query performance page → sort by total time → the top 3 queries during a
  test run are your optimization targets

## Likely fixes these tests will point to (cheapest first)

1. **Add jitter + lengthen the 90s poll** in the recovery pattern — synced
   keepalive bursts from many tabs are a self-inflicted thundering herd.
2. **Index/RLS tuning** — RLS policies with per-row subqueries (e.g. the
   `EXISTS (SELECT 1 FROM profiles ...)` officer checks) run for *every row*;
   wrap in `(select auth.uid())` and add covering indexes.
3. **Limit selected columns** — several stores `select=*` on wide tables.
4. Only then: compute upgrade (Nano → Micro/Small).
