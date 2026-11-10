-- Catch-up for schema that was applied to prod by hand (SQL editor) and never
-- committed as a migration. See GitHub issue #2.
--
-- WHY: a DB built from migrations alone (`supabase db push` / `db reset`) was missing
-- these objects, so Google/email sign-up failed in create_profile_with_bonus() with
-- `column "is_email_verified" of relation "profiles" does not exist`.
--
-- Column types mirror web/src/types/database.types.ts (generated from prod).
-- Function bodies are reconstructed from their callers (server/src/supabase/supabase.service.ts,
-- 20260602_handle_new_user_officer_detection.sql) because prod's source was never committed.
-- Before running this against prod, diff with `supabase db diff --linked`. The column DDL is a
-- no-op there, but the CREATE OR REPLACE below would overwrite prod's function bodies.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.


-- ── 1. Columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS github_url        text,
  ADD COLUMN IF NOT EXISTS linkedin_url      text,
  ADD COLUMN IF NOT EXISTS portfolio_url     text;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS devcon_category           text,
  ADD COLUMN IF NOT EXISTS end_time                  time,
  ADD COLUMN IF NOT EXISTS external_registration_url text,
  ADD COLUMN IF NOT EXISTS is_external               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_status            text,
  ADD COLUMN IF NOT EXISTS ticket_price              integer DEFAULT 0;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.officer_resources
  ADD COLUMN IF NOT EXISTS group_label text;

ALTER TABLE public.xp_tiers
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS icon      text;


-- ── 2. Signup bonus, gated on a verified email ───────────────────────────────
-- Idempotent: awards at most once per profile (guards on an existing 'signup'
-- transaction). Locks the profile row so concurrent callers can't double-award.

CREATE OR REPLACE FUNCTION public.award_signup_bonus_for_verified(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM profiles
    WHERE id = p_profile_id AND is_email_verified
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM point_transactions
    WHERE user_id = p_profile_id AND source = 'signup'
  ) THEN
    RETURN;
  END IF;

  UPDATE profiles
    SET spendable_points = COALESCE(spendable_points, 0) + 100,
        lifetime_points  = COALESCE(lifetime_points, 0)  + 100
    WHERE id = p_profile_id;

  INSERT INTO point_transactions (user_id, amount, description, source)
  VALUES (p_profile_id, 100, 'Welcome to DEVCON+!', 'signup');
END;
$$;

-- trg_award_signup_bonus (AFTER INSERT on profiles) now only awards verified
-- sign-ups (Google). Email/password sign-ups insert with is_email_verified=false
-- and are awarded by setEmailVerified() → award_signup_bonus_for_verified().
CREATE OR REPLACE FUNCTION public.award_signup_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_email_verified THEN
    PERFORM public.award_signup_bonus_for_verified(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


-- ── 3. Officer auto-assignment for the Firebase flow ─────────────────────────
-- Replaces the Supabase auth.users confirmation trigger, which Firebase never fires.
-- No-ops unless the profile's email is verified AND an active, unconsumed assignment
-- exists. Only promotes plain members so it can't demote an existing admin.

CREATE OR REPLACE FUNCTION public.apply_officer_email_assignment(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email          text;
  v_assign_chapter uuid;
BEGIN
  SELECT email INTO v_email
  FROM profiles
  WHERE id = p_profile_id
    AND is_email_verified
    AND COALESCE(role, 'member') = 'member';
  IF v_email IS NULL THEN
    RETURN;
  END IF;

  SELECT chapter_id INTO v_assign_chapter
  FROM officer_email_assignments
  WHERE lower(email) = lower(v_email)
    AND is_active = true
    AND applied_at IS NULL
  LIMIT 1
  FOR UPDATE;
  IF v_assign_chapter IS NULL THEN
    RETURN;
  END IF;

  UPDATE profiles
    SET role = 'chapter_officer', chapter_id = v_assign_chapter
    WHERE id = p_profile_id;

  UPDATE officer_email_assignments
    SET applied_at = now(), applied_user_id = p_profile_id
    WHERE lower(email) = lower(v_email) AND applied_at IS NULL;
END;
$$;


-- ── 4. Grants (backend-only, matching 20260622_lockdown_security_definer_rpcs) ─
-- That migration runs before this one on a fresh DB and skipped these functions
-- because they didn't exist yet, so lock them down here.

REVOKE EXECUTE ON FUNCTION public.award_signup_bonus_for_verified(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_signup_bonus()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_officer_email_assignment(uuid)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.award_signup_bonus_for_verified(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.award_signup_bonus()                  TO service_role;
GRANT  EXECUTE ON FUNCTION public.apply_officer_email_assignment(uuid)  TO service_role;
