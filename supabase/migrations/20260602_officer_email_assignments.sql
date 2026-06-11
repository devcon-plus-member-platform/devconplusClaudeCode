-- ── Automated Officer Detection ───────────────────────────────────────────────
-- Lets an admin pre-register an email → chapter mapping. When that email signs up
-- (handle_new_user trigger) OR if an account already exists (assign_officer_email
-- RPC, immediate), the user is auto-assigned the chapter_officer role for that
-- chapter — no organizer code, no approval step.

CREATE TABLE IF NOT EXISTS officer_email_assignments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text        NOT NULL,
  chapter_id      uuid        REFERENCES chapters(id) NOT NULL,
  assigned_role   text        NOT NULL DEFAULT 'chapter_officer'
                              CHECK (assigned_role IN ('chapter_officer')),
  is_active       boolean     DEFAULT true,
  applied_at      timestamptz,                       -- set when consumed (signup or immediate)
  applied_user_id uuid        REFERENCES profiles(id),
  created_by      uuid        REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now()
);

-- One rule per email, case-insensitive (auth.users stores emails lowercased).
CREATE UNIQUE INDEX IF NOT EXISTS idx_officer_email_assign_email
  ON officer_email_assignments (lower(email));
CREATE INDEX IF NOT EXISTS idx_officer_email_assign_chapter
  ON officer_email_assignments (chapter_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
-- Admin-only. The trigger + RPC are SECURITY DEFINER, so they bypass RLS.
ALTER TABLE officer_email_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage officer assignments" ON officer_email_assignments;
CREATE POLICY "Admins manage officer assignments"
  ON officer_email_assignments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid()) AND role IN ('hq_admin', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid()) AND role IN ('hq_admin', 'super_admin')
  ));

-- ── RPC: create assignment + immediately upgrade an existing account ─────────────
-- Atomic. Admin-gated. Used by the AdminChapterOfficers create form so the
-- existing-account upgrade happens server-side (no broad profiles UPDATE grant
-- needed on the client).
CREATE OR REPLACE FUNCTION assign_officer_email(p_email text, p_chapter_id uuid)
RETURNS officer_email_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row officer_email_assignments;
  v_uid uuid;
BEGIN
  -- Caller must be an admin.
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('hq_admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Upsert the rule (re-activating + retargeting any existing rule for this email).
  INSERT INTO officer_email_assignments (email, chapter_id, created_by)
  VALUES (lower(p_email), p_chapter_id, auth.uid())
  ON CONFLICT (lower(email)) DO UPDATE
    SET chapter_id = EXCLUDED.chapter_id,
        is_active  = true,
        created_by = EXCLUDED.created_by
  RETURNING * INTO v_row;

  -- If a CONFIRMED account already exists for this email, upgrade it immediately.
  -- Unconfirmed accounts (e.g. an email squatter who signed up but never verified)
  -- are NOT upgraded here — the assignment stays unconsumed and is applied later by
  -- apply_officer_email_on_confirm() once the inbox is actually verified.
  SELECT p.id INTO v_uid
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(p.email) = lower(p_email)
    AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;
  IF v_uid IS NOT NULL THEN
    UPDATE profiles
      SET role = 'chapter_officer', chapter_id = p_chapter_id
      WHERE id = v_uid;
    UPDATE officer_email_assignments
      SET applied_at = now(), applied_user_id = v_uid
      WHERE id = v_row.id
      RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
