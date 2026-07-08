-- ============================================================
-- Migration: 20260709_rewards_deadline
-- Description: Optional time-limited rewards. Adds a nullable `deadline`
--              column to `rewards`. Once a reward's deadline passes it is
--              set INACTIVE (is_active = false) — not deleted, no special
--              "expired" status — so it drops out of the member catalog
--              like any other inactive reward.
--
--              Enforcement (two layers):
--                (1) deactivate_expired_rewards() — flips is_active = false
--                    for past-deadline rewards. Scheduled via pg_cron as a
--                    MANUAL go-live step (see bottom of file).
--                (2) redeem_reward() gains a deadline guard so redemption is
--                    impossible after the deadline even during the cron/cache
--                    lag window (the catalog is cached for CACHE_TTL.REWARDS
--                    = 120s and cron runs on an interval).
--
--              Ships the column + functions + grants ONLY. Scheduling is a
--              deliberate manual step — see the ROLLOUT snippet at the bottom.
-- Run order: after 20260708_reset_points_annual.sql
-- ============================================================
--
-- ⚠️ LIVE-DB DRIFT: the live prod DB is the source of truth for the
--    redeem_reward body — the deployed function may differ from the migration
--    files. BEFORE applying part (b), dump the live definition and diff it:
--
--      SELECT pg_get_functiondef('redeem_reward(uuid, uuid)'::regprocedure);
--
--    If the live body differs from the one below, PRESERVE the live body and
--    add ONLY the deadline guard (immediately after the is_active check).
--    Keep `SET search_path = public` (added in 20260324_rls_security.sql).
--
-- ⚠️ pg_cron must be enabled in the target project (it is enabled out-of-band,
--    not by any migration — the rate-limit cleanup job in 20260322_rate_limiting.sql
--    relies on it). Confirm with:
--      SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- ============================================================


-- ============================================================
-- (a) Add the optional deadline column (NULL = no deadline, never expires)
-- ============================================================
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS deadline timestamptz;


-- ============================================================
-- (b) redeem_reward — add a deadline guard.
--     Body copied from 20260318_rewards_engine.sql:272-313, plus
--     `SET search_path = public` (20260324) and the NEW deadline check.
--     CREATE OR REPLACE preserves existing grants (REVOKE FROM PUBLIC /
--     GRANT TO authenticated from earlier migrations stay intact); the
--     GRANT below is re-asserted for safety.
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_reward(p_reward_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward rewards%ROWTYPE;
  v_user_balance integer;
  v_redemptions_this_year integer;
  v_redemption_id uuid;
BEGIN
  SELECT * INTO v_reward FROM rewards WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Reward not found'); END IF;
  IF NOT v_reward.is_active THEN RETURN json_build_object('success', false, 'error', 'Reward not available'); END IF;
  -- NEW: reject redemption once the reward's deadline has passed, even if the
  -- cron job hasn't flipped is_active yet (authoritative live gate).
  IF v_reward.deadline IS NOT NULL AND v_reward.deadline < now() THEN
    RETURN json_build_object('success', false, 'error', 'Reward no longer available');
  END IF;
  IF v_reward.stock_remaining IS NOT NULL AND v_reward.stock_remaining <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Out of stock');
  END IF;
  SELECT spendable_points INTO v_user_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  IF COALESCE(v_user_balance, 0) < v_reward.points_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient points');
  END IF;
  IF v_reward.max_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_redemptions_this_year
    FROM reward_redemptions
    WHERE user_id = p_user_id AND reward_id = p_reward_id
      AND EXTRACT(YEAR FROM redeemed_at) = EXTRACT(YEAR FROM now());
    IF v_redemptions_this_year >= v_reward.max_per_user THEN
      RETURN json_build_object('success', false, 'error', 'Annual limit reached');
    END IF;
  END IF;
  UPDATE profiles SET spendable_points = spendable_points - v_reward.points_cost WHERE id = p_user_id;
  IF v_reward.stock_remaining IS NOT NULL THEN
    UPDATE rewards SET stock_remaining = stock_remaining - 1 WHERE id = p_reward_id;
  END IF;
  INSERT INTO reward_redemptions (user_id, reward_id, status)
  VALUES (p_user_id, p_reward_id, 'pending') RETURNING id INTO v_redemption_id;
  INSERT INTO point_transactions (user_id, amount, description, source)
  VALUES (p_user_id, -v_reward.points_cost, 'Redeemed: ' || v_reward.name, 'redemption');
  RETURN json_build_object('success', true, 'redemption_id', v_redemption_id);
END;
$$;
GRANT EXECUTE ON FUNCTION redeem_reward(uuid, uuid) TO authenticated;


-- ============================================================
-- (c) deactivate_expired_rewards() — flips past-deadline rewards to inactive.
--     One-directional: only DEACTIVATES. Extending a deadline on an already
--     inactive reward requires the admin to re-toggle is_active manually.
--     Locked to service_role (pg_cron's scheduling superuser can call it
--     regardless of this grant). Mirrors the guard style in
--     20260708_reset_points_annual.sql.
-- ============================================================
CREATE OR REPLACE FUNCTION deactivate_expired_rewards()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE rewards
  SET is_active = false
  WHERE deadline IS NOT NULL
    AND deadline < now()
    AND is_active;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;  -- surfaced in cron.job_run_details.return_message
END;
$$;

REVOKE EXECUTE ON FUNCTION deactivate_expired_rewards() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION deactivate_expired_rewards() TO service_role;


-- ============================================================
-- ROLLOUT — run this MANUALLY in the SQL editor, not as part of the
-- migration. This migration intentionally schedules NOTHING.
--
-- Recommended cadence: every 15 minutes (pg_cron runs in UTC, but a
-- fixed interval like this is timezone-agnostic).
--
--      DO $$ BEGIN PERFORM cron.unschedule('deactivate-expired-rewards');
--      EXCEPTION WHEN OTHERS THEN NULL; END $$;
--
--      SELECT cron.schedule('deactivate-expired-rewards', '*/15 * * * *',
--        $$SELECT deactivate_expired_rewards()$$);
--
--      SELECT jobname, schedule, command FROM cron.job
--      WHERE jobname = 'deactivate-expired-rewards';
--
-- Confirm a run (return_message = number of rewards deactivated):
--      SELECT status, return_message, end_time FROM cron.job_run_details
--      WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'deactivate-expired-rewards')
--      ORDER BY end_time DESC LIMIT 1;
-- ============================================================
