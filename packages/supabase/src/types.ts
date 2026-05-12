// ── DATABASE TYPES ──────────────────────────────────────────────────────────
// Typed to match the Supabase schema defined in CLAUDE.md §4.
// Generated types will replace this file once `supabase gen types typescript` is run.

export type Region = 'Luzon' | 'Visayas' | 'Mindanao'

export type UserRole = 'member' | 'chapter_officer' | 'hq_admin' | 'super_admin'

export type EventStatus = 'upcoming' | 'ongoing' | 'past'

export type EventCategory =
  | 'tech_talk'
  | 'hackathon'
  | 'workshop'
  | 'brown_bag'
  | 'summit'
  | 'social'
  | 'networking'

export type DevconCategory = 'devcon' | 'she' | 'kids' | 'campus'

export type EventVisibility = 'public' | 'unlisted' | 'draft'

export type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type PointSource =
  | 'signup'
  | 'event_attendance'
  | 'brown_bag'
  | 'speaking'
  | 'content_like'
  | 'content_share'
  | 'volunteering'
  | 'redemption'
  | 'bonus'
  | 'referral'

export type WorkType = 'remote' | 'onsite' | 'hybrid' | 'full_time' | 'part_time'

export type RewardType = 'digital' | 'physical'

export type ClaimMethod = 'onsite' | 'digital_delivery'

export type NewsCategory = 'devcon' | 'tech_community'

export type RedemptionStatus = 'pending' | 'claimed' | 'cancelled'

// ── TABLE INTERFACES ─────────────────────────────────────────────────────────

export interface Chapter {
  id: string
  name: string
  region: Region
  created_at: string
}

export interface Profile {
  id: string
  full_name: string
  username: string | null
  email: string
  school_or_company: string | null
  chapter_id: string
  role: UserRole
  avatar_url: string | null
  spendable_points: number | null
  lifetime_points: number | null
  referral_code: string | null
  pending_role: string | null
  pending_chapter_id: string | null
  linkedin_url: string | null
  github_url: string | null
  portfolio_url: string | null
  interests: number[] | null
  tech_stack: number[] | null
  community_roles: number[] | null
  created_at: string
}

export type UpgradeRequestStatus = 'pending' | 'approved' | 'rejected'

export interface OrganizerUpgradeRequest {
  id: string
  user_id: string
  organizer_code: string
  chapter_id: string | null
  requested_role: 'chapter_officer' | 'hq_admin'
  status: UpgradeRequestStatus
  reviewed_by: string | null
  created_at: string
  reviewed_at: string | null
}

export interface OrganizerCode {
  id: string
  code: string
  chapter_id: string | null
  program_id: string | null
  scope_type: 'chapter' | 'program'
  assigned_role: 'chapter_officer' | 'hq_admin'
  is_active: boolean
  usage_limit: number | null
  usage_count: number
  expires_at: string | null
  created_at: string
}

export interface Event {
  id: string
  chapter_id: string
  title: string
  description: string | null
  location: string | null
  event_date: string | null
  end_date: string | null
  category: EventCategory | null
  devcon_category: DevconCategory | null
  tags: string[]
  visibility: EventVisibility
  is_free: boolean
  ticket_price_php: number
  capacity: number | null
  points_value: number
  volunteer_points: number
  requires_approval: boolean
  status: EventStatus
  is_featured: boolean
  is_promoted: boolean
  slug: string
  is_chapter_locked: boolean | null
  cover_image_url: string | null
  created_by: string
  created_at: string
  /** JSONB: array of CustomFormField objects defined by the officer/admin */
  custom_form_schema: unknown
}

export interface EventRegistration {
  id: string
  event_id: string
  user_id: string
  status: RegistrationStatus
  qr_code_token: string | null
  checked_in: boolean | null
  registered_at: string
  approved_at: string | null
  /** JSONB: answers keyed by CustomFormField.id */
  form_responses: unknown
}

export interface PointTransaction {
  id: string
  user_id: string
  amount: number
  description: string
  transaction_ref: string
  source: PointSource
  created_at: string
}

export interface Reward {
  id: string
  name: string
  description: string | null
  points_cost: number
  type: RewardType
  claim_method: ClaimMethod
  image_url: string | null
  is_active: boolean
  is_coming_soon: boolean
  stock_remaining: number | null
  max_per_user: number | null
  financial_cost_php: number | null
  created_at: string
}

export interface RewardRedemption {
  id: string
  user_id: string
  reward_id: string
  status: RedemptionStatus
  redeemed_at: string
  claimed_at: string | null
  claim_pin: string | null
}

export interface Job {
  id: string
  title: string
  company: string
  location: string | null
  work_type: WorkType
  description: string | null
  apply_url: string | null
  logo_url: string | null
  is_promoted: boolean
  is_active: boolean
  posted_at: string
}

export interface NewsPost {
  id: string
  title: string
  body: string | null
  category: NewsCategory
  is_featured: boolean
  is_promoted: boolean
  cover_image_url: string | null
  author_id: string | null
  created_at: string
}

export interface Program {
  id: string
  name: string
  theme_id: string | null
  description: string | null
  is_active: boolean
  created_at: string
}

export interface XpTier {
  id: string
  name: string
  label: string
  min_points: number
  max_points: number | null
  badge_color: string | null
  created_at: string
}

export interface VolunteerApplication {
  id: string
  event_id: string
  user_id: string
  phone_number: string | null
  social_media_handle: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  applied_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface Referral {
  id: string
  referrer_id: string
  referred_user_id: string
  status: 'pending' | 'confirmed'
  created_at: string
  confirmed_at: string | null
}

// ── Missions (Bounty System) ─────────────────────────────────────────────────

export type MissionDifficulty = 'easy' | 'medium' | 'hard'
export type MissionStatus     = 'available' | 'claimed'
export type SubmissionStatus  = 'pending' | 'approved'

export interface Mission {
  id: string
  title: string
  description: string | null
  xp_reward: number
  difficulty: MissionDifficulty
  status: MissionStatus
  github_url: string | null
  created_at: string
}

export interface MissionParticipant {
  mission_id: string
  user_id: string
  joined_at: string
}

export interface MissionSubmission {
  id: string
  mission_id: string
  user_id: string
  pr_link: string
  status: SubmissionStatus
  submitted_at: string
}
