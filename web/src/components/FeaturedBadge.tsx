import { motion } from 'framer-motion'
import { StarOutline } from 'solar-icon-set'

/**
 * FeaturedBadge — a small "Community Featured" pill with an animated gold
 * gradient and a sweeping sheen, used to highlight community featured
 * (external) events. Shared by the home rotating banner and the events list cards.
 */
export default function FeaturedBadge() {
  return (
    <span className="relative inline-flex items-center overflow-hidden rounded-full shadow-sm">
      {/* Animated silver gradient base — slow, gentle drift */}
      <motion.span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(110deg, #8A9099 0%, #C2C8D0 30%, #F4F6F9 50%, #C2C8D0 70%, #8A9099 100%)',
          backgroundSize: '200% 100%',
        }}
        animate={{ backgroundPositionX: ['0%', '200%'] }}
        transition={{ duration: 9, ease: 'linear', repeat: Infinity }}
      />

      {/* Sweeping sheen — slow, infrequent glint */}
      <motion.span
        aria-hidden
        className="absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent"
        initial={{ x: '-200%' }}
        animate={{ x: '400%' }}
        transition={{ duration: 3.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 4.5 }}
      />

      {/* Content */}
      <span className="relative z-10 inline-flex items-center gap-1 px-2.5 py-1 font-proxima font-bold text-[9px] tracking-[0.7px] uppercase leading-[13.5px] text-[#3C434D] whitespace-nowrap">
        <StarOutline className="w-[7px] h-[7px]" color="#3C434D" />
        Community Featured
      </span>
    </span>
  )
}
