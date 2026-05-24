import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '../lib/utils'

interface FrostedActionButtonProps extends HTMLMotionProps<'button'> {
  className?: string
  children: React.ReactNode
  icon?: React.ReactNode
}

export default function FrostedActionButton({ 
  className, 
  children, 
  icon,
  ...props 
}: FrostedActionButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      className={cn(
        "flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-md border border-white/30 text-white text-md3-body-md font-bold rounded-xl active:bg-white/30 transition-colors shrink-0 shadow-lg pointer-events-auto",
        className
      )}
      {...props}
    >
      {icon && (
        <div className="bg-white/20 backdrop-blur-sm border border-white/20 rounded-full p-1 flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <span>{children}</span>
    </motion.button>
  )
}
