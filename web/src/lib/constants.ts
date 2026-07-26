export const VOLUNTEER_APPROVAL_POINTS = 35

export const EVENT_XP: Record<string, number> = {
  tech_talk:  5,
  social:     5,
  networking: 5,
  code_camp:  50,
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

/**
 * HOTFIX (2026-07-26) — manual registration kill switch.
 *
 * `events.capacity` is stored but never enforced: the gateway's
 * `RegistrationsService.register()` inserts unconditionally, and `GET /api/events`
 * returns no registration count, so the client cannot tell that an event is full.
 * Until the server-side cap lands, list an event's slug here to close in-app
 * registration for it.
 *
 * Scope of the switch: hides the join CTA on the event card + detail page and
 * bounces `/events/:slug/register` back to the detail page. Members who are
 * ALREADY registered keep their pending screen / QR ticket.
 *
 * Caveat: this is UI-only. `POST /api/registrations` still accepts direct calls,
 * so it stops normal users, not a crafted request. Remove entries once the
 * gateway enforces capacity.
 */
export const CLOSED_EVENT_SLUGS: readonly string[] = [
  'dev-roast-claude-vs-codex-vs-cursor-vs-qwen-coder-367a87d4',
]

/** Message shown in place of the join CTA for a closed event. */
export const REGISTRATION_CLOSED_MESSAGE = 'Registration Closed — this event has reached full capacity'

/** True when in-app registration is manually closed for this event slug. */
export function isRegistrationClosed(slug: string | null | undefined): boolean {
  return !!slug && CLOSED_EVENT_SLUGS.includes(slug)
}
