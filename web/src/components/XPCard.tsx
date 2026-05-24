import { useNavigate } from 'react-router-dom'
import { MedalStarCircleBoldDuotone, BoltBroken } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { usePointsStore } from '../stores/usePointsStore'

export default function XPCard() {
  const navigate = useNavigate()
  const { spendablePoints, lifetimePoints, tierProgress } = usePointsStore()

  return (
    <div className="bg-white rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] border border-[rgba(156,163,175,0.3)] p-[21px] flex flex-col gap-5">

      {/* Points section */}
      <div className="flex flex-col gap-2">
        {/* Medal + XP number */}
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 relative">
            <MedalStarCircleBoldDuotone className="w-full h-full text-[#EAB308] shrink-0" />
          </div>
          <p className="font-proxima leading-none text-[#464646] tracking-[-1.226px]">
            <span className="font-extrabold text-[40.867px]">{spendablePoints.toLocaleString()}</span>
            {' '}
            <span className="font-semibold text-[24px]">XP</span>
          </p>
        </div>

        {/* Lifetime + progress */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <BoltBroken className="w-4 h-4 text-[#6b7280] shrink-0" />
            <span className="font-proxima text-[14px] text-[#6b7280]">
              {lifetimePoints.toLocaleString()} lifetime points
            </span>
          </div>

          {/* Progress bar — 8px track matching Figma */}
          <div className="relative w-full h-2 bg-black/[0.16] rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ backgroundColor: '#eab308' }}
              initial={{ width: 0 }}
              animate={{ width: `${tierProgress}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              {/* Shimmer effect */}
              <motion.div
                className="absolute inset-0 w-full h-full"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                }}
                animate={{
                  x: ['-100%', '100%'],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            </motion.div>
          </div>
        </div>
      </div>

      {/* CTA — Proxima Nova Semibold 16px, 48px tall pill */}
      <motion.button
        onClick={() => navigate('/events')}
        className="font-proxima font-semibold w-full bg-primary text-white text-[16px] h-12 rounded-[80px]"
        whileTap={{ scale: 0.95 }}
      >
        Attend Our Events
      </motion.button>
    </div>
  )
}
