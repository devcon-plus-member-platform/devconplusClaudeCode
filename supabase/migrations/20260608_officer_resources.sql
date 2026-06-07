-- Officer dashboard resource links (Review Resources / View Training Archive /
-- Request Seed Funds). Previously hardcoded in apps/member/src/lib/officerResources.ts;
-- moved to the DB so HQ admins can manage them at runtime from /admin/officer-resources.

CREATE TABLE IF NOT EXISTS officer_resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL CHECK (category IN ('resource', 'training', 'seed_funds')),
  title       text NOT NULL,
  subtitle    text,
  href        text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Officers read links ordered within each category
CREATE INDEX IF NOT EXISTS officer_resources_category_order_idx
  ON officer_resources (category, sort_order);

ALTER TABLE officer_resources ENABLE ROW LEVEL SECURITY;

-- Any authenticated user (members + officers) may read active links.
DROP POLICY IF EXISTS "officer_resources read active" ON officer_resources;
CREATE POLICY "officer_resources read active" ON officer_resources
  FOR SELECT
  USING (
    is_active = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('hq_admin', 'super_admin')
    )
  );

-- Only HQ admins / super admins may create, update, or delete links.
DROP POLICY IF EXISTS "officer_resources admin write" ON officer_resources;
CREATE POLICY "officer_resources admin write" ON officer_resources
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('hq_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('hq_admin', 'super_admin')
    )
  );

-- Keep updated_at fresh on every change.
CREATE OR REPLACE FUNCTION set_officer_resources_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS officer_resources_set_updated_at ON officer_resources;
CREATE TRIGGER officer_resources_set_updated_at
  BEFORE UPDATE ON officer_resources
  FOR EACH ROW EXECUTE FUNCTION set_officer_resources_updated_at();

-- Seed the existing hardcoded entries so nothing is lost. hrefs are left blank
-- for HQ to fill in from the admin panel (inactive until a URL is set).
-- Idempotent: only seeds when the table is empty (no unique key to ON CONFLICT on).
INSERT INTO officer_resources (category, title, sort_order, is_active, href)
SELECT * FROM (VALUES
  ('resource', 'HQ Preview — 2025 DEVCON Chapter Leaders Playbook & Quarterly Success Checklist', 0, false, ''),
  ('resource', '2025 Community Strategy Playbook & Shared Best Practices',                          1, false, ''),
  ('resource', 'DEVCON Leaders Oath Taking for incoming officers',                                  2, false, ''),
  ('resource', 'External partners view — DEVCON 2025 Programs and Calendar',                        3, false, ''),
  ('resource', 'Post Event OR Liquidation — updated for 2026',                                      4, false, ''),
  ('resource', '2025 Nationwide Internal Calendar',                                                 5, false, ''),
  ('seed_funds', 'Request for Chapter Event or Special Programs Support',                           0, false, '')
) AS seed(category, title, sort_order, is_active, href)
WHERE NOT EXISTS (SELECT 1 FROM officer_resources);
