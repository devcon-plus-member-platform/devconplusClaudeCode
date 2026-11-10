-- supabase/migrations/20260323_signup_data_fix.sql
-- ── Part A: chapter_id NOT NULL enforcement ───────────────────────────────────

BEGIN;

-- Reassign any null chapter_id rows to Manila (dev accounts only — no prod users yet)
UPDATE profiles
SET chapter_id = (SELECT id FROM chapters WHERE name = 'Manila' LIMIT 1)
WHERE chapter_id IS NULL;

-- Enforce NOT NULL
ALTER TABLE profiles ALTER COLUMN chapter_id SET NOT NULL;

COMMIT;


-- ── Part B: Replace handle_new_user() trigger ─────────────────────────────────
-- Now writes username, chapter_id, school_or_company from raw_user_meta_data.
-- Falls back to Manila chapter UUID when chapter_id is absent or unparseable.
-- Does NOT award points — trg_award_signup_bonus handles that AFTER INSERT.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chapter_id uuid;
BEGIN
  -- Safely parse chapter_id from metadata; any parse failure → NULL → Manila fallback
  BEGIN
    v_chapter_id := (NEW.raw_user_meta_data->>'chapter_id')::uuid;
  EXCEPTION WHEN others THEN
    v_chapter_id := NULL;
  END;

  IF v_chapter_id IS NULL THEN
    SELECT id INTO v_chapter_id FROM chapters WHERE name = 'Manila' LIMIT 1;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    school_or_company,
    chapter_id,
    role,
    spendable_points,
    lifetime_points
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'school_or_company',
    v_chapter_id,
    'member',
    0,
    0
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


-- ── Part C: Fix approve_organizer_upgrade — COALESCE for HQ codes ────────────
-- HQ organizer codes have chapter_id = NULL (by design).
-- After NOT NULL on profiles.chapter_id, setting chapter_id = NULL would violate
-- the constraint. COALESCE retains the user's existing chapter (Manila from trigger).

CREATE OR REPLACE FUNCTION approve_organizer_upgrade(
  p_user_id     uuid,
  p_role        text,
  p_chapter_id  uuid,
  p_request_id  uuid,
  p_reviewer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_role NOT IN ('chapter_officer', 'hq_admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  UPDATE profiles
  SET
    role               = p_role,
    chapter_id         = COALESCE(p_chapter_id, chapter_id),
    pending_role       = NULL,
    pending_chapter_id = NULL
  WHERE id = p_user_id;

  UPDATE organizer_upgrade_requests
  SET
    status      = 'approved',
    reviewed_by = p_reviewer_id,
    reviewed_at = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_organizer_upgrade(uuid, text, uuid, uuid, uuid) TO authenticated;
