import { useNavigate } from 'react-router-dom'
import { MedalStarCircleBoldDuotone, BoltBroken } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { usePointsStore } from '../stores/usePointsStore'

export default function XPCard() {
  const navigate = useNavigate()
  const { spendablePoints, tierProgress } = usePointsStore()

  return (
    <div className="bg-white rounded-2xl shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] border border-slate-200 p-[21px] flex flex-col gap-5">

      {/* Points section */}
      <div className="flex flex-col gap-2">
        {/* Medal + XP number */}
        <div className="flex items-center gap-2">
          <div className="w-12 h-12 relative">
            <MedalStarCircleBoldDuotone color="#F8C630" className="w-full h-full shrink-0" />
          </div>
          <p className="font-proxima leading-none text-slate-900 tracking-[-1.226px]">
            <span className="font-extrabold text-[40.867px]">{spendablePoints.toLocaleString()}</span>
            {' '}
            <span className="font-semibold text-[24px]">XP</span>
          </p>
        </div>

        {/* Lifetime + progress */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <BoltBroken color="#64748B" className="w-4 h-4 shrink-0" />
            <span className="font-proxima text-[14px] text-slate-500">
              {spendablePoints.toLocaleString()} spendable points
            </span>
          </div>

          {/* Progress bar — 8px track matching Figma */}
          <div className="relative w-full h-2 bg-black/[0.16] rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ backgroundColor: '#F8C630' }}
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
        className="font-proxima font-semibold w-full bg-primary text-white text-[16px] h-12 rounded-full"
        whileTap={{ scale: 0.95 }}
      >
        Join Our Events
      </motion.button>
    </div>
  )
}
