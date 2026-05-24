import { AnimatePresence, motion } from 'framer-motion'
import { MagniferOutline } from 'solar-icon-set'

interface SearchBarProps {
  isVisible: boolean
  value: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder: string
}

export default function SearchBar({ isVisible, value, onChange, onClear, placeholder }: SearchBarProps) {
  return (
    <div className="pointer-events-auto">
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pt-2 pb-1"
          >
            <div className="relative max-w-4xl mx-auto">
              <input
                autoFocus
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-white border border-slate-200 rounded-[20px] px-11 py-3 text-[16px] font-proxima focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
              />
              <MagniferOutline className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              {value && (
                <button
                  onClick={onClear}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[12px] font-bold"
                >
                  CLEAR
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
