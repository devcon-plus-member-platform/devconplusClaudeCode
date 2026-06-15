import { motion } from 'framer-motion'
import { CheckCircleOutline, CloseCircleOutline } from 'solar-icon-set'

interface Props {
  password: string
}

// Hex values must match tailwind.config.js color tokens.
// Raw hex required — CSS class names cannot be used in framer-motion's animate prop.
const LEVEL_CONFIG = {
  weak:   { label: 'Weak',   hex: '#EF4444', textClass: 'text-red',       activeCount: 1 },
  fair:   { label: 'Fair',   hex: '#F8C630', textClass: 'text-slate-700', activeCount: 2 },
  strong: { label: 'Strong', hex: '#21C45D', textClass: 'text-green',     activeCount: 3 },
} as const

// text-slate-700 (ensures Tailwind JIT retains this class used in dynamic interpolation)

type Level = keyof typeof LEVEL_CONFIG

function getLevel(password: string): Level {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length

  if (score >= 4) return 'strong'
  if (score >= 2) return 'fair'
  return 'weak'
}

// Chip order: 8+chars / Uppercase (col 1 top/bottom), Number / Symbol (col 2 top/bottom)
const CHIPS: { label: string; satisfied: (p: string) => boolean }[] = [
  { label: '8+ chars',  satisfied: (p) => p.length >= 8 },
  { label: 'Uppercase', satisfied: (p) => /[A-Z]/.test(p) },
  { label: 'Number',    satisfied: (p) => /[0-9]/.test(p) },
  { label: 'Symbol',    satisfied: (p) => /[^A-Za-z0-9]/.test(p) },
]

export default function PasswordStrengthMeter({ password }: Props) {
  if (password.length === 0) return null

  const level = getLevel(password)
  const { label, hex, textClass, activeCount } = LEVEL_CONFIG[level]

  return (
    <div className="mt-2">
      {/* Strength bar + label */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2].map((i) => {
            const isActive = i < activeCount
            const bg = isActive ? hex : '#E2E8F0'
            return (
              <motion.div
                key={i}
                className="flex-1 h-1.5 rounded-full"
                // initial must equal animate to prevent a flash from browser default on mount
                initial={{ backgroundColor: bg }}
                animate={{ backgroundColor: bg }}
                transition={{ duration: 0.25 }}
              />
            )
          })}
        </div>
        <span className={`text-md3-label-md font-semibold shrink-0 ${textClass}`}>{label}</span>
      </div>

      {/* Requirement chips — 2×2 grid */}
      <div className="grid grid-cols-2 gap-1 mt-2">
        {CHIPS.map(({ label: chipLabel, satisfied }) => {
          const ok = satisfied(password)
          return (
            <div key={chipLabel} className="flex items-center gap-1">
              {ok
                ? <CheckCircleOutline className="w-3 h-3 shrink-0" color="#21C45D" />
                : <CloseCircleOutline     className="w-3 h-3 shrink-0" color="#CBD5E1" />
              }
              <span className={`text-md3-label-md ${ok ? 'text-slate-700' : 'text-slate-400'}`}>
                {chipLabel}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
