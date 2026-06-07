import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { OfficerLink } from '../lib/officerResources'

// Read-only store for the officer dashboard. Pulls the active officer_resources
// rows and groups them by category for the "Review Resources" / "View Training
// Archive" sliders and the single "Request Seed Funds" link.

interface OfficerResourcesState {
  resources: OfficerLink[]      // category = 'resource'
  trainings: OfficerLink[]      // category = 'training'
  seedFundsUrl: string          // first active 'seed_funds' href ('' if none)
  loaded: boolean
  isLoading: boolean
  fetch: () => Promise<void>
}

export const useOfficerResourcesStore = create<OfficerResourcesState>((set, get) => ({
  resources: [],
  trainings: [],
  seedFundsUrl: '',
  loaded: false,
  isLoading: false,

  fetch: async () => {
    // Only show a loading state on the very first fetch (avoids flash on recovery refetch).
    set({ isLoading: !get().loaded })
    const { data, error } = await supabase
      .from('officer_resources')
      .select('category, title, subtitle, href, sort_order')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })

    if (error) {
      set({ isLoading: false })
      return
    }

    const rows = data ?? []
    const toLink = (r: (typeof rows)[number]): OfficerLink => ({
      title: r.title,
      subtitle: r.subtitle ?? undefined,
      href: r.href,
    })

    set({
      resources: rows.filter((r) => r.category === 'resource').map(toLink),
      trainings: rows.filter((r) => r.category === 'training').map(toLink),
      seedFundsUrl: rows.find((r) => r.category === 'seed_funds')?.href ?? '',
      loaded: true,
      isLoading: false,
    })
  },
}))
