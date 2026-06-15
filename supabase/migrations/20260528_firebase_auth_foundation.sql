-- Phase 0 of Firebase Auth (JIT) migration.
-- See: docs/migration-plans/auth-migration.md
--
-- Adds:
--   1. profiles.auth_uid (nullable, unique) — vendor-neutral external identity
--      provider UID. Populated during JIT from Firebase Auth today; portable
--      to any future IdP (Auth0, Clerk, custom JWT) without a rename.
--   2. create_profile_with_bonus() RPC — NestJS calls this during signup.
--
-- Zero-downtime: nullable column, small-table unique constraint, new RPC.
-- The existing handle_new_user() trigger + trg_award_signup_bonus keep
-- working for legacy Supabase Auth signups until Phase 4 cutover.


-- ── 1. auth_uid column ────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auth_uid text;

-- Partial unique index — enforces uniqueness for non-null values, skips NULL
-- rows (most of the table during the JIT window). Idempotent via IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_uid_key
  ON profiles(auth_uid)
  WHERE auth_uid IS NOT NULL;

COMMENT ON COLUMN profiles.auth_uid IS
  'External authentication provider UID (currently Firebase Auth). Populated lazily as users JIT-migrate from Supabase Auth. NULL until first sign-in via the new provider. Intentionally vendor-neutral — if we ever swap Firebase for another IdP, only the value source changes, not the schema.';


-- ── 2. create_profile_with_bonus RPC ──────────────────────────────────────
-- NestJS calls this (via service role) during signup. Mirrors the profile-
-- creation half of handle_new_user(). The 100pt welcome bonus is awarded
-- automatically by the existing trg_award_signup_bonus AFTER INSERT trigger
-- on profiles — this RPC does NOT duplicate that logic.

CREATE OR REPLACE FUNCTION public.create_profile_with_bonus(
  p_id                 uuid,
  p_email              text,
  p_full_name          text,
  p_chapter_id         uuid    DEFAULT NULL,
  p_username           text    DEFAULT NULL,
  p_school_or_company  text    DEFAULT NULL,
  p_auth_uid           text    DEFAULT NULL,
  p_is_email_verified  boolean DEFAULT false
)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chapter_id uuid;
  v_id         uuid;
  v_profile    profiles;
BEGIN
  v_chapter_id := p_chapter_id;
  v_id         := p_id;

  -- Chapter fallback mirrors handle_new_user() (20260401_fix): default to Manila.
  IF v_chapter_id IS NULL THEN
    SELECT id INTO v_chapter_id FROM chapters WHERE name = 'Manila' LIMIT 1;
  END IF;

  BEGIN
    INSERT INTO public.profiles (
      id, email, full_name, username, school_or_company,
      chapter_id, role, spendable_points, lifetime_points,
      auth_uid, is_email_verified
    ) VALUES (
      v_id,
      p_email,
      COALESCE(p_full_name, split_part(p_email, '@', 1)),
      p_username,
      p_school_or_company,
      v_chapter_id,
      'member',
      0,
      0,
      p_auth_uid,
      p_is_email_verified
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Username collision → retry with NULL username (user can set later in ProfileEdit).
      INSERT INTO public.profiles (
        id, email, full_name, username, school_or_company,
        chapter_id, role, spendable_points, lifetime_points,
        auth_uid, is_email_verified
      ) VALUES (
        v_id,
        p_email,
        COALESCE(p_full_name, split_part(p_email, '@', 1)),
        NULL,
        p_school_or_company,
        v_chapter_id,
        'member',
        0,
        0,
        p_auth_uid,
        p_is_email_verified
      );
  END;

  -- Re-SELECT after INSERT so the AFTER INSERT trigger's point UPDATE is visible.
  -- RETURNING * only captures pre-trigger state; the re-SELECT sees post-trigger values.
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_id;
  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.create_profile_with_bonus(uuid, text, text, uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_profile_with_bonus(uuid, text, text, uuid, text, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_with_bonus(uuid, text, text, uuid, text, text, text, boolean) TO service_role;

COMMENT ON FUNCTION public.create_profile_with_bonus IS
  'Phase 0 of Firebase Auth migration. NestJS calls this (via service role) during signup to create the profile row. The trg_award_signup_bonus AFTER INSERT trigger on profiles awards the 100pt welcome bonus automatically. Phase 4 will drop on_auth_user_created; this RPC becomes the sole signup path.';
