-- ============================================================================
-- Migration: 20260612_missions_rewards_indexes
-- Description: Indexes for tables added AFTER the 20260324 performance pass —
--              the missions system (20260406) and the reward-claim workflow
--              (20260414). Covers the FK / filter paths the NestJS repositories
--              use that were NOT already indexed.
--
-- ⚠️ STATUS: HOLD — DO NOT APPLY YET.
--   Live diagnostics (2026-06-12, project rrztmvoknmyrpuffutvh) show these tables
--   are tiny (mission_submissions ~16 rows, reward_redemptions ~5 rows) with a
--   100% cache-hit ratio. Postgres will SEQ-SCAN them regardless — these indexes
--   would add write overhead for zero read benefit at current scale. Apply only
--   once a table exceeds ~10k rows. The dominant DB cost today is Supabase
--   Realtime, not these queries (see supabase/diagnostics/FINDINGS.md).
--
-- Method:      All IF NOT EXISTS. When eventually applied: plain CREATE INDEX is
--              fine on these small tables; reserve CONCURRENTLY for large/hot
--              tables (point_transactions / event_registrations — already indexed).
-- Dedup note:  Deduped against LIVE pg_indexes, not just the schema. OMITTED because
--              they already exist (under different names) or are covered by a constraint:
--                - mission_participants(user_id): live idx_mission_participants_user EXISTS
--                - mission_submissions(user_id):  live idx_mission_submissions_user EXISTS
--                - mission_participants(mission_id): covered by PK (mission_id,user_id)
--                - mission_submissions(mission_id,user_id): covered by UNIQUE(mission_id,user_id)
--                - missions(is_active,...): tiny admin-seeded table; findActiveMissions LIMITs 50
-- ============================================================================

-- Admin pending-review queue: findPendingQueue does
--   WHERE status = 'pending' ORDER BY submitted_at ASC.
-- Partial index keeps it tiny (only pending rows) and serves both filter + sort.
CREATE INDEX IF NOT EXISTS idx_mission_submissions_pending
  ON mission_submissions(submitted_at ASC)
  WHERE status = 'pending';

-- ── Reward claim workflow (columns added 20260414) ──────────────────────────
-- reward_redemptions.reviewed_by — FK to profiles added in the claim workflow;
-- no covering index. Used for the organizer audit trail + cascade integrity.
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reviewed_by
  ON reward_redemptions(reviewed_by);

-- reward_redemptions.claim_pin — the generate_claim_pin() BEFORE INSERT trigger
-- scans `WHERE claim_pin = v_pin` on EVERY new redemption to check for collisions.
-- Partial index skips the NULL backlog and makes that probe an index lookup.
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_claim_pin
  ON reward_redemptions(claim_pin)
  WHERE claim_pin IS NOT NULL;

-- SMOKE TEST (run after applying):
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND indexname IN (
--       'idx_mission_participants_user_id',
--       'idx_mission_submissions_user_id',
--       'idx_mission_submissions_pending',
--       'idx_reward_redemptions_reviewed_by',
--       'idx_reward_redemptions_claim_pin'
--     )
--   ORDER BY indexname;
