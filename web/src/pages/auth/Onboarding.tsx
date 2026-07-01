import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import logoVertical from '../../assets/logos/logo-vertical.svg'
import { markOnboardingSeen } from '../../lib/onboarding'

const slides = [
  {
    image:    '/photos/devcon-iloilo.png',
    title:    "Your Portal to\nThe Philippines’ Largest\nVolunteer Tech Community!",
    subtitle: "Sync, Support, Succeed. Get instant access to the Philippines’ largest tech volunteer community!",
  },
  {
    image:    '/photos/devcon-mindanao.png',
    title:    '11 Chapters. 16 Years.\n60,000+ Geeks for Good.',
    subtitle: 'Join chapters across the country and make an impact locally and nationally.',
  },
  {
    image:    '/photos/devcon-summit-group.jpg',
    title:    'Volunteer. Earn Points.\nUnlock Rewards.',
    subtitle: 'Participate in events, contribute to projects, and earn points for exclusive rewards.',
  },
  {
    image:    '/photos/DEVCON17.svg',
    title:    'Access Global Opportunities.\nLevel Up Your Career.',
    subtitle: 'Connect with industry leaders and discover exclusive opportunities for your career.',
  },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [current, setCurrent] = useState(0)
  const isLast = current === slides.length - 1

  const goTo = (i: number) => setCurrent(Math.max(0, Math.min(slides.length - 1, i)))

  // Mark onboarding as seen the moment the visitor leaves via any CTA, so the
  // splash screen won't route them back here on the next launch.
  const leaveOnboarding = (to: string) => {
    markOnboardingSeen()
    navigate(to)
  }

  // Measure the viewport width so the draggable strip can translate/snap in px
  // (keeps drag and the snap spring in the same unit).
  const containerRef = useRef<HTMLDivElement>(null)
  const [slideW, setSlideW] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSlideW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-hidden relative bg-navy select-none"
    >
      {/* ── Draggable photo strip ────────────────────────────── */}
      <motion.div
        className="flex h-full cursor-grab active:cursor-grabbing"
        drag="x"
        dragConstraints={{ left: -(slides.length - 1) * slideW, right: 0 }}
        dragElastic={0.18}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (slideW === 0) return
          // Snap to the nearest slide, biased by fling velocity.
          const dragged  = -info.offset.x / slideW
          const velBoost = -info.velocity.x / (slideW * 4)
          const target   = Math.round(current + dragged + velBoost)
          setCurrent(Math.max(0, Math.min(slides.length - 1, target)))
        }}
        animate={{ x: -current * slideW }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="relative h-full w-full shrink-0 overflow-hidden"
          >
            {/* High-res background photo */}
            <img
              src={slide.image}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
            {/* Dark gradient overlay matching Figma */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#092B6E]/20 via-[#092B6E]/50 to-[#1152D4]/90" />
          </div>
        ))}
      </motion.div>

      {/* ── Centered Logo at the top ─────────────────────────── */}
      <div className="absolute top-[8vh] left-0 right-0 z-20 flex justify-center pointer-events-none">
        <img src={logoVertical} alt="DEVCON+" className="h-[48px] w-auto" />
      </div>

      {/* ── Fixed bottom panel content ───────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-[6vh] flex flex-col items-center text-center">
        {/* Slide caption */}
        <div key={current} className="mb-10 animate-[fadeIn_0.3s_ease-out] max-w-[320px]">
          <h2 className="text-white text-[26px] font-bold leading-tight whitespace-pre-wrap mb-4 tracking-tight">
            {slides[current].title}
          </h2>
          <p className="text-white/90 text-[15px] font-normal leading-[1.4]">
            {slides[current].subtitle}
          </p>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2.5 mb-8">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? 'w-8 bg-white' : 'w-1.5 bg-white/30'
              }`}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div className="w-full max-w-[360px] flex flex-col gap-4">
          {isLast ? (
            <>
              <button
                onClick={() => leaveOnboarding('/sign-up')}
                className="w-full h-[54px] bg-white/10 backdrop-blur-xl border border-white/20 text-white font-bold rounded-2xl text-[17px] flex items-center justify-center shadow-lg transition-all active:scale-[0.98] hover:bg-white/20"
              >
                Get Started
              </button>
              <button
                onClick={() => leaveOnboarding('/sign-in')}
                className="text-white/80 text-[13px] font-medium transition-opacity hover:opacity-100 py-1"
              >
                I have an account
              </button>
              <button
                onClick={() => leaveOnboarding('/events')}
                className="text-white/50 text-[12px] font-medium transition-opacity hover:opacity-100 py-1"
              >
                Browse Events
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCurrent((c) => c + 1)}
                className="w-full h-[54px] bg-white/10 backdrop-blur-xl border border-white/20 text-white font-bold rounded-2xl text-[17px] flex items-center justify-center shadow-lg transition-all active:scale-[0.98] hover:bg-white/20"
              >
                Next
              </button>
              <button
                onClick={() => leaveOnboarding('/sign-up')}
                className="text-white/70 text-[13px] font-medium transition-opacity hover:opacity-100 py-1"
              >
                Skip
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}