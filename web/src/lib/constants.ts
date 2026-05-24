export const VOLUNTEER_APPROVAL_POINTS = 35

export const EVENT_XP: Record<string, number> = {
  tech_talk:  5,
  social:     5,
  networking: 5,
  workshop:   150,
  brown_bag:  150,
  hackathon:  150,
  summit:     500,
}

export const DEFAULT_EVENT_XP = 5
export const VOLUNTEER_BONUS_XP = 500

export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  member:          'Member',
  chapter_officer: 'Chapter Officer',
  hq_admin:        'HQ Admin',
  super_admin:     'Super Admin',
}

export const WORK_TYPE_LABELS: Record<string, string> = {
  remote:    'Remote',
  onsite:    'Onsite',
  hybrid:    'Hybrid',
  full_time: 'Full-time',
  part_time: 'Part-time',
}

export const CATEGORY_LABELS: Record<string, string> = {
  devcon:          'DEVCON',
  tech_community:  'Tech Community',
}
