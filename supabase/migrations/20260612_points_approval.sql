-- ── Points Approval Dashboard ───────────────────────────────────────────────
-- Extends mission_submissions for admin review workflow (approve / reject with remarks)
-- Adds user_notifications table for system messages to members

-- 1. Extend mission_submissions with review audit fields
ALTER TABLE mission_submissions
  ADD COLUMN IF NOT EXISTS admin_remarks text,
  ADD COLUMN IF NOT EXISTS reviewed_by   uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at   timestamptz;

-- 2. Widen status CHECK to include 'rejected'
ALTER TABLE mission_submissions DROP CONSTRAINT IF EXISTS mission_submissions_status_check;
ALTER TABLE mission_submissions
  ADD CONSTRAINT mission_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 3. Admin update policy for reviewing submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mission_submissions'
      AND policyname = 'submissions_admin_review'
  ) THEN
    CREATE POLICY "submissions_admin_review" ON mission_submissions
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                AND role IN ('hq_admin', 'super_admin'))
      );
  END IF;
END $$;

-- 4. Update approve_mission_winner to stamp reviewer + reviewed_at
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

-- 5. New RPC: reject_mission_submission (SECURITY DEFINER — bypasses member RLS)
CREATE OR REPLACE FUNCTION reject_mission_submission(
  p_submission_id uuid,
  p_admin_remarks text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('hq_admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: hq_admin or super_admin required';
  END IF;

  UPDATE mission_submissions
  SET    status        = 'rejected',
         admin_remarks = p_admin_remarks,
         reviewed_by   = auth.uid(),
         reviewed_at   = NOW()
  WHERE  id = p_submission_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already processed';
  END IF;
END;
$$;

-- 6. user_notifications — persistent in-app notifications for members
CREATE TABLE IF NOT EXISTS user_notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  message    text        NOT NULL,
  type       text        NOT NULL DEFAULT 'system'
               CHECK (type IN ('points_approved', 'points_rejected', 'system')),
  read       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_notifs_read_own" ON user_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_notifs_admin_insert" ON user_notifications
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('hq_admin', 'super_admin'))
  );

CREATE POLICY "user_notifs_mark_read" ON user_notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_notifications_user_id_idx
  ON user_notifications (user_id, created_at DESC);

-- Enable realtime so members see the notification the moment admin acts
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
