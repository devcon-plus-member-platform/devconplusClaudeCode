import { useEffect, useRef, useState, useMemo, useDeferredValue } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CaseOutline, AltArrowDownOutline, MapPointOutline, ShareOutline, MagniferOutline } from 'solar-icon-set'
import { useJobsStore } from '../../stores/useJobsStore'
import { SkeletonJobCard } from '../../components/Skeleton'
import { WORK_TYPE_LABELS } from '../../lib/constants'
import { staggerContainer, cardItem } from '../../lib/animation'
import { fuzzySearchFilter } from '../../lib/utils'
import { logoStatusCache } from '../../lib/logoCache'
import SearchBar from '../../components/SearchBar'
import SearchEmptyState from '../../components/SearchEmptyState'

function CompanyLogo({ logoUrl, company }: { logoUrl: string | null; company: string }) {
  const [imgStatus, setImgStatus] = useState<'ok' | 'error' | 'pending'>(
    () => (logoUrl ? (logoStatusCache.get(logoUrl) ?? 'pending') : 'error')
  )
  if (logoUrl && imgStatus !== 'error') {
    return (
      <div className="w-12 h-12 shrink-0">
        <img src={logoUrl} alt={company} className="w-full h-full object-contain rounded-xl"
          onLoad={() => { logoStatusCache.set(logoUrl, 'ok'); setImgStatus('ok') }}
          onError={() => { logoStatusCache.set(logoUrl, 'error'); setImgStatus('error') }}
        />
      </div>
    )
  }
  return (
    <div className="w-12 h-12 bg-primary rounded-full shrink-0 flex items-center justify-center">
      <span className="text-white font-proxima font-bold text-md3-title-lg uppercase">
        {company[0] ?? 'J'}
      </span>
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsList() {
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')

  const { jobs, isLoading, error, fetchJobs } = useJobsStore()
  const [expandedId, setExpandedId] = useState<string | null>(idParam)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    setExpandedId(idParam)
  }, [idParam])

  const [isSearchVisible, setIsSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery.trim())

  useEffect(() => {
    void fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && jobs.length === 0) {
        void fetchJobs()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => { document.removeEventListener('visibilitychange', handleVisibility) }
  }, [jobs.length, fetchJobs])

  // Deep-link scroll
  useEffect(() => {
    if (idParam && cardRefs.current[idParam]) {
      setTimeout(() => {
        cardRefs.current[idParam]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
  }, [idParam, isLoading])

  const filteredJobs = useMemo(() =>
    jobs.filter(job =>
      fuzzySearchFilter(deferredQuery, job, ['title', 'description', 'company'])
    ), [jobs, deferredQuery]
  )

  const toggleSearch = () => {
    setIsSearchVisible(!isSearchVisible)
    if (isSearchVisible) setSearchQuery('')
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Glassmorphism Background ── */}
        <div className="absolute inset-0 backdrop-blur-md bg-slate-50/80 pointer-events-auto -z-10" />

        {/* ── Blue Background Container ── */}
        <div
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[24px]"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Search icon */}
          <div className="relative z-10 flex items-center justify-between px-4 pt-6">
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              AI &amp; Dev Jobs
            </h1>

            <div className="flex items-center gap-[8px]">
              <button
                onClick={toggleSearch}
                className="bg-white/20 backdrop-blur-md size-[42px] flex items-center justify-center rounded-full border border-white/30 transition-colors active:bg-white/30 shadow-lg"
                aria-label="Search"
              >
                <MagniferOutline className="w-[18px] h-[18px]" color="white" />
              </button>
            </div>
          </div>
        </div>

        <SearchBar
          isVisible={isSearchVisible}
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
          placeholder="Search jobs or companies..."
        />
      </header>

      {/* ── Content ── */}
      <div className="flex-1">
        {isLoading && (
          <div className="space-y-3 px-4 pt-5">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonJobCard key={i} />)}
          </div>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-md3-body-md text-red mb-4">{error}</p>
            <button onClick={() => void fetchJobs()} className="text-md3-body-md text-primary font-semibold">Try again</button>
          </div>
        )}

        {!isLoading && !error && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <CaseOutline color="rgba(var(--color-primary), 0.5)" size={32} />
            </div>
            <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">No listings yet</h2>
            <p className="text-md3-body-md text-slate-500">Check back soon for new opportunities.</p>
          </div>
        )}

        {!isLoading && !error && jobs.length > 0 && filteredJobs.length === 0 && deferredQuery && (
          <SearchEmptyState headline="No results found" body="Try adjusting your search query." />
        )}

        {!isLoading && !error && filteredJobs.length > 0 && (
          <motion.div
            key={`jobs-grid-${deferredQuery}`}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-3 px-4 pt-5 pb-24"
          >
            {filteredJobs.map(job => {
              const isExpanded = expandedId === job.id
              return (
                <motion.div
                  key={job.id}
                  variants={cardItem}
                  ref={(el) => { cardRefs.current[job.id] = el }}
                  className="bg-white border border-[rgba(156,163,175,0.3)] rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] overflow-hidden"
                >
                  <motion.button
                    onClick={() => setExpandedId(prev => prev === job.id ? null : job.id)}
                    className="w-full px-[18px] py-[12px] text-left"
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        {/* Logo */}
                        <CompanyLogo logoUrl={job.logo_url} company={job.company} />

                        <div className="flex flex-col gap-1">
                          <div className="flex flex-col gap-[2px]">
                            {/* Title */}
                            <p className="font-proxima font-bold text-[16px] text-black leading-snug">
                              {job.title}
                            </p>

                            {/* Company */}
                            <p className="font-proxima text-[#6b7280] text-[12px]">
                              Posted by {job.company}
                            </p>
                          </div>

                          {/* Badges & Location */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              {job.work_type && (
                                <div className="bg-[rgba(102,102,102,0.2)] px-[12px] py-[6px] rounded-[100px] flex items-center justify-center shrink-0">
                                  <span className="text-[#6b7280] text-[9px] font-bold tracking-[0.9px] uppercase leading-none">
                                    {WORK_TYPE_LABELS[job.work_type] ?? job.work_type}
                                  </span>
                                </div>
                              )}

                              {job.is_promoted && (
                                <div className="bg-[rgba(255,111,11,0.2)] px-[12px] py-[6px] rounded-[100px] flex items-center justify-center shrink-0">
                                  <span className="text-[#ff6f0b] text-[9px] font-bold tracking-[0.9px] uppercase leading-none">
                                    PROMOTED
                                  </span>
                                </div>
                              )}
                            </div>

                            {job.location && (
                              <div className="flex items-center gap-1 py-[6px]">
                                <MapPointOutline color="#6b7280" size={10} />
                                <span className="font-proxima text-[#6b7280] text-[12px]">{job.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="shrink-0 mt-2"
                      >
                        <AltArrowDownOutline color="#94A3B8" size={16} />
                      </motion.div>
                    </div>
                  </motion.button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="overflow-hidden"
                      >
                        <div className="px-[18px] pb-4 pt-3 border-t border-slate-100 space-y-4">
                          {job.description
                            ? <p className="text-md3-body-md text-slate-600 leading-relaxed whitespace-pre-line">{job.description}</p>
                            : <p className="text-md3-body-md text-slate-400 italic">No description provided.</p>
                          }
                          {job.apply_url && (job.apply_url.startsWith('https://') || job.apply_url.startsWith('http://')) && (
                            <a href={job.apply_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 w-full bg-primary text-white font-bold text-md3-body-md py-3 rounded-full shadow-sm">
                              Apply Now <ShareOutline color="white" size={16} />
                            </a>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </div>
  )
}
