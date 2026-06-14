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
  /** Optional subgroup heading within the category (e.g. "Funding Requests"). */
  group?: string
}

/** A subgroup of links within a category. `label` is null for ungrouped links. */
export interface OfficerLinkGroup {
  label: string | null
  items: OfficerLink[]
}

/**
 * Bucket a category's links into subgroups by `group`, preserving the order in
 * which each group first appears (i.e. sort_order). Links with no group are
 * collected into a single leading, label-less group so they never disappear.
 */
export function groupOfficerLinks(links: OfficerLink[]): OfficerLinkGroup[] {
  const order: string[] = []
  const byLabel = new Map<string, OfficerLink[]>()
  const ungrouped: OfficerLink[] = []

  for (const link of links) {
    const label = link.group?.trim()
    if (!label) {
      ungrouped.push(link)
      continue
    }
    if (!byLabel.has(label)) {
      byLabel.set(label, [])
      order.push(label)
    }
    byLabel.get(label)!.push(link)
  }

  const labelled = order.map((label) => ({ label, items: byLabel.get(label)! }))
  return ungrouped.length ? [{ label: null, items: ungrouped }, ...labelled] : labelled
}

/** Which officer-dashboard CTA a link belongs to. */
export type OfficerResourceCategory = 'resource' | 'training' | 'seed_funds'

/** Human labels for each category (used in the admin panel). */
export const OFFICER_CATEGORY_LABELS: Record<OfficerResourceCategory, string> = {
  resource: 'Review Resources',
  training: 'Training and Policy',
  seed_funds: 'Seed Fund Request',
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
    slug: 'review-resources',
    title: 'Officer Resources',
    subtitle: 'First time here? Start with these.',
    accent: '#1152D4',
  },
  training: {
    category: 'training',
    slug: 'training-and-policy',
    title: 'Training and Policy',
    subtitle: 'Recorded sessions, playbooks, and chapter policies.',
    accent: '#F8C630',
  },
  seed_funds: {
    category: 'seed_funds',
    slug: 'seed-fund-request',
    title: 'Seed Fund Request',
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
