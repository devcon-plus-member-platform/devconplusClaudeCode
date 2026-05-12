import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeftOutline, MapPointOutline, ShareOutline } from 'solar-icon-set'
import { useJobsStore } from '../../stores/useJobsStore'
import { WORK_TYPE_LABELS } from '../../lib/constants'
import NotFound from '../NotFound'

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { jobs, fetchJobs, isLoading } = useJobsStore()

  useEffect(() => {
    if (jobs.length === 0) void fetchJobs()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const job = jobs.find((j) => j.id === id)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!job) return <NotFound />

  return (
    <motion.div
      className="min-h-screen bg-slate-50"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        <div
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[32px] pt-14"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Back + title */}
          <div className="relative z-10 flex items-center gap-3 px-4 pb-2">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >
              <ArrowLeftOutline className="w-5 h-5" color="white" />
            </button>
            <h1 className="text-white text-[22px] font-semibold font-proxima leading-none tracking-tight flex-1 truncate">
              {job.title}
            </h1>
          </div>
          {/* Company name row — no inline logo here, identity card below handles it */}
          <div className="px-[76px]">
            <p className="text-white/70 text-[13px] font-proxima uppercase tracking-widest font-bold">
              {job.company}
            </p>
          </div>
        </div>
      </header>

      {/* ── Company identity card ── */}
      <div className="px-4 -mt-6 mb-2 flex items-center gap-3">
        {/* Logo: square container so any aspect ratio fits cleanly */}
        {job.logo_url ? (
          <div className="w-14 h-14 rounded-2xl shadow-md border border-slate-100 bg-white overflow-hidden flex items-center justify-center shrink-0">
            <img
              src={job.logo_url}
              alt={job.company}
              className="w-full h-full object-contain p-1.5"
            />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-2xl shadow-md bg-primary flex items-center justify-center shrink-0">
            <span className="text-white font-proxima font-bold text-[22px] uppercase">
              {job.company[0] ?? 'J'}
            </span>
          </div>
        )}
        <div>
          <p className="font-proxima font-bold text-slate-900 text-[15px] leading-tight">{job.company}</p>
          <p className="font-proxima text-slate-400 text-[12px]">{job.title}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          <span className="text-md3-label-md bg-primary/10 text-primary font-semibold px-3 py-1 rounded-full">
            {WORK_TYPE_LABELS[job.work_type] ?? job.work_type}
          </span>
          {job.location && (
            <span className="text-md3-label-md bg-slate-100 text-slate-600 px-3 py-1 rounded-full flex items-center gap-1">
              <MapPointOutline className="w-3 h-3" />
              {job.location}
            </span>
          )}
        </div>

        {/* Description */}
        {job.description && (
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <h2 className="text-md3-body-md font-bold text-slate-900 mb-2">About This Role</h2>
            <p className="text-md3-body-md text-slate-600 leading-relaxed">{job.description}</p>
          </div>
        )}

        {/* Apply CTA */}
        {job.apply_url && (
          <motion.a
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-primary text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
            whileTap={{ scale: 0.95 }}
          >
            <ShareOutline className="w-5 h-5" />
            View Opportunity
          </motion.a>
        )}
      </div>
    </motion.div>
  )
}
