import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutline } from 'solar-icon-set'
import ComingSoonModal from '../../components/ComingSoonModal'
import { useAuthStore } from '../../stores/useAuthStore'

const COMING_SOON_OPTIONS = ['Profile Visibility', 'Data Export']

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function Privacy() {
  const navigate = useNavigate()
  const { deleteAccount } = useAuthStore()
  const [modal, setModal] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount()
      navigate('/sign-in')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account.')
      setIsDeleting(false)
    }
  }

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
              Privacy & Security
            </h1>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-2 pb-24 md:max-w-4xl md:mx-auto">
        {COMING_SOON_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setModal(opt)}
            className="w-full bg-white rounded-2xl shadow-card px-4 py-4 flex items-center text-left"
          >
            <span className="flex-1 font-medium text-slate-900 text-md3-body-md">{opt}</span>
            <span className="text-slate-300">›</span>
          </button>
        ))}

        {/* Delete Account */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full bg-white rounded-2xl shadow-card px-4 py-4 flex items-center text-left"
          >
            <span className="flex-1 font-medium text-red text-md3-body-md">Delete Account</span>
            <span className="text-slate-300">›</span>
          </button>
        ) : (
          <div className="bg-white rounded-2xl border border-red/20 p-4 space-y-3">
            <p className="text-md3-body-md font-bold text-slate-900">Delete your account?</p>
            <p className="text-md3-label-md text-slate-500">
              This permanently removes all your data — points, registrations, and profile. This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-md3-label-md text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmDelete(false); setDeleteError(null) }}
                className="flex-1 py-3 bg-slate-100 text-slate-700 text-md3-body-md font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex-1 py-3 bg-red text-white text-md3-body-md font-bold rounded-xl transition-colors disabled:opacity-60"
              >
                {isDeleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && <ComingSoonModal feature={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
