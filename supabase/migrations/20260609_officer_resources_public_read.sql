-- Make officer_resources publicly readable so the shareable officer-resource
-- pages (/officer-resources/:slug) work for upcoming officers who do NOT yet
-- have an account. Previously the SELECT policy applied to PUBLIC implicitly,
-- but the table-level grant to the `anon` role was not guaranteed. This makes
-- both explicit: anyone (logged in or not) may read ACTIVE links; inactive
-- links remain visible only to HQ / super admins.
--
-- Write access is unchanged — still HQ/super admins only (see 20260608).

-- Ensure the anonymous role can reach the table at the SQL grant layer.
GRANT SELECT ON officer_resources TO anon;

-- Recreate the read policy with explicit role targeting + the public-read rule.
DROP POLICY IF EXISTS "officer_resources read active" ON officer_resources;
CREATE POLICY "officer_resources read active" ON officer_resources
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('hq_admin', 'super_admin')
    )
  );
