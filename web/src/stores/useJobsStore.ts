import { create } from 'zustand'
import type { Job } from '@devcon-plus/supabase'
import { apiFetch, publicFetch } from '../lib/api'

interface JobsState {
  jobs: Job[]
  allJobs: Job[]          // admin view — includes inactive
  savedIds: string[]
  isLoading: boolean
  error: string | null

  fetchJobs: () => Promise<void>
  fetchAllJobs: () => Promise<void>
  createJob: (data: Omit<Job, 'id' | 'posted_at'>) => Promise<void>
  updateJob: (id: string, data: Partial<Omit<Job, 'id' | 'posted_at'>>) => Promise<void>
  deleteJob: (id: string) => Promise<void>
  toggleSave: (id: string) => void
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: [],
  allJobs: [],
  savedIds: [],
  isLoading: false,
  error: null,

  fetchJobs: async () => {
    set((s) => ({ isLoading: s.jobs.length === 0, error: null }))
    try {
      const data = await publicFetch<Job[]>('/api/jobs')
      set({ jobs: data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchAllJobs: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiFetch<Job[]>('/api/jobs/all')
      set({ allJobs: data })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  createJob: async (data) => {
    const newJob = await apiFetch<Job>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    set((s) => ({ allJobs: [newJob, ...s.allJobs] }))
    if (newJob.is_active) set((s) => ({ jobs: [...s.jobs, newJob] }))
  },

  updateJob: async (id, data) => {
    const updated = await apiFetch<Job>(`/api/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    set((s) => ({
      allJobs: s.allJobs.map((j) => (j.id === id ? updated : j)),
      jobs: updated.is_active
        ? s.jobs.some((j) => j.id === id)
          ? s.jobs.map((j) => (j.id === id ? updated : j))
          : [...s.jobs, updated]
        : s.jobs.filter((j) => j.id !== id),
    }))
  },

  deleteJob: async (id) => {
    await apiFetch<void>(`/api/jobs/${id}`, { method: 'DELETE' })
    set((s) => ({
      allJobs: s.allJobs.filter((j) => j.id !== id),
      jobs: s.jobs.filter((j) => j.id !== id),
    }))
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
