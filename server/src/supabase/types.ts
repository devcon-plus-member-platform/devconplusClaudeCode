// Minimal Profile type used by NestJS server-side code.
// Mirrors the live `profiles` schema (see supabase/migrations/002_profiles.sql +
// subsequent migrations through 20260528_firebase_auth_foundation.sql).
// Generated DB types live in web/src/types/database.types.ts — we keep a
// hand-rolled copy here to avoid cross-package coupling during the migration.
// If the schema drifts, regenerate web/'s types and sync the relevant slices here.

export type ProfileRole =
  | 'member'
  | 'chapter_officer'
  | 'hq_admin'
  | 'super_admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  username: string | null;
  school_or_company: string | null;
  chapter_id: string;
  role: ProfileRole;
  avatar_url: string | null;
  spendable_points: number;
  lifetime_points: number;
  referral_code: string | null;
  pending_role: string | null;
  pending_chapter_id: string | null;
  auth_uid: string | null;
  is_email_verified: boolean;
  created_at: string;
}
