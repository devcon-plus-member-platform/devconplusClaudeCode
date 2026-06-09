// Shared types for officer dashboard resource links.
//
// The link data now lives in the `officer_resources` Supabase table and is
// managed by HQ admins at /admin/officer-resources. Fetching/state is handled
// by useOfficerResourcesStore; this module only holds the shared shapes.

/** A single resource link card rendered on an officer-resources page. */
export interface OfficerLink {
  /** Card title shown in the slider */
  title: string
  /** Optional one-line subtitle / context */
  subtitle?: string
  /** Destination URL (opens in a new tab) */
  href: string
}

/** Which officer-dashboard CTA a link belongs to. */
export type OfficerResourceCategory = 'resource' | 'training' | 'seed_funds'

/** Human labels for each category (used in the admin panel). */
export const OFFICER_CATEGORY_LABELS: Record<OfficerResourceCategory, string> = {
  resource: 'Review Resources',
  training: 'Training Archive',
  seed_funds: 'Plan Your Chapter Event',
}

/**
 * Per-category presentation + routing metadata for the public, shareable
 * officer-resource pages at /officer-resources/:slug. These pages are reachable
 * without an account, so upcoming officers can open a single link.
 */
export interface OfficerCategoryMeta {
  category: OfficerResourceCategory
  /** URL slug used in /officer-resources/:slug (human-readable, shareable) */
  slug: string
  /** Page + share title */
  title: string
  /** One-line descriptive subtitle shown under the title */
  subtitle: string
  /** Hex accent used for the category icon badge */
  accent: string
}

export const OFFICER_CATEGORY_META: Record<OfficerResourceCategory, OfficerCategoryMeta> = {
  resource: {
    category: 'resource',
    slug: 'resources',
    title: 'Officer Resources',
    subtitle: 'First time here? Start with these.',
    accent: '#1152D4',
  },
  training: {
    category: 'training',
    slug: 'training',
    title: 'Training Archive',
    subtitle: 'Recorded sessions and playbooks.',
    accent: '#D2AD19',
  },
  seed_funds: {
    category: 'seed_funds',
    slug: 'plan-your-event',
    title: 'Plan Your Chapter Event',
    subtitle: 'Seed funds, liquidation, and event planning guides.',
    accent: '#46900D',
  },
}

/** All category metadata, in display order. */
export const OFFICER_CATEGORY_ORDER: OfficerCategoryMeta[] = [
  OFFICER_CATEGORY_META.resource,
  OFFICER_CATEGORY_META.seed_funds,
  OFFICER_CATEGORY_META.training,
]

/** Resolve a URL slug back to its category metadata (null if unknown). */
export function officerCategoryFromSlug(slug: string | undefined): OfficerCategoryMeta | null {
  if (!slug) return null
  return OFFICER_CATEGORY_ORDER.find((m) => m.slug === slug) ?? null
}
