-- ── Profiles RLS: officers read their chapter's member profiles (2026-06-14) ─────
-- The only profiles SELECT policy ("Users can view own profile") limits reads to
-- auth.uid() = id. The organizer mission-review queue and registration approval
-- cards join member profiles under the OFFICER's JWT — both to show member names
-- and to filter the mission queue by the member's chapter. RLS hid those rows, so
-- the review queue came back EMPTY even for a same-chapter submission (the join is
-- profiles!inner, and the chapter filter reads profiles.chapter_id — both blocked).
-- Member-side missions are unaffected because they flow through the service-role
-- NestJS backend, which bypasses RLS.
--
-- Grant officers SELECT on profiles in their OWN chapter; hq_admin/super_admin may
-- read all. A profiles policy that subqueries profiles would recurse, so the
-- caller's role/chapter is read through a SECURITY DEFINER helper owned by a
-- superuser (its internal read bypasses RLS — the canonical Supabase pattern).

CREATE OR REPLACE FUNCTION public.can_read_profile_in_chapter(target_chapter uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles me
    WHERE me.id = auth.uid()
      AND me.role IN ('chapter_officer', 'hq_admin', 'super_admin')
      AND (me.role IN ('hq_admin', 'super_admin') OR me.chapter_id = target_chapter)
  );
$$;

-- SELECT policies are OR-combined, so this is additive — "Users can view own
-- profile" still governs every member's own row.
DROP POLICY IF EXISTS "Officers read chapter member profiles" ON profiles;
CREATE POLICY "Officers read chapter member profiles" ON profiles FOR SELECT
  USING (public.can_read_profile_in_chapter(chapter_id));
