import { create } from 'zustand'
import type { Job } from '@devcon-plus/supabase'
import { supabase } from '../lib/supabase'
import { logoStatusCache } from '../lib/logoCache'

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
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('is_active', true)
        .order('posted_at', { ascending: true })
        .limit(50)
      if (error) throw error
      const jobs = (data ?? []) as Job[]
      set({ jobs })
      for (const job of jobs) {
        if (job.logo_url && !logoStatusCache.has(job.logo_url)) {
          const img = new Image()
          const url = job.logo_url
          img.onload  = () => logoStatusCache.set(url, 'ok')
          img.onerror = () => logoStatusCache.set(url, 'error')
          img.src = url
        }
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchAllJobs: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('posted_at', { ascending: false })
        .limit(200)
      if (error) throw error
      set({ allJobs: (data ?? []) as Job[] })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ isLoading: false })
    }
  },

  createJob: async (data) => {
    const { data: row, error } = await supabase
      .from('jobs')
      .insert([data])
      .select()
      .single()
    if (error) throw error
    const newJob = row as Job
    set((s) => ({ allJobs: [newJob, ...s.allJobs] }))
    if (newJob.is_active) set((s) => ({ jobs: [...s.jobs, newJob] }))
  },

  updateJob: async (id, data) => {
    const { data: row, error } = await supabase
      .from('jobs')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const updated = row as Job
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
    const { error } = await supabase.from('jobs').delete().eq('id', id)
    if (error) throw error
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
