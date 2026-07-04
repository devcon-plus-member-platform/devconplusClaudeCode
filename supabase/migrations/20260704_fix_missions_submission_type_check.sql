-- ── Fix: reconcile missions.submission_type CHECK constraint with app code ─────
-- Symptom (prod): saving a mission with the "Submit for Approval" option fails with
--   new row for relation "missions" violates check constraint "missions_submission_type_check"
--
-- Root cause — live-DB drift:
--   • Commit 37ffed8 (2026-05-13) renamed the code value 'self_attest' → 'submit_for_approval'.
--     The live DB CHECK constraint was set to allow 'submit_for_approval' and some rows
--     (e.g. "Complete Profile Details") were saved with it.
--   • The code was later renamed BACK to 'self_attest' (current tree: types.ts, the NestJS
--     create/update DTOs, AdminMissions.tsx, Rewards.tsx all use 'self_attest'), and
--     20260513_missions_submission_type.sql was edited to match — but the live constraint
--     was never re-applied. So the DB still rejects 'self_attest'.
--
-- This migration brings the live DB back in line with the app: migrate the legacy rows,
-- then swap the constraint + default to the current vocabulary.
--
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor — the configured Supabase MCP points at a
--    different project, so this cannot be pushed automatically. Idempotent — safe to re-run.

-- (Optional) verify the current live state first:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'missions'::regclass AND contype = 'c';
--   SELECT submission_type, count(*) FROM missions GROUP BY 1 ORDER BY 1;

-- 1. Drop the stale constraint (by the exact name from the error message).
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_submission_type_check;

-- 2. Normalize legacy 'submit_for_approval' (and any null/unexpected value) to 'self_attest'.
--    'submit_for_approval' and 'self_attest' are the same flow — member declares done, the
--    submission lands in the admin review queue — so this is a pure rename, no behavior change.
UPDATE missions
SET    submission_type = 'self_attest'
WHERE  submission_type IS NULL
   OR  submission_type NOT IN ('proof_upload', 'link', 'self_attest');

-- 3. Re-add the constraint with the values the app actually sends.
ALTER TABLE missions
  ADD CONSTRAINT missions_submission_type_check
  CHECK (submission_type IN ('proof_upload', 'link', 'self_attest'));

-- 4. Align the column default with the code (live default was left on the old value).
ALTER TABLE missions ALTER COLUMN submission_type SET DEFAULT 'self_attest';
