-- supabase/migrations/20260726_event_capacity_waitlist.sql
--
-- Real capacity enforcement + no-show buffer + waitlist, replacing the
-- CLOSED_EVENT_SLUGS frontend hotfix (web/src/lib/constants.ts).
--
--   * events.no_show_buffer   — configurable per-event buffer an officer can
--                                approve into past `capacity` (default 10).
--   * events.registration_closed — manual organizer hard-stop, independent of
--                                capacity.
--   * event_registrations.status gains 'waitlisted'.
--   * handle_registration_insert() now also decides registration_closed /
--     waitlisted at insert time.
--   * approve_registration_with_capacity() replaces the plain UPDATE the
--     gateway used to run, gating approval at capacity + no_show_buffer.

-- 1. Allow 'waitlisted' registrations.
ALTER TABLE event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_status_check;

ALTER TABLE event_registrations
  ADD CONSTRAINT event_registrations_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'waitlisted'));

-- 2. New event columns.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS no_show_buffer integer NOT NULL DEFAULT 10;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS registration_closed boolean NOT NULL DEFAULT false;

-- 3. Extend the insert trigger: manual close (hard stop) → exception;
--    capacity + buffer ceiling reached → waitlisted; otherwise unchanged.
CREATE OR REPLACE FUNCTION public.handle_registration_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires_approval  boolean;
  v_capacity           integer;
  v_no_show_buffer     integer;
  v_registration_closed boolean;
  v_committed_count    integer;
BEGIN
  SELECT requires_approval, capacity, no_show_buffer, registration_closed
    INTO v_requires_approval, v_capacity, v_no_show_buffer, v_registration_closed
  FROM public.events
  WHERE id = NEW.event_id;

  IF v_registration_closed THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize concurrent inserts (and share this lock with
  -- approve_registration_with_capacity below) so two simultaneous
  -- registrations/approvals for the same event never race on the same count.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text, 0));

  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_committed_count
    FROM public.event_registrations
    WHERE event_id = NEW.event_id
      AND status IN ('approved', 'pending');

    IF v_committed_count >= v_capacity + v_no_show_buffer THEN
      NEW.status := 'waitlisted';
      RETURN NEW;
    END IF;
  END IF;

  IF NOT v_requires_approval THEN
    NEW.status        := 'approved';
    NEW.qr_code_token := 'DCN-' || upper(substring(gen_random_uuid()::text FROM 1 FOR 8));
    NEW.approved_at   := now();
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Capacity-aware approval RPC — replaces the gateway's plain UPDATE.
--    Modeled on manual_checkin() below: verify role, lock the row, structured
--    {success, error} JSON result.
CREATE OR REPLACE FUNCTION approve_registration_with_capacity(
  p_registration_id uuid,
  p_organizer_id    uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg            event_registrations%ROWTYPE;
  v_event          events%ROWTYPE;
  v_org_role       text;
  v_approved_count integer;
  v_qr_token       text;
BEGIN
  SELECT role INTO v_org_role FROM profiles WHERE id = p_organizer_id;
  IF v_org_role NOT IN ('chapter_officer', 'hq_admin', 'super_admin') THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_reg FROM event_registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'registration_not_found');
  END IF;
  IF v_reg.status NOT IN ('pending', 'waitlisted') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_status');
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_reg.event_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'event_not_found');
  END IF;

  -- Same lock key as handle_registration_insert() — serializes approvals
  -- against concurrent inserts/approvals for this event.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_reg.event_id::text, 0));

  IF v_event.capacity IS NOT NULL THEN
    SELECT count(*) INTO v_approved_count
    FROM event_registrations
    WHERE event_id = v_reg.event_id AND status = 'approved';

    IF v_approved_count >= v_event.capacity + v_event.no_show_buffer THEN
      RETURN json_build_object('success', false, 'error', 'capacity_full');
    END IF;
  END IF;

  v_qr_token := 'DCN-' || upper(substring(gen_random_uuid()::text FROM 1 FOR 8));

  UPDATE event_registrations
  SET status = 'approved', approved_at = now(), qr_code_token = v_qr_token
  WHERE id = p_registration_id;

  RETURN json_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION approve_registration_with_capacity(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION approve_registration_with_capacity(uuid, uuid) TO authenticated;
