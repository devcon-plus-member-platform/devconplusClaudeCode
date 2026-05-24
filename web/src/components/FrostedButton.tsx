import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '../lib/utils'

interface FrostedButtonProps extends HTMLMotionProps<'button'> {
  className?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export default function FrostedButton({ 
  className, 
  children, 
  size = 'md',
  ...props 
}: FrostedButtonProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-[42px] h-[42px]'
  }

  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      className={cn(
        "rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-white/30 transition-colors shadow-lg pointer-events-auto",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  )
}
