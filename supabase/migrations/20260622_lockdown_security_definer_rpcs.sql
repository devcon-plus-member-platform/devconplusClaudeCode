-- Lock down anon/authenticated EXECUTE on backend-only SECURITY DEFINER functions.
--
-- WHY: After the app moved to a service-role NestJS backend (Phase 5/6), the public
-- anon key (shipped in the frontend bundle) could still call these RPCs directly via
-- PostgREST `POST /rest/v1/rpc/<fn>`, because the default PUBLIC EXECUTE grant was never
-- revoked. Two were directly exploitable:
--   * increment_member_points — no authorization check at all → anyone could mint points.
--   * admin_update_user_role — guard is NULL-bypassable: with no JWT, auth.uid() is NULL,
--     so `IF v_caller_role NOT IN (...)` evaluates to NULL and the RAISE is skipped.
-- Supabase's security advisor independently flags all of these
-- ("Public Can Execute SECURITY DEFINER Function").
--
-- FIX: revoke EXECUTE from PUBLIC/anon/authenticated and re-grant to service_role only.
-- Every one of these functions is called exclusively by the NestJS backend (service role)
-- or by edge functions (service role), or is a trigger function (fired by the DB engine,
-- where the EXECUTE grant is irrelevant). The backend enforces authorization at the API
-- layer (AuthGuard + RolesGuard), so the revoke is the real security boundary.
--
-- DELIBERATELY NOT CHANGING FUNCTION BODIES: e.g. admin_update_user_role's internal
-- auth.uid() guard is moot once only service_role can call it — and "fixing" it to reject
-- NULL would BREAK the legitimate backend call (admin.repository.ts invokes it via service
-- role, where auth.uid() is NULL by design). The revoke closes the hole without that risk.
--
-- NOT REVOKED (intentionally):
--   * is_admin()    — referenced by the RLS policy "Admins can view all profiles" on
--                     profiles; authenticated MUST keep EXECUTE or that policy breaks.
--   * get_my_role() — read-only self-role lookup helper; harmless, kept for parity.
--   * assign_officer_email(), confirm_referral() — still called directly from the browser;
--     revoked separately in 20260622_lockdown_migrated_client_rpcs.sql AFTER the frontend
--     is migrated to backend endpoints.
--
-- Idempotent: REVOKE/GRANT are safe to re-run.

DO $$
DECLARE
  fn text;
  backend_only_fns text[] := ARRAY[
    'admin_update_user_role(uuid, text)',
    'apply_officer_email_assignment(uuid)',
    'approve_mission_winner(uuid)',
    'approve_organizer_upgrade(uuid, text, uuid, uuid, uuid)',
    'approve_reward_claim(uuid, uuid)',
    'approve_volunteer_application(uuid, uuid)',
    'award_signup_bonus()',
    'award_signup_bonus_for_verified(uuid)',
    'check_rate_limit(text, text)',
    'create_profile_with_bonus(uuid, text, text, uuid, text, text, text, boolean)',
    'delete_own_account()',
    'get_active_chapters_count()',
    'get_attendance_trend()',
    'get_member_growth()',
    'get_total_xp_distributed()',
    'get_xp_by_chapter()',
    'handle_email_confirmation()',
    'handle_new_user()',
    'handle_registration_insert()',
    'increment_member_points(uuid, integer)',
    'manual_checkin(uuid, uuid)',
    'officer_approve_upgrade(uuid, uuid)',
    'officer_demote_coorganizer(uuid, uuid)',
    'redeem_reward(uuid, uuid)',
    'refund_reward_claim(uuid, uuid)',
    'reject_mission_submission(uuid, text)',
    'reject_organizer_upgrade(uuid, uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY backend_only_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO service_role;', fn);
  END LOOP;
END
$$;
