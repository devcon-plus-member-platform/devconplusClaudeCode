-- supabase/migrations/20260729_registration_notify_tracking.sql
--
-- Tracks whether a registrant has already been sent a manual "Slot Confirmed"
-- / "Slots Are Full" notification email (organizer-triggered, batch or
-- single). NULL = not yet notified; timestamp = when it was sent. Prevents
-- re-clicking the batch-notify button from re-emailing people who already
-- got a notice.

ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS notified_at timestamptz;
