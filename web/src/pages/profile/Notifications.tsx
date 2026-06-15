import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline } from 'solar-icon-set'

const SETTINGS = [
  { key: 'event_updates', label: 'Event Updates', desc: 'Registration confirmations and reminders' },
  { key: 'points_earned', label: 'Points Earned', desc: 'When you earn or redeem points'           },
  { key: 'new_events',    label: 'New Events',    desc: 'Events from your chapter'                 },
  { key: 'job_alerts',    label: 'Job Alerts',    desc: 'New jobs on the board'                    },
]

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function Notifications() {
  const navigate = useNavigate()
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(SETTINGS.map((s) => [s.key, true]))
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Icons */}
          <div className="relative z-10 px-4 pb-4 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >              <ArrowLeftOutline className="w-5 h-5" color="white" />
            </button>
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              Notifications
            </h1>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-2 pb-24 md:max-w-4xl md:mx-auto">
        {SETTINGS.map((s) => (
          <div key={s.key} className="bg-white rounded-2xl shadow-card px-4 py-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="font-medium text-slate-900 text-md3-body-md">{s.label}</p>
              <p className="text-md3-label-md text-slate-400 mt-0.5">{s.desc}</p>
            </div>
            <button
              onClick={() => setOn((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
              className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on[s.key] ? 'bg-primary' : 'bg-slate-200'}`}
            >
              <span
                className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${on[s.key] ? 'translate-x-5' : ''}`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
