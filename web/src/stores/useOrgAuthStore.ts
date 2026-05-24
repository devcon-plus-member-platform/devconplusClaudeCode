// Organizer auth delegates to useAuthStore for real Supabase auth.
// An organizer is a Profile with role = 'chapter_officer' | 'hq_admin'.
// This store is kept for backwards-compatibility with organizer pages;
// full consolidation is a follow-up cleanup task.

import { create } from 'zustand'
import { useAuthStore } from './useAuthStore'

export interface OrganizerUser {
  id: string
  full_name: string
  email: string
  chapter: string
  role: 'chapter_officer' | 'hq_admin'
  initials: string
  avatar_url: string | null
}

interface OrgAuthState {
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (patch: Partial<Pick<OrganizerUser, 'full_name' | 'avatar_url'>>) => Promise<void>
}

export const useOrgAuthStore = create<OrgAuthState>(() => ({
  isLoading: false,

  // Delegates to useAuthStore — shares the single Supabase session
  login: async (email, password) => {
    await useAuthStore.getState().signIn(email, password)
  },

  logout: async () => {
    await useAuthStore.getState().signOut()
  },

  updateProfile: async (patch) => {
    await useAuthStore.getState().updateProfile(patch)
  },
}))

// Derived selector: reads organizer user shape from the shared auth profile.
// Use this in organizer pages instead of useOrgAuthStore().user.
export function useOrganizerUser(): OrganizerUser | null {
  const { user, initials, chapterName } = useAuthStore()
  if (!user) return null
  if (!['chapter_officer', 'hq_admin', 'super_admin'].includes(user.role)) return null
  return {
    id:         user.id,
    full_name:  user.full_name,
    email:      user.email,
    chapter:    chapterName ?? '',
    role:       user.role as OrganizerUser['role'],
    initials,
    avatar_url: user.avatar_url,
  }
}
