-- ── Missions RLS: grant chapter_officer write access (2026-06-14) ────────────
-- The original policies only allowed hq_admin/super_admin to insert/update/delete
-- missions. OrgMissions.tsx writes directly via the Supabase client under the
-- chapter officer's JWT, so chapter_officer was silently blocked by RLS.

DROP POLICY IF EXISTS "missions_admin_insert" ON missions;
CREATE POLICY "missions_admin_insert" ON missions FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('chapter_officer', 'hq_admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "missions_admin_update" ON missions;
CREATE POLICY "missions_admin_update" ON missions FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('chapter_officer', 'hq_admin', 'super_admin')
  )
);

-- Delete stays admin-only — no delete UI in OrgMissions.
