import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DangerTriangleOutline } from 'solar-icon-set'
import { motion, AnimatePresence } from 'framer-motion'
import { useRewardsStore } from '../../../stores/useRewardsStore'
import { RewardForm } from './RewardForm'
import NotFound from '../../NotFound'

export function RewardEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { allRewards, isLoadingAll, fetchAllRewards, deleteReward } = useRewardsStore()

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Fetch if store is empty
  useEffect(() => {
    if (allRewards.length === 0) void fetchAllRewards()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reward = allRewards.find((r) => r.id === id)

  // Loading guard
  if (isLoadingAll && allRewards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-blue border-t-transparent animate-spin" />
      </div>
    )
  }

  // Not-found guard
  if (!reward) return <NotFound />

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteReward(reward.id)
      navigate('/organizer/rewards', { replace: true })
    } catch {
      setDeleteError('Failed to remove reward. Please try again.')
      setIsDeleting(false)
    }
  }

  // ── Danger Zone (passed as slot prop to RewardForm) ───────────────────────
  const dangerZone = (
    <>
      <div className="mt-2 border-t-2 border-red/20 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-red/60 mb-3">
          Danger Zone
        </p>
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={() => setDeleteOpen(true)}
          className="w-full py-3 rounded-xl border border-red/30 text-red text-md3-body-md font-bold hover:bg-red/5 transition-colors"
        >
          Remove from Catalog
        </motion.button>
      </div>

      {/* Single-step delete bottom sheet */}
      <AnimatePresence>
        {deleteOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isDeleting) setDeleteOpen(false) }}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl px-4 pt-4 pb-10"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 rounded-full bg-red/10 flex items-center justify-center mb-4">
                  <DangerTriangleOutline className="w-7 h-7" color="#EF4444" />
                </div>
                <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">
                  Remove from Catalog?
                </h2>
                <p className="text-md3-body-md text-slate-500">
                  <span className="font-semibold text-slate-700">
                    &ldquo;{reward.name}&rdquo;
                  </span>{' '}
                  will be removed from the member rewards catalog.
                </p>
                {deleteError && (
                  <p className="mt-3 text-md3-body-md text-red font-semibold">{deleteError}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 text-md3-body-md font-bold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { void handleDelete() }}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl bg-red text-white text-md3-body-md font-bold disabled:opacity-60"
                >
                  {isDeleting ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )

  return (
    <RewardForm
      reward={reward}
      onSuccess={() => navigate('/organizer/rewards')}
      dangerZone={dangerZone}
    />
  )
}
