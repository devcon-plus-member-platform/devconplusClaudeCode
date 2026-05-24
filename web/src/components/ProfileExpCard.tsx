import { motion } from 'framer-motion'
import { BoltOutline, MedalStarCircleBoldDuotone } from 'solar-icon-set'
import { usePointsStore } from '../stores/usePointsStore'

export default function ProfileExpCard() {
  const { spendablePoints, lifetimePoints, tierProgress } = usePointsStore()

  return (
    <div className="bg-white rounded-[24px] border border-slate-400/30 p-[24px] flex flex-col gap-5 shadow-card">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="shrink-0 size-[48px] flex items-center justify-center">
            <MedalStarCircleBoldDuotone color="#F8C630" size={48} />
          </div>
          <p className="font-proxima leading-none text-[#464646] tracking-[-1.226px]">
            <span className="font-extrabold text-[40.867px]">{spendablePoints.toLocaleString()}</span>
            {' '}
            <span className="font-semibold text-[24px]">XP</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="shrink-0 size-[16px] flex items-center justify-center">
              <BoltOutline color="#94A3B8" size={14} />
            </div>
            <span className="font-proxima text-[14px] text-[#6b7280]">
              {lifetimePoints.toLocaleString()} lifetime points
            </span>
          </div>

          <div className="relative w-full h-2 bg-black/[0.16] rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ backgroundColor: '#eab308' }}
              initial={{ width: 0 }}
              animate={{ width: `${tierProgress}%` }}
              transition={{ 
                type: 'spring',
                stiffness: 50,
                damping: 20,
                restDelta: 0.001
              }}
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
    </div>
  )
}
