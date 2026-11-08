-- ============================================================
-- Migration: 20260324_rls_security
-- Description: Three categories of security and performance fixes:
--
-- A. Enable RLS on tables missing it (3 ERROR-level advisories)
--    - programs, xp_tiers, rate_limit_log
--
-- B. Fix auth_rls_initplan (47 WARN-level advisories)
--    Replace auth.uid() / auth.role() with (SELECT auth.uid()) /
--    (SELECT auth.role()) in all RLS policies. This converts the
--    per-row function call into a once-per-query Param node, giving
--    O(1) auth evaluation instead of O(n rows scanned).
--
-- C. Fix function_search_path_mutable (12 WARN-level advisories)
--    Add SET search_path = public to all SECURITY DEFINER functions
--    that are missing it. Without a pinned search_path, a superuser
--    could CREATE a malicious function in a search_path schema that
--    shadows a built-in, hijacking the SECURITY DEFINER execution.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- A. ENABLE RLS ON TABLES MISSING IT
-- ════════════════════════════════════════════════════════════

-- ── A1: programs ─────────────────────────────────────────────────────────────
-- Read-only reference data (4 rows: DEVCON+, She is DEVCON, DEVCON Kids, Campus).
-- Any authenticated or anonymous user may read; only admins may write.

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Programs are public"
  ON programs FOR SELECT
  USING (true);

CREATE POLICY "Admins manage programs"
  ON programs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('hq_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('hq_admin', 'super_admin')
    )
  );


-- ── A2: xp_tiers ─────────────────────────────────────────────────────────────
-- Read-only reference data (5 tier rows). Public read; admin write.

ALTER TABLE xp_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "XP tiers are public"
  ON xp_tiers FOR SELECT
  USING (true);

CREATE POLICY "Admins manage xp tiers"
  ON xp_tiers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('hq_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('hq_admin', 'super_admin')
    )
  );


-- ── A3: rate_limit_log ────────────────────────────────────────────────────────
-- Internal table accessed only by the check_rate_limit RPC (SECURITY DEFINER,
-- service_role only) and by anonymous clients for retryAfterSeconds reads.
-- Enabling RLS without restricting anon SELECT preserves the existing behavior.

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Preserve the existing GRANT SELECT TO anon (for retryAfterSeconds calculation).
-- RLS must have a matching policy or anon reads will be blocked.
CREATE POLICY "Anon can read rate limit log"
  ON rate_limit_log FOR SELECT
  TO anon
  USING (true);

-- Authenticated users have no business reading or writing this table directly.
-- The SECURITY DEFINER function bypasses RLS, so service_role writes still work.


-- ════════════════════════════════════════════════════════════
-- B. FIX auth_rls_initplan (auth.uid() → (SELECT auth.uid()))
--
-- Strategy: DROP IF EXISTS + CREATE for each affected policy.
-- This is idempotent and will not fail if run more than once.
-- ════════════════════════════════════════════════════════════

-- ── B1: profiles ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own profile"    ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON profiles;
DROP POLICY IF EXISTS "Users insert own profile"      ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Service role can manage all profiles"
  ON profiles FOR ALL
  USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Users insert own profile"
  ON profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id AND role = 'member');


-- ── B2: organizer_codes ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Active codes are readable by authenticated users" ON organizer_codes;

CREATE POLICY "Active codes are readable by authenticated users"
  ON organizer_codes FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated' AND is_active = true);


-- ── B3: events ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Officers can create events"             ON events;
DROP POLICY IF EXISTS "Officers can update their chapter events" ON events;
DROP POLICY IF EXISTS "Officers can delete their chapter events" ON events;

CREATE POLICY "Officers can create events"
  ON events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('chapter_officer', 'hq_admin', 'super_admin')
    )
  );

CREATE POLICY "Officers can update their chapter events"
  ON events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('chapter_officer', 'hq_admin', 'super_admin')
    )
  );

CREATE POLICY "Officers can delete their chapter events"
  ON events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (
          p.role IN ('hq_admin', 'super_admin')
          OR p.chapter_id = events.chapter_id
        )
    )
  );


-- ── B4: event_registrations ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Members view own registrations"                  ON event_registrations;
DROP POLICY IF EXISTS "Officers view registrations for their events"    ON event_registrations;
DROP POLICY IF EXISTS "Members can register for events"                 ON event_registrations;
DROP POLICY IF EXISTS "Officers can update registration status"         ON event_registrations;
DROP POLICY IF EXISTS "Service role can manage all registrations"       ON event_registrations;
DROP POLICY IF EXISTS "Officers can delete registrations for their events" ON event_registrations;
DROP POLICY IF EXISTS "Members can delete own pending registrations"    ON event_registrations;

CREATE POLICY "Members view own registrations"
  ON event_registrations FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Officers view registrations for their events"
  ON event_registrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE e.id = event_registrations.event_id
        AND e.chapter_id = p.chapter_id
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
    )
  );

CREATE POLICY "Members can register for events"
  ON event_registrations FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Officers can update registration status"
  ON event_registrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE e.id = event_registrations.event_id
        AND e.chapter_id = p.chapter_id
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
    )
  );

CREATE POLICY "Service role can manage all registrations"
  ON event_registrations FOR ALL
  USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "Officers can delete registrations for their events"
  ON event_registrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE e.id = event_registrations.event_id
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (
          p.role IN ('hq_admin', 'super_admin')
          OR p.chapter_id = e.chapter_id
        )
    )
  );

CREATE POLICY "Members can delete own pending registrations"
  ON event_registrations FOR DELETE
  USING (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
  );


-- ── B5: point_transactions ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users view own transactions"              ON point_transactions;
DROP POLICY IF EXISTS "Service role can manage all transactions" ON point_transactions;

CREATE POLICY "Users view own transactions"
  ON point_transactions FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Service role can manage all transactions"
  ON point_transactions FOR ALL
  USING ((SELECT auth.role()) = 'service_role');


-- ── B6: rewards ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Officers can update rewards" ON rewards;
DROP POLICY IF EXISTS "Officers can insert rewards" ON rewards;
DROP POLICY IF EXISTS "Officers can delete rewards" ON rewards;

CREATE POLICY "Officers can update rewards"
  ON rewards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('chapter_officer', 'hq_admin', 'super_admin')
    )
  );

CREATE POLICY "Officers can insert rewards"
  ON rewards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('chapter_officer', 'hq_admin', 'super_admin')
    )
  );

CREATE POLICY "Officers can delete rewards"
  ON rewards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('chapter_officer', 'hq_admin', 'super_admin')
    )
  );


-- ── B7: reward_redemptions ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users view own redemptions" ON reward_redemptions;
DROP POLICY IF EXISTS "Users can redeem rewards"   ON reward_redemptions;

CREATE POLICY "Users view own redemptions"
  ON reward_redemptions FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can redeem rewards"
  ON reward_redemptions FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);


-- ── B8: organizer_upgrade_requests ───────────────────────────────────────────

DROP POLICY IF EXISTS "Members view own upgrade requests"  ON organizer_upgrade_requests;
DROP POLICY IF EXISTS "Members submit upgrade requests"    ON organizer_upgrade_requests;
DROP POLICY IF EXISTS "Admins manage all upgrade requests" ON organizer_upgrade_requests;
DROP POLICY IF EXISTS "Admins can view upgrade requests"   ON organizer_upgrade_requests;

CREATE POLICY "Members view own upgrade requests"
  ON organizer_upgrade_requests FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Members submit upgrade requests"
  ON organizer_upgrade_requests FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Consolidated: covers the old "Admins manage all" + "Admins can view" policies
CREATE POLICY "Admins manage all upgrade requests"
  ON organizer_upgrade_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('hq_admin', 'super_admin')
    )
  );


-- ── B9: event_announcements ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Members can read event announcements"                ON event_announcements;
DROP POLICY IF EXISTS "Officers insert announcements for their chapter events" ON event_announcements;
DROP POLICY IF EXISTS "Officers update announcements for their chapter events" ON event_announcements;
DROP POLICY IF EXISTS "Officers delete announcements for their chapter events" ON event_announcements;

CREATE POLICY "Members can read event announcements"
  ON event_announcements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.event_id = event_announcements.event_id
        AND er.user_id  = (SELECT auth.uid())
        AND er.status   = 'approved'
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN events e ON e.id = event_announcements.event_id
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (p.role IN ('hq_admin', 'super_admin') OR p.chapter_id = e.chapter_id)
    )
  );

CREATE POLICY "Officers insert announcements for their chapter events"
  ON event_announcements FOR INSERT
  WITH CHECK (
    organizer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM events e
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE e.id = event_id
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (
          p.role IN ('hq_admin', 'super_admin')
          OR p.chapter_id = e.chapter_id
        )
    )
  );

CREATE POLICY "Officers update announcements for their chapter events"
  ON event_announcements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE e.id = event_announcements.event_id
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (
          p.role IN ('hq_admin', 'super_admin')
          OR p.chapter_id = e.chapter_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE e.id = event_id
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (
          p.role IN ('hq_admin', 'super_admin')
          OR p.chapter_id = e.chapter_id
        )
    )
  );

CREATE POLICY "Officers delete announcements for their chapter events"
  ON event_announcements FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM events e
      JOIN profiles p ON p.id = (SELECT auth.uid())
      WHERE e.id = event_announcements.event_id
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (
          p.role IN ('hq_admin', 'super_admin')
          OR p.chapter_id = e.chapter_id
        )
    )
  );


-- ── B10: volunteer_applications ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Members can delete own pending volunteer applications" ON volunteer_applications;
DROP POLICY IF EXISTS "Officers manage chapter volunteer applications"         ON volunteer_applications;

CREATE POLICY "Members can delete own pending volunteer applications"
  ON volunteer_applications FOR DELETE
  USING (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
  );

CREATE POLICY "Officers manage chapter volunteer applications"
  ON volunteer_applications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (
          p.role IN ('hq_admin', 'super_admin')
          OR p.chapter_id = (
            SELECT e.chapter_id FROM events e
            WHERE e.id = volunteer_applications.event_id
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role IN ('chapter_officer', 'hq_admin', 'super_admin')
        AND (
          p.role IN ('hq_admin', 'super_admin')
          OR p.chapter_id = (
            SELECT e.chapter_id FROM events e
            WHERE e.id = volunteer_applications.event_id
          )
        )
    )
  );


-- ════════════════════════════════════════════════════════════
-- C. FIX FUNCTION SEARCH PATH (function_search_path_mutable)
--
-- ALTER FUNCTION ... SET search_path = public pins the schema
-- resolution at function-definition time, preventing search_path
-- injection attacks against SECURITY DEFINER functions.
--
-- All 12 functions reported by the advisor (config_options: null).
-- ════════════════════════════════════════════════════════════

-- Trigger function (not SECURITY DEFINER, but still best practice)
ALTER FUNCTION generate_referral_code()
  SET search_path = public;

-- SECURITY DEFINER functions — pinning search_path is mandatory
ALTER FUNCTION award_signup_bonus()
  SET search_path = public;

ALTER FUNCTION increment_member_points(uuid, integer)
  SET search_path = public;

-- Guarded: get_my_role() was created outside migrations; skip on fresh DBs.
DO $$ BEGIN
  IF to_regprocedure('public.get_my_role()') IS NOT NULL THEN
    ALTER FUNCTION get_my_role() SET search_path = public;
  END IF;
END $$;

ALTER FUNCTION redeem_reward(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION approve_volunteer_application(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION confirm_referral(text, uuid)
  SET search_path = public;

-- Guarded: get_total_xp_distributed() was created outside migrations; skip on fresh DBs.
DO $$ BEGIN
  IF to_regprocedure('public.get_total_xp_distributed()') IS NOT NULL THEN
    ALTER FUNCTION get_total_xp_distributed() SET search_path = public;
  END IF;
END $$;

-- Guarded: get_active_chapters_count() was created outside migrations; skip on fresh DBs.
DO $$ BEGIN
  IF to_regprocedure('public.get_active_chapters_count()') IS NOT NULL THEN
    ALTER FUNCTION get_active_chapters_count() SET search_path = public;
  END IF;
END $$;

-- Guarded: get_member_growth() was created outside migrations; skip on fresh DBs.
DO $$ BEGIN
  IF to_regprocedure('public.get_member_growth()') IS NOT NULL THEN
    ALTER FUNCTION get_member_growth() SET search_path = public;
  END IF;
END $$;

-- Guarded: get_xp_by_chapter() was created outside migrations; skip on fresh DBs.
DO $$ BEGIN
  IF to_regprocedure('public.get_xp_by_chapter()') IS NOT NULL THEN
    ALTER FUNCTION get_xp_by_chapter() SET search_path = public;
  END IF;
END $$;

-- Guarded: get_attendance_trend() was created outside migrations; skip on fresh DBs.
DO $$ BEGIN
  IF to_regprocedure('public.get_attendance_trend()') IS NOT NULL THEN
    ALTER FUNCTION get_attendance_trend() SET search_path = public;
  END IF;
END $$;


-- SMOKE TEST (run in Supabase SQL editor after applying):
-- 1. Verify RLS enabled:
--    SELECT tablename, rowsecurity FROM pg_tables
--    WHERE schemaname = 'public'
--    AND tablename IN ('programs', 'xp_tiers', 'rate_limit_log');
--    Expected: all rowsecurity = true
--
-- 2. Verify function search_path:
--    SELECT proname, proconfig FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--    AND proname IN ('generate_referral_code', 'award_signup_bonus',
--                    'increment_member_points', 'get_my_role', 'redeem_reward');
--    Expected: proconfig = '{search_path=public}' for each
