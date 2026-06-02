-- ── Automated Officer Detection — handle_new_user() + confirmation gate ───────
-- Supersedes 20260401_fix_handle_new_user_username_conflict.sql.
--
-- Adds officer auto-assignment, gated on VERIFIED email ownership to prevent
-- privilege escalation by signing up with someone else's pre-assigned email:
--
--   • handle_new_user() (AFTER INSERT): applies the officer role at signup ONLY
--     when NEW.email_confirmed_at IS NOT NULL — i.e. OAuth (provider-verified) or
--     autoconfirm-enabled projects. For email/password signups requiring
--     confirmation, email_confirmed_at is NULL here, so the user is created as a
--     plain 'member' and the assignment is left unconsumed.
--   • apply_officer_email_on_confirm() (AFTER UPDATE OF email_confirmed_at):
--     fires when the user proves inbox ownership (email_confirmed_at goes
--     NULL → non-null) and applies the officer role then.
--
-- Everything else (Manila fallback, username-conflict fallback, outer error
-- guard) is preserved unchanged.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chapter_id     uuid;
  v_username       text;
  v_role           text := 'member';
  v_assign_chapter uuid;
BEGIN
  BEGIN
    v_chapter_id := (NEW.raw_user_meta_data->>'chapter_id')::uuid;
  EXCEPTION WHEN others THEN
    v_chapter_id := NULL;
  END;

  IF v_chapter_id IS NULL THEN
    SELECT id INTO v_chapter_id FROM chapters WHERE name = 'Manila' LIMIT 1;
  END IF;

  -- Officer auto-assignment — ONLY for already-verified emails (OAuth/autoconfirm).
  -- Unverified email/password signups are handled later by the confirmation trigger.
  IF NEW.email_confirmed_at IS NOT NULL THEN
    SELECT chapter_id INTO v_assign_chapter
    FROM officer_email_assignments
    WHERE lower(email) = lower(NEW.email)
      AND is_active = true
      AND applied_at IS NULL
    LIMIT 1;

    IF v_assign_chapter IS NOT NULL THEN
      v_role := 'chapter_officer';
      v_chapter_id := v_assign_chapter;
    END IF;
  END IF;

  v_username := NEW.raw_user_meta_data->>'username';

  BEGIN
    INSERT INTO public.profiles (
      id, email, full_name, username, school_or_company,
      chapter_id, role, spendable_points, lifetime_points
    ) VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      v_username,
      NEW.raw_user_meta_data->>'school_or_company',
      v_chapter_id,
      v_role,
      0,
      0
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.profiles (
        id, email, full_name, username, school_or_company,
        chapter_id, role, spendable_points, lifetime_points
      ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NULL,
        NEW.raw_user_meta_data->>'school_or_company',
        v_chapter_id,
        v_role,
        0,
        0
      )
      ON CONFLICT (id) DO NOTHING;
    WHEN others THEN
      RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  END;

  -- Consume the assignment only if it was actually applied (verified path above).
  IF v_assign_chapter IS NOT NULL THEN
    BEGIN
      UPDATE officer_email_assignments
        SET applied_at = now(), applied_user_id = NEW.id
        WHERE lower(email) = lower(NEW.email) AND applied_at IS NULL;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'officer assignment consume failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Apply officer role once the email is confirmed ──────────────────────────────
-- Fires when email_confirmed_at transitions NULL → non-null (the user clicked the
-- confirmation link, proving inbox ownership). This is the secure point to grant
-- an officer role for email/password signups.
CREATE OR REPLACE FUNCTION public.apply_officer_email_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assign_chapter uuid;
BEGIN
  SELECT chapter_id INTO v_assign_chapter
  FROM officer_email_assignments
  WHERE lower(email) = lower(NEW.email)
    AND is_active = true
    AND applied_at IS NULL
  LIMIT 1;

  IF v_assign_chapter IS NOT NULL THEN
    UPDATE public.profiles
      SET role = 'chapter_officer', chapter_id = v_assign_chapter
      WHERE id = NEW.id;
    UPDATE officer_email_assignments
      SET applied_at = now(), applied_user_id = NEW.id
      WHERE lower(email) = lower(NEW.email) AND applied_at IS NULL;
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'apply_officer_email_on_confirm failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.apply_officer_email_on_confirm();
