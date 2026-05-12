-- ── Mission submission_type ───────────────────────────────────────────────────
-- Adds a discriminant column to missions that controls how a member completes it:
--   proof_upload — member submits a proof link; admin reviews and approves
--   link         — member opens a URL; participation is tracked, no submission
--   self_attest  — member clicks "Mark as Done"; creates a pending submission
--                  for admin review (same queue as proof_upload, no link required)

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS submission_type text
    CHECK (submission_type IN ('proof_upload', 'link', 'self_attest'))
    DEFAULT 'self_attest';
