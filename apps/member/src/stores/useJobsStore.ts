import { create } from 'zustand'
import type { Job } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'

interface JobsState {
  jobs: Job[]
  savedIds: string[]
  isLoading: boolean
  error: string | null

  fetchJobs: () => Promise<void>
  toggleSave: (id: string) => void
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: [],
  savedIds: [],
  isLoading: false,
  error: null,

  fetchJobs: async () => {
    set((s) => ({ isLoading: s.jobs.length === 0, error: null }))
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('is_active', true)
        .order('posted_at', { ascending: true })
      if (error) throw error
      set({ jobs: (data ?? []) as Job[] })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  toggleSave: (id) => {
    const { savedIds } = get()
    set({
      savedIds: savedIds.includes(id)
        ? savedIds.filter((s) => s !== id)
        : [...savedIds, id],
    })
  },
}))
