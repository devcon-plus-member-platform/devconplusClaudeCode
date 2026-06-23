-- Lock down the two RPCs that were the last functions called directly from the browser.
--
-- These were migrated to the NestJS backend (service role) and the frontend no longer calls
-- them via supabase.rpc():
--   * assign_officer_email  → POST /api/admin/officers/assign (AdminController, hq_admin only)
--   * confirm_referral      → confirmed server-side in AuthService.emailSignup (referral_code
--                             now travels with the signup payload)
--
-- DEPLOY ORDER (important): apply this migration ONLY AFTER the backend + frontend changes
-- that stop the direct browser calls are live. Applying it earlier would 403 the still-shipped
-- supabase.rpc() calls. The companion migration 20260622_lockdown_security_definer_rpcs.sql has
-- no such dependency and can go first.
--
-- Idempotent: REVOKE/GRANT are safe to re-run.

DO $$
DECLARE
  fn text;
  migrated_fns text[] := ARRAY[
    'assign_officer_email(text, uuid)',
    'confirm_referral(text, uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY migrated_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO service_role;', fn);
  END LOOP;
END
$$;
