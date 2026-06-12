# DB Performance Diagnosis — Findings (2026-06-12)

Run live (read-only) against Supabase project **`rrztmvoknmyrpuffutvh`** via the Management
API. Stats window: **2026-03-02 → 2026-06-12 (~102 days)**.

## Headline: the database is NOT overloaded by app queries or missing indexes.

| Signal | Value | Read |
|--------|-------|------|
| `profiles` row count | **72** | Not a 2000-user dataset — see "Open question" below |
| Largest app table | `point_transactions` 152 kB / 210 rows | Everything is KB-sized |
| Cache hit ratio | **1.0000 (100%)** | Whole working set is in RAM; zero disk-read pressure |
| Connections | 7 idle / 1 active | No pool saturation |
| Avg DB utilization | ~0.6 queries/s, ~0.006 s/s busy | ~0.6% average over 102 days |

Seq-scan *counts* look high (`profiles` 91k, `events` 46k) but each scans only 10–70 rows
fully cached → sub-millisecond. **Postgres deliberately seq-scans tables this small**; the
indexes we drafted wouldn't even be used yet.

## The real load center: Supabase Realtime (~76% of all DB exec time)

Top queries by total execution time (from `pg_stat_statements`) are almost entirely Realtime
infrastructure, not application queries:

| Rank | Query (truncated) | Calls | Total time | What it is |
|------|-------------------|-------|-----------|------------|
| 1 | `SELECT wal->>... ` | 2.71M | **15,462 s** | Realtime WAL→JSON replication |
| 2 | `SELECT wal->>... ` | 1.60M | 13,167 s | Realtime WAL→JSON replication |
| 3 | `with sub_tables as (... pg_publication_tables ...)` | 162k | 6,521 s | Realtime subscription mgmt |
| 4 | `SELECT wal->>... ` | 464k | 3,653 s | Realtime WAL→JSON replication |
| 5 | `insert into cron.job_run_details ...` | 23k | 2,023 s | pg_cron run logging |
| 6 | `with sub_tables as (...)` | 39k | 1,930 s | Realtime subscription mgmt |

The WAL + subscription-management queries sum to **~76% of total DB execution time.** The actual
member data queries (events list, points summary, announcements) are a *small* fraction.

### Why Realtime is so heavy
1. **8 tables are published to `supabase_realtime`:** `events`, `event_registrations`,
   `event_announcements`, `point_transactions`, `rewards`, `missions`, `mission_participants`,
   `mission_submissions`. Every write to any of them generates WAL→JSON work.
2. **Subscription churn.** The `with sub_tables ...` query (#3/#6, ~8.45M ms) re-evaluates
   subscriptions on every channel create/destroy. The frontend's recovery pattern calls
   `resubscribe()` (tear down + recreate ALL channels) on `visibilitychange`, `online`, **every
   90 s**, plus follow-ups at **+5 s and +15 s** — so each active client thrashes subscriptions
   constantly. That directly feeds this cost.
3. **Connection churn.** Heavy `SET client_encoding` / `SET client_min_messages` / `set_config`
   / `BEGIN` counts (56k+ each) = many short-lived connections doing per-connection setup.

### Scaling implication
At **72 users**, Realtime is already 76% of DB time. It scales with active connections, so at
2000 users this subsystem — not query plans — is what falls over. Reducing Realtime dependence
is the architectural lever (the "Group C realtime migration" deferred in the project notes).

## Index drafting outcome: HOLD (live dedup paid off)
Of the 5 indexes drafted, the live `pg_indexes` diff showed:
- `idx_mission_participants_user` and `idx_mission_submissions_user` **already exist** (different
  names) → 2 would have been duplicates.
- The remaining 3 (`mission_submissions` pending, `reward_redemptions.reviewed_by`/`claim_pin`)
  are on 5–16 row tables → no benefit at current scale.
→ Deferred file: `supabase/diagnostics/deferred_missions_rewards_indexes.sql` (NOT in
`migrations/`, so `supabase db push` won't apply it). Revisit when a table passes ~10k rows.

## Minor cleanups (low priority)
- **`cron.job_run_details` is the biggest table (4 MB, 23,328 rows, 0 live tuples)** — pg_cron
  never prunes run history. The `*/5 * * * *` keepalive (`SELECT count(*) FROM profiles`) and the
  hourly rate-limit cleanup log every run. Add a retention purge + `VACUUM`.
- **Unused indexes (idx_scan = 0):** `profiles_interests_gin`, `profiles_tech_stack_gin`,
  `profiles_community_roles_gin`, `idx_organizer_codes_code_active` (gate is disabled),
  `idx_event_announcements_created_at`. Small write-overhead; drop when convenient.

## Open question (blocks correct targeting)
This DB has **72 users**, but the brief said **2000 MAU**. Either production is a **separate
Supabase project** (this is staging/dev) or 2000 is the target. If there's a separate prod
project, the same Realtime analysis should be run there (needs its project ref) — the *shape*
of the problem will be the same, the magnitude larger.
