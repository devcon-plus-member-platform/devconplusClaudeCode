// Shared types for officer dashboard resource links.
//
// The link data now lives in the `officer_resources` Supabase table and is
// managed by HQ admins at /admin/officer-resources. Fetching/state is handled
// by useOfficerResourcesStore; this module only holds the shared shapes.

/** A single card rendered in <ResourceLinksSheet />. */
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
