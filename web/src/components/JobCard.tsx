import { memo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPointOutline } from 'solar-icon-set'
import type { Job } from '@devcon-plus/supabase'
import { WORK_TYPE_LABELS } from '../lib/constants'

function CompanyAvatar({ logoUrl, company }: { logoUrl: string | null; company: string }) {
  const [imgError, setImgError] = useState(false)

  if (logoUrl && !imgError) {
    return (
      <div className="w-12 h-12 shrink-0 overflow-hidden rounded-xl bg-white">
        <img
          src={logoUrl}
          alt={company}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
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

function JobCard({ job }: { job: Job }) {
  const navigate = useNavigate()

  return (
    <motion.button
      onClick={() => navigate(`/jobs?id=${job.id}`)}
      className="w-full bg-white border border-[rgba(156,163,175,0.3)] rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] text-left overflow-hidden"
      whileTap={{ scale: 0.98 }}
    >
      <div className="px-[18px] py-[12px] flex flex-col gap-2">
        <CompanyAvatar logoUrl={job.logo_url} company={job.company} />

        <div className="flex flex-col gap-1">
          <div className="flex flex-col gap-[2px]">
            <p className="font-proxima font-bold text-[16px] text-black leading-snug">
              {job.title}
            </p>
            <p className="font-proxima text-[#6b7280] text-[12px]">
              Posted by {job.company}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {job.work_type && (
                <div className="backdrop-blur-[16px] bg-[rgba(102,102,102,0.2)] px-[12px] py-[6px] rounded-[100px] inline-flex items-center justify-center shrink-0">
                  <span className="font-proxima font-semibold text-[#6b7280] text-[9px] tracking-[0.9px] uppercase leading-[13.5px]">
                    {WORK_TYPE_LABELS[job.work_type] ?? job.work_type}
                  </span>
                </div>
              )}
              {job.is_promoted && (
                <div className="backdrop-blur-[16px] bg-[rgba(255,225,205,0.9)] px-[12px] py-[6px] rounded-[100px] inline-flex items-center justify-center shrink-0">
                  <span className="font-proxima font-semibold text-[#ff6f0b] text-[9px] tracking-[0.9px] uppercase leading-[13.5px]">
                    Promoted
                  </span>
                </div>
              )}
            </div>
            {job.location && (
              <div className="flex items-center gap-1 py-[6px]">
                <MapPointOutline className="w-[10px] h-[10px]" color="#6b7280" />
                <span className="font-proxima text-[#6b7280] text-[12px]">{job.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  )
}

export default memo(JobCard)
