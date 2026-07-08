-- ============================================================
-- Migration: 20260708_reset_points_annual
-- Description: Annual Points+ reset (June 24, Philippine time).
--              Zeroes BOTH spendable_points and lifetime_points for
--              every profile and logs an auditable 'reset' ledger row.
--              Ships the function + constraint + grants ONLY.
--              Scheduling is a deliberate manual step — see the
--              STAGED ROLLOUT snippets at the bottom of this file.
-- Run order: after 20260704_fix_missions_submission_type_check.sql
-- ============================================================
--
-- ⚠️ LIVE-DB DRIFT: the live prod DB is the source of truth for the
--    point_transactions source CHECK — it may already allow values not
--    present in the migration files. BEFORE applying part (a), dump the
--    live constraint and confirm the value list:
--
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--      WHERE conname = 'point_transactions_source_check';
--
--    If the live list differs from the one below, edit part (a) to
--    preserve EVERY existing value and merely add 'reset'.
--
-- ⚠️ pg_cron must be enabled in the target project (it is enabled
--    out-of-band, not by any migration — the rate-limit cleanup job in
--    20260322_rate_limiting.sql relies on it). Confirm with:
--      SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- ============================================================


-- ============================================================
-- (a) Allow the 'reset' source on the points ledger
--     (mirrors 20260318_rewards_engine.sql:41-47)
-- ============================================================
ALTER TABLE point_transactions DROP CONSTRAINT IF EXISTS point_transactions_source_check;
ALTER TABLE point_transactions ADD CONSTRAINT point_transactions_source_check
  CHECK (source IN (
    'signup', 'event_attendance', 'brown_bag', 'speaking',
    'content_like', 'content_share', 'volunteering', 'redemption', 'bonus',
    'referral',
    'reset'          -- NEW: annual June-24 points reset
  ));


-- ============================================================
-- (b) reset_points(p_user_id uuid DEFAULT NULL)
--     NULL          -> reset ALL profiles (the yearly job)
--     a uuid        -> reset just that ONE profile (staged test / off-cycle fix)
--     One atomic pass: audit rows first, then zero the balances.
-- ============================================================
CREATE OR REPLACE FUNCTION reset_points(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Audit trail: one row per affected member, capturing BOTH pre-reset
  -- values in the description (amount = the spendable loss the member feels).
  INSERT INTO point_transactions (user_id, amount, description, source)
  SELECT
    id,
    -spendable_points,
    'Annual points reset (June 24) — ' || spendable_points || ' spendable / '
      || lifetime_points || ' lifetime cleared',
    'reset'
  FROM profiles
  WHERE (spendable_points <> 0 OR lifetime_points <> 0)
    AND (p_user_id IS NULL OR id = p_user_id);

  -- Zero both balances for the same set of rows.
  UPDATE profiles
  SET spendable_points = 0,
      lifetime_points  = 0
  WHERE (spendable_points <> 0 OR lifetime_points <> 0)
    AND (p_user_id IS NULL OR id = p_user_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;  -- surfaced in cron.job_run_details.return_message
END;
$$;


-- ============================================================
-- (c) Lock down execution to service_role only
--     (mirrors 20260622_lockdown_security_definer_rpcs.sql)
--     The pg_cron job runs as the scheduling superuser role, which can
--     call the function regardless of this grant.
-- ============================================================
REVOKE EXECUTE ON FUNCTION reset_points(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION reset_points(uuid) TO service_role;


-- ============================================================
-- STAGED ROLLOUT — run these MANUALLY in the SQL editor, not as part of
-- the migration. This migration intentionally schedules NOTHING so the
-- cron is proven on one account before it ever touches all members.
-- ============================================================
--
-- ── PHASE 1: one-user test — a live cron that fires ONCE, ~2 min out ──
--
-- 1) Your uuid + current points (write these down to restore later):
--      SELECT id, spendable_points, lifetime_points
--      FROM profiles WHERE email = 'you@devcon.ph';
--
-- 2) Cron expression for 2 minutes from now, in UTC (pg_cron is UTC):
--      SELECT to_char(now() AT TIME ZONE 'UTC' + interval '2 minutes', 'MI HH24') AS min_hour;
--      -- e.g. "07 14"  ->  use  '7 14 * * *'  below
--
-- 3) Schedule it scoped to YOUR uuid only:
--      SELECT cron.schedule('reset-points-test', '<MI> <HH> * * *',
--        $$SELECT reset_points('YOUR-UUID')$$);
--
-- 4) After ~2 min, confirm it fired:
--      SELECT status, return_message, end_time FROM cron.job_run_details
--      WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reset-points-test')
--      ORDER BY end_time DESC LIMIT 1;    -- 'succeeded', return_message = 1
--
-- 5) Unschedule immediately (a bare 'MI HH * * *' repeats daily):
--      SELECT cron.unschedule('reset-points-test');
--
-- 6) Verify only your row changed:
--      SELECT count(*) FROM point_transactions WHERE source = 'reset';  -- 1
--
-- 7) Restore your account:
--      UPDATE profiles SET spendable_points = <old>, lifetime_points = <old>
--      WHERE id = 'YOUR-UUID';
--      DELETE FROM point_transactions WHERE user_id = 'YOUR-UUID' AND source = 'reset';
--
-- ── PHASE 2: go live for everyone (yearly, all users) ──
-- June 24 00:00 PHT (UTC+8, no DST) = June 23 16:00 UTC  ->  '0 16 23 6 *'
--
--      DO $$ BEGIN PERFORM cron.unschedule('annual-points-reset');
--      EXCEPTION WHEN OTHERS THEN NULL; END $$;
--
--      SELECT cron.schedule('annual-points-reset', '0 16 23 6 *',
--        $$SELECT reset_points()$$);
--
--      SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'annual-points-reset';
-- ============================================================
