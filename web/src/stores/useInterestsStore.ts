import { create } from 'zustand'
import { apiFetch, publicFetch } from '../lib/api'
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
    try {
      const data = await publicFetch<InterestOption[]>('/api/interests/options')
      set({ options: data, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  saveSelections: async (interests, techStack, communityRoles) => {
    if (!useAuthStore.getState().user) return

    await apiFetch('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({
        interests,
        tech_stack: techStack,
        community_roles: communityRoles,
      }),
    }).catch((err) => {
      // Fall through — still patch in-memory state so the user isn't looped back
      console.error('[useInterestsStore] saveSelections error:', err)
    })

    // Directly patch the auth store user so MemberLayout's interests-null guard
    // sees the updated value.
    useAuthStore.setState((s) => ({
      user: s.user ? { ...s.user, interests, tech_stack: techStack, community_roles: communityRoles } : null,
    }))
  },
}))
