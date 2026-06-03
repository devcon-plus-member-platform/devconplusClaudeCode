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

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  type: 'digital' | 'physical' | null;
  claim_method: 'onsite' | 'digital_delivery' | null;
  image_url: string | null;
  stock_remaining: number | null;
  max_per_user: number | null;
  financial_cost_php: number | null;
  is_active: boolean;
  is_coming_soon: boolean;
  created_at: string;
}

export interface RewardRedemption {
  id: string;
  user_id: string | null;
  reward_id: string | null;
  status: 'pending' | 'claimed' | 'cancelled';
  redeemed_at: string | null;
  claimed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  claim_pin: string | null;
}

export interface RewardRedemptionWithDetails extends RewardRedemption {
  member_name: string;
  member_email: string;
  reward_name: string;
  reward_image_url: string | null;
  reward_points_cost: number;
}

export interface VolunteerApplication {
  id: string;
  event_id: string;
  user_id: string;
  reason: string;
  phone_number: string | null;
  social_media_handle: string | null;
  status: 'pending' | 'approved' | 'rejected';
  applied_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface OrgVolunteerApplication extends VolunteerApplication {
  event_title: string;
  event_chapter_id: string;
  member_name: string;
  member_email: string;
  school_or_company: string;
}

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
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  created_at: string;
}
