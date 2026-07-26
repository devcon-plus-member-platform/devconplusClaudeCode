import { motion } from 'framer-motion'
import centerLogo from '../assets/logos/thumbnail.png'
import { POSTER_DEEP_NAVY, POSTER_INDIGO } from './RafflePosterArt'

interface NameWheelProps {
  entrants: string[]
  rotation: number
  isSpinning: boolean
  /** Fires once the rotate transition completes. */
  onSpinEnd: () => void
  /** Center hub action — disabled while spinning or when the pool is too small. */
  onSpin: () => void
  canSpin: boolean
}

const SIZE = 360 // viewBox units (geometry is computed in these); the SVG fills its parent
const RADIUS = SIZE / 2
const CENTER = SIZE / 2

// DEVCON 16 vivid rainbow — full-spectrum hues so segments stay visually distinct.
const SEGMENT_FILLS = [
  '#E5342B', // red
  '#F26C21', // orange
  '#F6B11F', // amber
  '#2BB24C', // green
  '#18B5C4', // cyan
  '#1E73BE', // blue
  '#5B3FA0', // indigo
  '#B83A8E', // magenta
]

const SPIN_EASE: [number, number, number, number] = [0.17, 0.67, 0.12, 0.99]
const SPIN_TRANSITION = { duration: 4.5, ease: SPIN_EASE }

// Above this count, individual labels become unreadable — hide them and let the
// winner overlay name the result instead (matches how wheelofnames handles big lists).
const MAX_LABELS = 40

function polarToCartesian(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) }
}

function slicePath(startAngle: number, endAngle: number): string {
  const start = polarToCartesian(endAngle, RADIUS)
  const end = polarToCartesian(startAngle, RADIUS)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    'Z',
  ].join(' ')
}

function truncate(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

export default function NameWheel({
  entrants,
  rotation,
  isSpinning,
  onSpinEnd,
  onSpin,
  canSpin,
}: NameWheelProps) {
  const count = entrants.length
  const sliceAngle = count > 0 ? 360 / count : 360
  const showLabels = count > 0 && count <= MAX_LABELS

  return (
    <div className="relative aspect-square w-full">
      {/* Fixed pointer at 12 o'clock */}
      <div
        className="absolute left-1/2 -top-2 z-10 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: '18px solid transparent',
          borderRight: '18px solid transparent',
          borderTop: `30px solid ${POSTER_DEEP_NAVY}`,
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
        }}
        aria-hidden
      />

      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="drop-shadow-xl"
      >
        {/* Outer ring — static */}
        <circle cx={CENTER} cy={CENTER} r={RADIUS - 1} fill="#fff" stroke="#E2E8F0" strokeWidth={2} />

        {/* Slices + labels rotate together; labels counter-rotate to stay upright. */}
        <motion.g
          animate={{ rotate: rotation }}
          transition={SPIN_TRANSITION}
          onAnimationComplete={onSpinEnd}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        >
          {count === 1 ? (
            <circle cx={CENTER} cy={CENTER} r={RADIUS - 4} fill={SEGMENT_FILLS[0]} />
          ) : (
            entrants.map((name, i) => {
              const start = i * sliceAngle
              const end = start + sliceAngle
              return (
                <path
                  key={`slice-${name}-${i}`}
                  d={slicePath(start, end)}
                  fill={SEGMENT_FILLS[i % SEGMENT_FILLS.length]}
                  stroke="#fff"
                  strokeWidth={2}
                />
              )
            })
          )}

          {showLabels &&
            entrants.map((name, i) => {
              const mid = i * sliceAngle + sliceAngle / 2
              // Radial label running along the slice's spoke. The base radial
              // angle is mid − 90; on the left half we add 180 so the text reads
              // outward-upright instead of upside-down.
              const rot = mid > 180 ? mid + 90 : mid - 90
              const labelPos = polarToCartesian(mid, RADIUS * 0.56)
              return (
                <text
                  key={`label-${name}-${i}`}
                  x={labelPos.x}
                  y={labelPos.y}
                  fill="#fff"
                  fontSize={count > 24 ? 11 : count > 16 ? 13 : 15}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${rot}, ${labelPos.x}, ${labelPos.y})`}
                  style={{ pointerEvents: 'none' }}
                >
                  {truncate(name, 18)}
                </text>
              )
            })}
        </motion.g>
      </svg>

      {/* Idle "tap me" glow — only while a spin is actually available, so it
          never implies the button works when the pool is too small. The
          centering transform lives on this plain wrapper (not the motion
          element) because framer-motion's own `animate` transform would
          otherwise overwrite the Tailwind translate classes. */}
      {canSpin && !isSpinning && (
        <div
          className="absolute left-1/2 top-1/2 z-0 h-28 w-28 -translate-x-1/2 -translate-y-1/2"
          aria-hidden
        >
          <motion.span
            className="block h-full w-full rounded-full"
            style={{ background: POSTER_INDIGO }}
            animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0, 0.35] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* Center hub / spin button — sits outside the rotating group, so the
          DEVCON+ logo stays upright while the segments spin. */}
      <button
        type="button"
        onClick={onSpin}
        disabled={!canSpin}
        aria-label="Spin the wheel"
        style={{ background: `linear-gradient(135deg, ${POSTER_INDIGO}, ${POSTER_DEEP_NAVY})` }}
        className={`absolute left-1/2 top-1/2 z-10 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border-4 border-white shadow-xl transition active:scale-95 disabled:cursor-not-allowed ${
          canSpin ? 'cursor-pointer' : ''
        } ${isSpinning ? 'animate-pulse opacity-70' : ''}`}
      >
        <img src={centerLogo} alt="DEVCON+" className="h-12 w-12 object-contain" />
        <span className="font-proxima text-md3-label-sm font-bold uppercase tracking-wide text-white">
          {isSpinning ? 'Spinning…' : 'Tap to spin'}
        </span>
      </button>
    </div>
  )
}
