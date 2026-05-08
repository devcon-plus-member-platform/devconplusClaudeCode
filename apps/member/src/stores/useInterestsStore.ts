import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './useAuthStore'

export interface InterestOption {
  id: number
  category: 'interest' | 'tech_stack' | 'community_role'
  label: string
  emoji: string | null
}

interface InterestsState {
  options: InterestOption[]
  isLoading: boolean
  error: string | null
  fetchOptions: () => Promise<void>
  saveSelections: (
    interests: number[],
    techStack: number[],
    communityRoles: number[]
  ) => Promise<void>
}

export const useInterestsStore = create<InterestsState>((set, get) => ({
  options: [],
  isLoading: false,
  error: null,

  fetchOptions: async () => {
    if (get().options.length > 0) return
    set({ isLoading: true, error: null })
    const { data, error } = await supabase
      .from('interest_options')
      .select('id, category, label, emoji')
      .order('id')
    if (error) {
      set({ isLoading: false, error: error.message })
      return
    }
    set({
      options: (data ?? []).map((row) => ({
        ...row,
        category: row.category as 'interest' | 'tech_stack' | 'community_role',
      })),
      isLoading: false,
    })
  },

  saveSelections: async (interests, techStack, communityRoles) => {
    const user = useAuthStore.getState().user
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({
        interests,
        tech_stack: techStack,
        community_roles: communityRoles,
      })
      .eq('id', user.id)

    if (error) {
      console.error('[useInterestsStore] saveSelections error:', error)
      // Fall through — still patch in-memory state so the user isn't looped back
    }

    // Directly patch the auth store user so MemberLayout's interests-null guard
    // sees the updated value. initialize() has an isInitialized re-entry guard
    // and is a no-op once the session is live — calling it won't re-fetch.
    useAuthStore.setState((s) => ({
      user: s.user ? { ...s.user, interests, tech_stack: techStack, community_roles: communityRoles } : null,
    }))
  },
}))
