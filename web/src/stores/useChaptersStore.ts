import { create } from 'zustand'
import type { Chapter } from '../types/types'
import { publicFetch } from '../lib/api'

interface ChaptersState {
  chapters: Chapter[]
  isLoading: boolean
  error: string | null
  fetchChapters: () => Promise<void>
  getChapterById: (id: string) => Chapter | undefined
}

export const useChaptersStore = create<ChaptersState>((set, get) => ({
  chapters: [],
  isLoading: false,
  error: null,

  fetchChapters: async () => {
    if (get().chapters.length > 0) return
    set({ isLoading: true, error: null })
    try {
      const data = await publicFetch<Chapter[]>('/api/chapters')
      set({ chapters: data, isLoading: false })
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  getChapterById: (id: string) => get().chapters.find((c) => c.id === id),
}))
