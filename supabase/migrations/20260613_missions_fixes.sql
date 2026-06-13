-- ── Mission system fixes (2026-06-13) ────────────────────────────────────────
-- Addresses six gaps identified during schema review:
--   1. Capture is_active migration drift (column exists in live DB, not in migrations)
--   2. Add rejection_reason field for admin feedback surfaced in Needs Revision UI
--   3. Broaden mission_submissions.status CHECK to include 'rejected'
--   4. Replace winner-takes-all approve_mission_winner with approve_mission_submission
--      (does NOT set missions.status='claimed' — missions stay open for all members)
--   5. Add reject_mission_submission RPC
--   6. Update RLS so members can resubmit after rejection (Try Again flow)

-- ── 1. Migration drift: is_active ────────────────────────────────────────────
-- Column was added to the live DB via dashboard without a migration file.
-- This captures it so schema is reproducible from migrations alone.

ALTER TABLE missions ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ── 2. Rejection reason ───────────────────────────────────────────────────────

ALTER TABLE mission_submissions
  ADD COLUMN IF NOT EXISTS rejection_reason text DEFAULT NULL;

-- ── 3. Broaden status CHECK ───────────────────────────────────────────────────
-- Postgres auto-names inline constraints as {table}_{column}_check.

ALTER TABLE mission_submissions
  DROP CONSTRAINT IF EXISTS mission_submissions_status_check;

ALTER TABLE mission_submissions
  ADD CONSTRAINT mission_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- ── 4. RLS: allow members to update rejected submissions ──────────────────────
-- Original policy blocked update unless status='pending', which prevented the
-- Try Again flow from resetting a rejected submission back to pending.

DROP POLICY IF EXISTS "submissions_update_own" ON mission_submissions;
CREATE POLICY "submissions_update_own" ON mission_submissions
  FOR UPDATE USING (auth.uid() = user_id AND status IN ('pending', 'rejected'));

-- ── 5. approve_mission_submission ─────────────────────────────────────────────
-- Replaces approve_mission_winner. Key difference: does NOT mutate missions.status.
-- The mission stays 'available' so other members can independently complete it.

CREATE OR REPLACE FUNCTION approve_mission_submission(sub_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_xp_reward      integer;
  v_title          text;
  v_caller_role    text;
  v_caller_chapter uuid;
  v_member_chapter uuid;
BEGIN
  -- Authorization. This is SECURITY DEFINER and writes profiles.spendable_points,
  -- so without a guard any authenticated member could call it on their own
  -- submission and self-award XP. When invoked with an end-user JWT
  -- (auth.uid() present) the caller must be an officer/admin; chapter officers
  -- are further restricted to their own chapter's members. Service-role calls
  -- (auth.uid() null) come from the trusted NestJS backend, which runs its own
  -- auth guard, so they bypass this block.
  IF auth.uid() IS NOT NULL THEN
    SELECT role, chapter_id INTO v_caller_role, v_caller_chapter
    FROM profiles WHERE id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('chapter_officer','hq_admin','super_admin') THEN
      RAISE EXCEPTION 'not authorized to approve mission submissions';
    END IF;

    IF v_caller_role = 'chapter_officer' THEN
      SELECT p.chapter_id INTO v_member_chapter
      FROM mission_submissions ms JOIN profiles p ON p.id = ms.user_id
      WHERE ms.id = sub_id;
      IF v_caller_chapter IS DISTINCT FROM v_member_chapter THEN
        RAISE EXCEPTION 'cross-chapter approval forbidden';
      END IF;
    END IF;
  END IF;

  SELECT ms.user_id, m.xp_reward, m.title
  INTO   v_user_id, v_xp_reward, v_title
  FROM   mission_submissions ms
  JOIN   missions m ON m.id = ms.mission_id
  WHERE  ms.id = sub_id AND ms.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already processed';
  END IF;

  UPDATE mission_submissions
  SET    status           = 'approved',
         rejection_reason = NULL
  WHERE  id = sub_id;

  UPDATE profiles
  SET    spendable_points = COALESCE(spendable_points, 0) + v_xp_reward,
         lifetime_points  = COALESCE(lifetime_points,  0) + v_xp_reward
  WHERE  id = v_user_id;

  INSERT INTO point_transactions (user_id, amount, description, source)
  VALUES (v_user_id, v_xp_reward, 'Mission completed: ' || v_title, 'bonus');
END;
$$;

-- ── 6. reject_mission_submission ─────────────────────────────────────────────
-- Can only reject a pending submission. Stores optional admin feedback in
-- rejection_reason, which the frontend surfaces in the Needs Revision banner.

CREATE OR REPLACE FUNCTION reject_mission_submission(sub_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role    text;
  v_caller_chapter uuid;
  v_member_chapter uuid;
BEGIN
  -- Same authorization model as approve_mission_submission: officer/admin only
  -- when called with a user JWT (chapter officers limited to their chapter);
  -- trusted service-role (auth.uid() null) bypasses the guard.
  IF auth.uid() IS NOT NULL THEN
    SELECT role, chapter_id INTO v_caller_role, v_caller_chapter
    FROM profiles WHERE id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('chapter_officer','hq_admin','super_admin') THEN
      RAISE EXCEPTION 'not authorized to reject mission submissions';
    END IF;

    IF v_caller_role = 'chapter_officer' THEN
      SELECT p.chapter_id INTO v_member_chapter
      FROM mission_submissions ms JOIN profiles p ON p.id = ms.user_id
      WHERE ms.id = sub_id;
      IF v_caller_chapter IS DISTINCT FROM v_member_chapter THEN
        RAISE EXCEPTION 'cross-chapter rejection forbidden';
      END IF;
    END IF;
  END IF;

  UPDATE mission_submissions
  SET    status           = 'rejected',
         rejection_reason = p_reason
  WHERE  id = sub_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found or already processed';
  END IF;
END;
$$;

-- ── Lock down EXECUTE ─────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default, and Supabase exposes every
-- function at /rest/v1/rpc/<name>. Revoke the blanket grant so the in-body
-- authorization above is the sole gate, then grant only to authenticated users
-- (officer/admin enforced in-body) and the service role (trusted backend).
REVOKE EXECUTE ON FUNCTION approve_mission_submission(uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION reject_mission_submission(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION approve_mission_submission(uuid)      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION reject_mission_submission(uuid, text) TO authenticated, service_role;
