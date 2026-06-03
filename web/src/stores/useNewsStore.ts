import { create } from 'zustand'
import type { NewsPost } from '@devcon-plus/supabase'
import { publicFetch } from '../lib/api'

interface NewsState {
  posts: NewsPost[]
  isLoading: boolean
  error: string | null

  fetchNews: () => Promise<void>
}

export const useNewsStore = create<NewsState>((set) => ({
  posts: [],
  isLoading: false,
  error: null,

  fetchNews: async () => {
    set((s) => ({ isLoading: s.posts.length === 0, error: null }))
    try {
      const data = await publicFetch<NewsPost[]>('/api/news')
      set({ posts: data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },
}))
