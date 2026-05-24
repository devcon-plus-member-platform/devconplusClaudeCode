import type { Profile } from '../types'

export const MOCK_PROFILE: Profile = {
  id: 'user-marie-santos',
  full_name: 'Marie Santos',
  username: 'marie_santos',
  email: 'marie.santos@email.com',
  school_or_company: 'University of the Philippines',
  chapter_id: 'ch-manila',
  role: 'member',
  avatar_url: null,
  spendable_points: 100,
  lifetime_points: 100,
  referral_code: null,
  pending_role: null,
  pending_chapter_id: null,
  linkedin_url: null,
  github_url: null,
  portfolio_url: null,
  interests: null,
  tech_stack: null,
  community_roles: null,
  created_at: '2026-01-01T00:00:00Z',
}

// Derived display helpers
export const MOCK_PROFILE_INITIALS = 'MS'
export const MOCK_PROFILE_XP_NEXT_MILESTONE = 250 // next reward at 250 XP
export const MOCK_PROFILE_XP_PROGRESS = (MOCK_PROFILE.lifetime_points ?? 0) / MOCK_PROFILE_XP_NEXT_MILESTONE
