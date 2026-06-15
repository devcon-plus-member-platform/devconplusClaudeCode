-- ============================================================================
-- PRODUCTION DB ops — Realtime publication prune + maintenance cleanups
-- Derived from live diagnostics 2026-06-12 (see FINDINGS.md). These MUTATE prod.
-- Apply deliberately via the Supabase SQL editor (NOT auto-applied; this file is
-- intentionally outside supabase/migrations/). Review each section first.
-- ============================================================================

-- ── SECTION A: Prune the Realtime publication ───────────────────────────────
-- ~76% of DB execution time is Realtime WAL→JSON processing. Every table in
-- `supabase_realtime` is replicated on every write. Currently published (8):
--   events, event_registrations, event_announcements, point_transactions,
--   rewards, missions, mission_participants, mission_submissions
--
-- CLEAR WINS — remove (low/no UX cost; data refetches on mount + 300 s poll):
--   rewards               — catalog changes are rare admin edits, never live-critical
--   missions              — admin-seeded; list rarely changes mid-session
--   mission_participants  — live "X joined" counts are nice-to-have, not essential
--   mission_submissions   — live submission counts are nice-to-have, not essential
ALTER PUBLICATION supabase_realtime DROP TABLE rewards;
ALTER PUBLICATION supabase_realtime DROP TABLE missions;
ALTER PUBLICATION supabase_realtime DROP TABLE mission_participants;
ALTER PUBLICATION supabase_realtime DROP TABLE mission_submissions;

-- KEEP (UX-critical or low-write):
--   event_registrations  — EventPending screen depends on the live pending→approved
--                          transition (officer approves → member's screen updates)
--   event_announcements  — member notifications; low write volume, cheap to keep
--
-- DECIDE (commented out — UX trade-off, confirm before dropping):
--   point_transactions — drives the "your points just went up" live update after a
--     QR scan (the member isn't the actor, so without it points lag up to 300 s).
--     Higher write volume → real WAL cost. Drop if the lag is acceptable:
-- ALTER PUBLICATION supabase_realtime DROP TABLE point_transactions;
--   events — live events list. Admin-created, infrequent. Drop if refetch-on-open is fine:
-- ALTER PUBLICATION supabase_realtime DROP TABLE events;
--
-- NOTE: after dropping a table here, also remove its frontend subscription so the
-- app doesn't open a channel that never fires (useRewardsStore.subscribeToChanges,
-- useMissionsStore.subscribeToChanges + the layout calls). Tracked as follow-up.
--
-- Verify afterwards:
-- SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' ORDER BY 1;


-- ── SECTION B: pg_cron run-history retention ────────────────────────────────
-- cron.job_run_details is the single biggest table (4 MB, 23k rows, 0 live tuples)
-- because pg_cron never prunes its own history. Two active jobs log every run:
--   '0 * * * *'   rate_limit_log cleanup
--   '*/5 * * * *' keepalive: SELECT count(*) FROM profiles  (288 runs/day)
-- One-time purge of old rows:
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
-- Schedule a daily retention purge (idempotent name):
SELECT cron.schedule(
  'purge-cron-run-history',
  '17 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
-- Reclaim space afterwards (run separately — VACUUM cannot run inside a txn block):
--   VACUUM (ANALYZE) cron.job_run_details;
--
-- OPTIONAL: if this project is on a paid (non-pausing) tier, the */5 keepalive job
-- is likely unnecessary and is the main source of this churn. Confirm tier first:
-- SELECT cron.unschedule(2);   -- jobid 2 = the keepalive


-- ── SECTION C: Drop unused indexes (idx_scan = 0 over 102 days) ──────────────
-- Pure write-overhead today. All app-owned and NON-constraint (UNIQUE/PK indexes
-- are intentionally excluded — they enforce invariants even at 0 scans).
-- The interest GIN indexes are unused because no feature queries interest overlap
-- yet — re-create them when interest matching/recommendations ship.
DROP INDEX IF EXISTS profiles_interests_gin;
DROP INDEX IF EXISTS profiles_tech_stack_gin;
DROP INDEX IF EXISTS profiles_community_roles_gin;
DROP INDEX IF EXISTS idx_organizer_codes_code_active;   -- OrganizerCodeGate is disabled
DROP INDEX IF EXISTS idx_event_announcements_created_at;
DROP INDEX IF EXISTS idx_volunteer_applications_pending;
