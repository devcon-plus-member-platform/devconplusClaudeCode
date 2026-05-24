import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';

interface SwipeButtonProps {
  onConfirm: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function SwipeButton({ onConfirm, disabled, isLoading }: SwipeButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const x = useMotionValue(0);
  const controls = useAnimation();

  useEffect(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
    
    // Update on resize
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const buttonWidth = 48;
  const padding = 4;
  const maxDrag = Math.max(0, containerWidth - buttonWidth - padding * 2);

  const handleDragEnd = (_event: any, info: any) => {
    if (disabled || isLoading || isSuccess) return;

    if (info.offset.x >= maxDrag * 0.7) {
      // Snap to end and trigger confirm
      controls.start({ x: maxDrag });
      setIsSuccess(true);
      onConfirm();
    } else {
      // Snap back to start
      controls.start({ x: 0 });
    }
  };

  // Progress fills the track behind the button
  const progressWidth = useTransform(x, [0, maxDrag], [buttonWidth + padding * 2, containerWidth]);

  return (
    <div 
      ref={containerRef} 
      className="h-[56px] relative w-full bg-[#eef4ff] rounded-[36px] overflow-hidden flex items-center justify-center"
    >
      <p className="font-proxima font-semibold text-primary text-[14px] z-10 select-none pointer-events-none transition-opacity duration-300">
        {isLoading ? 'Processing...' : isSuccess ? 'Redeemed!' : 'Swipe to Redeem'}
      </p>
      
      {/* Background fill */}
      <motion.div 
        className="absolute left-0 top-0 bottom-0 bg-primary/10 rounded-[36px] z-0"
        style={{ width: progressWidth }}
      />

      <motion.div
        drag={disabled || isLoading || isSuccess ? false : "x"}
        dragConstraints={{ left: 0, right: maxDrag }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x }}
        whileTap={!disabled && !isLoading && !isSuccess ? { scale: 0.95 } : {}}
        className={`absolute left-[4px] top-[4px] size-[48px] bg-primary rounded-full flex items-center justify-center z-20 ${disabled || isLoading || isSuccess ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 7L16 12L11 17M6 7L11 12L6 17" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.div>
    </div>
  );
}
