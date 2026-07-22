import { create } from 'zustand'
import type { FeaturedStory } from '@devcon-plus/supabase'
import { publicFetch } from '../lib/api'

interface FeaturedStoriesState {
  stories: FeaturedStory[]
  isLoading: boolean
  error: string | null
  fetchStories: () => Promise<void>
}

export const useFeaturedStoriesStore = create<FeaturedStoriesState>((set) => ({
  stories: [],
  isLoading: false,
  error: null,

  fetchStories: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await publicFetch<FeaturedStory[]>('/api/featured-stories')
      set({ stories: data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },
}))
