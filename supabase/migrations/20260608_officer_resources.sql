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

