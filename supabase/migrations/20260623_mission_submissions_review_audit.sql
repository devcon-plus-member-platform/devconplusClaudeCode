-- ── Mission Submissions: review audit columns + reject RPC ───────────────────
-- Adds the admin-review audit trail to mission_submissions and defines the
-- reject_mission_submission server-side RPC.
-- Idempotent — safe to re-apply against a DB that already has these changes
-- (e.g. if the 20260612_points_approval.sql was applied directly on an earlier branch).

-- 1. Audit columns
ALTER TABLE mission_submissions
  ADD COLUMN IF NOT EXISTS admin_remarks text,
  ADD COLUMN IF NOT EXISTS reviewed_by   uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz;

-- 2. Widen status CHECK to include 'rejected'
ALTER TABLE mission_submissions DROP CONSTRAINT IF EXISTS mission_submissions_status_check;
ALTER TABLE mission_submissions
  ADD CONSTRAINT mission_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 3. RLS: allow service_role (NestJS backend) to update submissions for review
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mission_submissions' AND policyname = 'submissions_admin_review'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "submissions_admin_review" ON mission_submissions
        FOR UPDATE USING (
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                  AND role IN ('hq_admin', 'super_admin'))
        )
    $policy$;
  END IF;
END $$;

-- 4. approve_mission_winner — stamp reviewer + reviewed_at (idempotent replace)
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
BEGIN
  SELECT ms.mission_id, ms.user_id, m.xp_reward, m.title
  INTO   v_mission_id, v_user_id, v_xp_reward, v_title
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

  UPDATE missions SET status = 'claimed' WHERE id = v_mission_id;

  UPDATE profiles
  SET    spendable_points = COALESCE(spendable_points, 0) + v_xp_reward,
         lifetime_points  = COALESCE(lifetime_points,  0) + v_xp_reward
  WHERE  id = v_user_id;

  INSERT INTO point_transactions (user_id, amount, description, source)
  VALUES (v_user_id, v_xp_reward, 'Mission completed: ' || v_title, 'bonus');
END;
$$;

-- 5. reject_mission_submission — called exclusively by NestJS service role
--    auth.uid() is NULL under service role; authorization is enforced at the API layer.
CREATE OR REPLACE FUNCTION reject_mission_submission(
  p_submission_id uuid,
  p_admin_remarks text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  UPDATE mission_submissions
  SET    status        = 'rejected',
         admin_remarks = p_admin_remarks,
         reviewed_at   = NOW()
  WHERE  id = p_submission_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already processed';
  END IF;
END;
$$;

-- 6. Lock down execute to service_role only (idempotent)
REVOKE EXECUTE ON FUNCTION public.reject_mission_submission(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reject_mission_submission(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.approve_mission_winner(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_mission_winner(uuid) TO service_role;
