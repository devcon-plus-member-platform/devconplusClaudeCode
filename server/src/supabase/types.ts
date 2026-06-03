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

export interface XpTier {
  id: string;
  name: string;
  label: string;
  min_points: number;
  max_points: number | null;
  badge_color: string | null;
}

export interface PointSummary {
  spendable_points: number;
  lifetime_points: number;
}

export interface Registration {
  id: string;
  event_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  qr_code_token: string | null;
  checked_in: boolean;
  registered_at: string | null;
  approved_at: string | null;
}

export interface RegistrantWithProfile extends Registration {
  member_name: string;
  member_email: string;
  school_or_company: string;
  form_responses: Record<string, unknown> | null;
}

export interface PointTransaction {
  id: string;
  user_id: string;
  amount: number;
  description: string;
  transaction_ref: string | null;
  source: string | null;
  created_at: string;
}

export interface AdminAnalytics {
  totalMembers: number;
  totalEvents: number;
  xpDistributed: number;
  activeChapters: number;
  memberGrowth: { month: string; count: number }[];
  xpByChapter: { chapter: string; xp: number }[];
  attendanceTrend: { event: string; attendance: number }[];
}

export interface OrgCode {
  id: string;
  code: string;
  chapter_id: string | null;
  assigned_role: 'chapter_officer' | 'hq_admin';
  is_active: boolean;
  usage_limit: number | null;
  usage_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface OrgCodeWithChapter extends OrgCode {
  chapter_name: string | null;
}

export interface UpgradeRequest {
  id: string;
  user_id: string;
  organizer_code: string;
  chapter_id: string | null;
  requested_role: 'chapter_officer' | 'hq_admin';
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface UpgradeRequestWithDetails extends UpgradeRequest {
  member_name: string;
  member_email: string;
  member_chapter_id: string | null;
  member_chapter_name: string | null;
  request_chapter_name: string | null;
}

export interface CoOrganizer {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
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
