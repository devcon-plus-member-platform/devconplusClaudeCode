-- ── Mission completion_mode: multi-participant vs single-winner ───────────────
-- Missions began as a single-winner "Bounty System": the first approved submission
-- flipped the whole mission to status='claimed', locking it for everyone. The product
-- has since moved to multi-participant tasks (self_attest / link / proof_upload) that
-- ANY member should be able to complete for XP. This adds a per-mission discriminant so
-- both models are supported:
--   multi          — every member who completes it earns XP; approving one does NOT lock it (default)
--   single_winner  — first approved submission wins; the mission locks (legacy bounty behavior)
--
-- Idempotent — safe to re-apply.
--
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor. The live prod DB drifts from these
--    migration files. Before trusting the approve_mission_winner() body below, dump the
--    live definition and reconcile:
--      SELECT pg_get_functiondef('approve_mission_winner(uuid)'::regprocedure);

-- 1. Column
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS completion_mode text
    CHECK (completion_mode IN ('multi', 'single_winner'))
    DEFAULT 'multi';

-- 2. approve_mission_winner — only lock the mission for single_winner missions
CREATE OR REPLACE FUNCTION approve_mission_winner(sub_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mission_id uuid;
  v_user_id    uuid;
  v_xp_reward  integer;
  v_title      text;
  v_mode       text;
BEGIN
  SELECT ms.mission_id, ms.user_id, m.xp_reward, m.title, m.completion_mode
  INTO   v_mission_id, v_user_id, v_xp_reward, v_title, v_mode
  FROM   mission_submissions ms
  JOIN   missions m ON m.id = ms.mission_id
  WHERE  ms.id = sub_id AND ms.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already processed';
  END IF;

  UPDATE mission_submissions
  SET    status      = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = NOW()
  WHERE  id = sub_id;

  -- Only single-winner (bounty) missions lock after the first approval.
  IF v_mode = 'single_winner' THEN
    UPDATE missions SET status = 'claimed' WHERE id = v_mission_id;
  END IF;

  UPDATE profiles
  SET    spendable_points = COALESCE(spendable_points, 0) + v_xp_reward,
         lifetime_points  = COALESCE(lifetime_points,  0) + v_xp_reward
  WHERE  id = v_user_id;

  INSERT INTO point_transactions (user_id, amount, description, source)
  VALUES (v_user_id, v_xp_reward, 'Mission completed: ' || v_title, 'bonus');
END;
$$;

-- 3. Lock down execute to the service role (NestJS gateway) only — mirrors 20260623.
REVOKE EXECUTE ON FUNCTION public.approve_mission_winner(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_mission_winner(uuid) TO service_role;

-- 4. Reset missions stuck as 'claimed' under the old global lock. All existing rows
--    default to 'multi', so this reopens every unintentionally-locked mission while
--    leaving any (future) single_winner missions claimed.
UPDATE missions SET status = 'available' WHERE status = 'claimed' AND completion_mode = 'multi';
