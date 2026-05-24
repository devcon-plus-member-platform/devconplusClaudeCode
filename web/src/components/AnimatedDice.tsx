import { motion } from 'framer-motion'

// Matches Figma node 328:2917 exactly:
// bg-[#f5f5f5], rounded-[12px], p-[10px]
// Two rows of two dots, each row 32×12px, gap-[8px] between rows
// Colors: top-left=yellow, top-right=orange, bottom-left=purple, bottom-right=green

const ROWS = [
  [
    { fill: '#E9C902' }, // yellow
    { fill: '#EA641D' }, // orange
  ],
  [
    { fill: '#5C29A1' }, // purple
    { fill: '#73B209' }, // green
  ],
]

const DOT_R = 6   // radius that fits in 12px row height (r=6 → diameter=12)
const DOT_CX = [6, 26] // cx positions in 32px-wide row (centered, 20px apart)

export default function AnimatedDice() {
  return (
    // Outer wrapper gives room for the shadow below
    <div className="relative" style={{ width: 52, height: 64 }}>
      {/*
        Roll animation — rotateX = forward somersault (die rolling toward viewer)
        Arc: lifts up mid-roll, lands back down, holds, repeats
      */}
      <motion.div
        style={{ width: 52, height: 52 }}
        animate={{
          rotateZ: [0, 360],          // full roll like a wheel
          y:       [0, -18, 0],       // slight arc mid-roll
          scaleX:  [1, 1, 1],
          scaleY:  [1, 1, 1],
        }}
        transition={{
          rotateZ: {
            duration: 1.4,
            repeat: Infinity,
            repeatDelay: 1.0,
            ease: [0.4, 0, 0.2, 1],  // fast start (momentum), slow finish (friction/landing)
          },
          y: {
            duration: 1.4,
            repeat: Infinity,
            repeatDelay: 1.0,
            ease: 'easeInOut',
            times: [0, 0.45, 1],
          },
        }}
      >
        {/* Card — matches Figma: bg-[#f5f5f5] rounded-[12px] p-[10px] */}
        <div
          className="flex flex-col items-start"
          style={{
            width: 52,
            height: 52,
            backgroundColor: '#f5f5f5',
            borderRadius: 12,
            padding: 10,
            gap: 8,
          }}
        >
          {ROWS.map((row, ri) => (
            <svg key={ri} width={32} height={12} viewBox="0 0 32 12">
              {row.map(({ fill }, di) => (
                <circle key={di} cx={DOT_CX[di]} cy={6} r={DOT_R} fill={fill} />
              ))}
            </svg>
          ))}
        </div>
      </motion.div>

      {/* Shadow — shrinks mid-air, flattens wide on landing */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/20 blur-sm"
        style={{ bottom: 0 }}
        animate={{
          width:   [36, 20, 36],
          opacity: [0.25, 0.08, 0.25],
          height:  [5, 3, 5],
        }}
        transition={{
          duration: 1.4,
          repeat: Infinity,
          repeatDelay: 1.0,
          ease: 'easeInOut',
          times: [0, 0.45, 1],
        }}
      />
    </div>
  )
}
