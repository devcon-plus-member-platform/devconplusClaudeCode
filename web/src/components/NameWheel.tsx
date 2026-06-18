import { motion } from 'framer-motion'

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

const SEGMENT_FILLS = [
  '#E0524B', // red
  '#E8843C', // orange
  '#EAC32E', // yellow
  '#4FA85A', // green
  '#3B7DD8', // blue
  '#4A53B5', // indigo
  '#8E4FC0', // violet
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
          borderTop: '30px solid #0F172A',
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

      {/* Center hub / spin button */}
      <button
        type="button"
        onClick={onSpin}
        disabled={!canSpin}
        className="absolute left-1/2 top-1/2 z-10 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-primary text-md3-title-md font-black uppercase tracking-wide text-white shadow-xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSpinning ? '…' : 'Spin'}
      </button>
    </div>
  )
}
