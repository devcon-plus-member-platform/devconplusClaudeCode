import { motion } from 'framer-motion'

interface Props {
  options: string[]
  selected: string
  onChange: (value: string) => void
}

export default function ChipBar({ options, selected, onChange }: Props) {
  return (
    <div className="overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
      <div className="inline-flex gap-1 bg-slate-100 p-1 rounded-xl">
        {options.map((opt) => (
          <motion.button
            key={opt}
            onClick={() => onChange(opt)}
            className={`flex-shrink-0 text-md3-body-md font-semibold px-4 py-1.5 rounded-lg transition-colors ${
              selected === opt
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {opt}
          </motion.button>
        ))}
      </div>
    </div>
  )
}
