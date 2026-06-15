-- Phase 4 of Firebase Auth JIT migration.
-- Removes the remaining Supabase Auth dependencies from the database layer.
--
-- 1. Drop profiles → auth.users FK — blocks create_profile_with_bonus() for
--    Firebase-only users whose profiles.id UUIDs are not in auth.users.
-- 2. Drop on_auth_user_created trigger — dead code. Firebase users are never
--    inserted into auth.users. create_profile_with_bonus() RPC is now the
--    sole profile-creation path (as noted in 20260528_firebase_auth_foundation.sql).
-- 3. Fix delete_own_account() — remove DELETE FROM auth.users.
--    NestJS /auth/account/delete handles Firebase user deletion via Admin SDK.
--    The RPC only needs to clean up application data.


-- ── 1. Drop FK constraint (profiles.id → auth.users.id) ───────────────────
-- PostgreSQL names this profiles_id_fkey by convention (table_column_fkey).
-- IF NOT EXISTS / IF EXISTS guards make this safe to re-run.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;


-- ── 2. Drop on_auth_user_created trigger ──────────────────────────────────
-- Firebase users never touch auth.users, so this trigger never fires for them.
-- Supabase Auth signups are disabled in the frontend. Dead code removed.
-- handle_new_user() function is kept for reference until Phase 5 cleanup.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;


-- ── 3. Fix delete_own_account — remove DELETE FROM auth.users ─────────────
-- The old implementation tried to delete from auth.users using auth.uid().
-- For Firebase-only accounts, profiles.id is not in auth.users, so the
-- DELETE was silently a no-op for them — but it caused confusion.
-- NestJS /auth/account/delete calls Firebase Admin SDK then this RPC,
-- so all cleanup is coordinated from the server side.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.reward_redemptions  WHERE user_id   = auth.uid();
  DELETE FROM public.point_transactions  WHERE user_id   = auth.uid();
  DELETE FROM public.event_registrations WHERE user_id   = auth.uid();
  DELETE FROM public.news_posts          WHERE author_id = auth.uid();
  DELETE FROM public.profiles            WHERE id        = auth.uid();
  -- auth.users deletion is handled by NestJS /auth/account/delete (Firebase Admin SDK).
  -- Removed: DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
