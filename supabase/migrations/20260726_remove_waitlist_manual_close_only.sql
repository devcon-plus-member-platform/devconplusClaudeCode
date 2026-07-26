-- supabase/migrations/20260726_remove_waitlist_manual_close_only.sql
--
-- Change of plan (same day as 20260726_event_capacity_waitlist.sql): no
-- waitlist for now. Registration submission is never auto-waitlisted based
-- on capacity — capacity + no_show_buffer only gates
-- approve_registration_with_capacity(). The event only stops accepting new
-- registrations when an organizer manually sets registration_closed = true.

-- 1. Any rows already auto-waitlisted under the previous version of this
--    feature go back to pending — organizers re-triage them manually.
UPDATE event_registrations SET status = 'pending' WHERE status = 'waitlisted';

-- 2. handle_registration_insert(): drop the capacity-based auto-waitlist.
--    registration_closed remains the only insert-time hard stop.
CREATE OR REPLACE FUNCTION public.handle_registration_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires_approval   boolean;
  v_registration_closed boolean;
BEGIN
  SELECT requires_approval, registration_closed
    INTO v_requires_approval, v_registration_closed
  FROM public.events
  WHERE id = NEW.event_id;

  IF v_registration_closed THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_requires_approval THEN
    NEW.status        := 'approved';
    NEW.qr_code_token := 'DCN-' || upper(substring(gen_random_uuid()::text FROM 1 FOR 8));
    NEW.approved_at   := now();
  END IF;

  RETURN NEW;
END;
$$;

-- 3. approve_registration_with_capacity(): 'waitlisted' is no longer a
--    reachable status — only 'pending' registrations get approved. Capacity +
--    no_show_buffer ceiling check on 'approved' count is unchanged (this is
--    the "capacity+10 for approval" behavior we're keeping).
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
  IF v_reg.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_status');
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_reg.event_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'event_not_found');
  END IF;

  -- Serialize concurrent approvals for the same event.
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

-- 4. Drop 'waitlisted' from the allowed status set — no longer reachable.
ALTER TABLE event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_status_check;

ALTER TABLE event_registrations
  ADD CONSTRAINT event_registrations_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));
