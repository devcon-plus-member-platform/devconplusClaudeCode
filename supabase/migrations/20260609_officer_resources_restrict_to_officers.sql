-- Restrict officer_resources reads to OFFICERS and ADMINS only.
--
-- Supersedes 20260609_officer_resources_public_read.sql, which had opened these
-- rows to anonymous / public reads so upcoming officers could open a shareable
-- link without an account. Product decision (2026-06-09): officer resources are
-- now internal — visible only to chapter officers and HQ / super admins. NOT to
-- the public, and NOT to regular members.
--
-- Read matrix after this migration:
--   anon                 → no access (table grant revoked)
--   member               → no access (role check fails)
--   chapter_officer      → active rows only
--   hq_admin/super_admin → all rows (active + inactive)
--
-- Write access is unchanged — still HQ / super admins only (see 20260608).

-- Pull back the SQL-layer grant that the public-read migration added.
REVOKE SELECT ON officer_resources FROM anon;

-- Recreate the read policy: authenticated officers/admins only.
DROP POLICY IF EXISTS "officer_resources read active" ON officer_resources;
CREATE POLICY "officer_resources read for officers" ON officer_resources
  FOR SELECT
  TO authenticated
  USING (
    -- HQ / super admins see everything, including inactive rows.
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('hq_admin', 'super_admin')
    )
    -- Chapter officers see active rows only.
    OR (
      is_active = true
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'chapter_officer'
      )
    )
  );
