import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeftOutline } from 'solar-icon-set'
import { useAuthStore } from '../../stores/useAuthStore'
import { useInterestsStore } from '../../stores/useInterestsStore'
import { fadeUp } from '../../lib/animation'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

type Step = 0 | 1 | 2

const STEP_TITLES: Record<Step, string> = {
  0: 'What fuels your passion?',
  1: 'Showcase your stack',
  2: 'Make an impact',
}
const STEP_SUBS: Record<Step, string> = {
  0: 'Select the tech areas that keep you inspired and ready to build.',
  1: 'Which languages and frameworks do you use to bring ideas to life?',
  2: 'Tell us how you like to contribute and grow within the community.',
}
const STEP_CATEGORIES: Record<Step, 'interest' | 'tech_stack' | 'community_role'> = {
  0: 'interest',
  1: 'tech_stack',
  2: 'community_role',
}

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

function isSafeReturnTo(url: string | undefined | null): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
}

export default function InterestQuiz() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const fromProfile = searchParams.get('from') === 'profile'
  const returnTo =
    (location.state as { returnTo?: string } | null)?.returnTo ??
    sessionStorage.getItem('devcon_returnTo')

  const user = useAuthStore((s) => s.user)
  const { options, isLoading, fetchOptions, saveSelections } = useInterestsStore()

  const [step, setStep] = useState<Step>(0)
  // Three separate selection arrays: [interests, techStack, communityRoles]
  const [selections, setSelections] = useState<[number[], number[], number[]]>(
    [[], [], []]
  )
  const [isSaving, setIsSaving] = useState(false)
  const didPrefillRef = useRef(false)

  // Pre-fill from existing profile on re-entry — runs once only
  useEffect(() => {
    if (user && !didPrefillRef.current) {
      setSelections([
        user.interests ?? [],
        user.tech_stack ?? [],
        user.community_roles ?? [],
      ])
      didPrefillRef.current = true
    }
  }, [user])

  useEffect(() => {
    void fetchOptions()
  }, [fetchOptions])

  const stepOptions = useMemo(
    () => options.filter((o) => o.category === STEP_CATEGORIES[step]),
    [options, step]
  )

  const currentSelection = selections[step]

  function togglePill(id: number) {
    setSelections((prev) => {
      const next = [...prev] as [number[], number[], number[]]
      const s = new Set(next[step])
      if (s.has(id)) s.delete(id)
      else s.add(id)
      next[step] = Array.from(s)
      return next
    })
  }

  async function commitAndExit(toSave: [number[], number[], number[]]) {
    setIsSaving(true)
    try {
      await saveSelections(toSave[0], toSave[1], toSave[2])
      let dest = fromProfile ? '/profile' : '/home'
      if (!fromProfile && isSafeReturnTo(returnTo)) {
        dest = returnTo
        sessionStorage.removeItem('devcon_returnTo')
      }
      navigate(dest, { replace: true })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleNext() {
    if (step < 2) {
      setStep((s) => (s + 1) as Step)
    } else {
      await commitAndExit(selections)
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep((s) => (s - 1) as Step)
    } else if (fromProfile) {
      navigate('/profile')
    }
  }

  async function handleSkipStep() {
    if (step < 2) {
      // Clear this step's selection in local state and advance — no DB write yet
      setSelections((prev) => {
        const next = [...prev] as [number[], number[], number[]]
        next[step] = []
        return next
      })
      setStep((s) => (s + 1) as Step)
    } else {
      // Last step — save with empty community_roles
      await commitAndExit([selections[0], selections[1], []])
    }
  }

  async function handleSkipAll() {
    await commitAndExit([[], [], []])
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[48px] pt-14 px-4"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              {fromProfile || step > 0 ? (
                <button
                  onClick={handleBack}
                  className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-white/40 transition-colors shadow-lg pointer-events-auto"
                >
                  <ArrowLeftOutline className="w-5 h-5" color="white" />
                </button>
              ) : (
                <img
                  src={logoHorizontal}
                  alt="DEVCON+"
                  className="h-7 w-auto"
                />
              )}
              <button
                onClick={fromProfile ? () => navigate('/profile') : handleSkipAll}
                disabled={isSaving}
                className="text-white/60 text-md3-label-md font-bold uppercase tracking-wider hover:text-white transition-colors disabled:opacity-40"
              >
                {fromProfile ? 'Cancel' : 'Skip all'}
              </button>
            </div>

            {/* Step dots moved from here */}

            <h1 className="text-[24px] font-bold text-white mb-1">
              {STEP_TITLES[step]}
            </h1>
            <p className="text-md3-body-md text-white/70 font-medium">{STEP_SUBS[step]}</p>
          </div>
        </div>
      </header>

      {/* Body card — removed rounded corners and negative margin to show ellipse */}
      <div className="flex-1 bg-white relative z-20 px-4 pt-10 pb-32 overflow-y-auto">
        <p className="text-md3-label-md text-slate-400 mb-4 font-medium uppercase tracking-tight">
          {currentSelection.length > 0
            ? `${currentSelection.length} selected`
            : 'None selected — you can skip'}
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-wrap gap-[8px] mb-12"
          >
            {stepOptions.map((option) => {
              const selected = currentSelection.includes(option.id)
              return (
                <motion.button
                  key={option.id}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={() => togglePill(option.id)}
                  className={`px-4 py-2 rounded-xl text-md3-label-md font-semibold border-[1.5px] transition-all ${
                    selected
                      ? 'bg-primary text-white border-primary shadow-md'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {option.label}
                </motion.button>
              )
            })}
          </motion.div>
        </AnimatePresence>

        {/* Bottom controls */}
        <div className="space-y-6">
          {/* Step dots moved here */}
          <div className="flex gap-[6px] justify-center">
            {([0, 1, 2] as Step[]).map((i) => (
              <div
                key={i}
                className={`h-[4px] rounded-full transition-all duration-300 ${
                  i === step ? 'w-8 bg-primary' : 'w-4 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <div className="space-y-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={() => void handleNext()}
              disabled={isSaving}
              className="w-full bg-primary text-white font-bold py-4 rounded-2xl text-md3-label-lg shadow-primary hover:brightness-110 transition-all disabled:opacity-60"
            >
              {isSaving
                ? 'Saving…'
                : step < 2
                ? 'Next Step'
                : fromProfile
                ? 'Save changes'
                : 'Save & Go to App'}
            </motion.button>

            <button
              onClick={() => void handleSkipStep()}
              disabled={isSaving}
              className="w-full text-center text-md3-label-md text-slate-400 font-medium hover:text-slate-500 transition-colors disabled:opacity-40"
            >
              Skip this step
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

