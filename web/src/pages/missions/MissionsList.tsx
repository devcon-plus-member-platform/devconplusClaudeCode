import { useEffect, useRef, useState, useMemo, useDeferredValue } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BoltOutline, AltArrowDownOutline, StarOutline, UsersGroupRoundedOutline, FileTextOutline, CodeSquareOutline, ShareOutline, CupFirstOutline, MagniferOutline } from 'solar-icon-set'
import { useMissionsStore } from '../../stores/useMissionsStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { SkeletonJobCard } from '../../components/Skeleton'
import { staggerContainer, cardItem } from '../../lib/animation'
import { fuzzySearchFilter } from '../../lib/utils'
import SearchBar from '../../components/SearchBar'
import SearchEmptyState from '../../components/SearchEmptyState'
import type { MissionDifficulty } from '@devcon-plus/supabase'

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// ── Difficulty styling ────────────────────────────────────────────────────────

const DIFF_CONFIG: Record<MissionDifficulty, { label: string; bg: string; text: string }> = {
  easy:   { label: 'Easy',   bg: 'rgba(115,178,9,0.2)',   text: '#4a8c05' },
  medium: { label: 'Medium', bg: 'rgba(255,111,11,0.2)',  text: '#ff6f0b' },
  hard:   { label: 'Hard',   bg: 'rgba(127,8,255,0.2)',   text: '#7f08ff' },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MissionsList() {
  const { missions, participants, submissions, isLoading, error, fetchAll, startMission, submitMission, subscribeToChanges } = useMissionsStore()
  const { user } = useAuthStore()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [submitOpen, setSubmitOpen] = useState<Record<string, boolean>>({})
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({})
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({})
  const [attesting, setAttesting] = useState<Record<string, boolean>>({})
  const [attestErrors, setAttestErrors] = useState<Record<string, string>>({})

  const [isSearchVisible, setIsSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredQuery = useDeferredValue(searchQuery.trim())

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    void fetchAll()
    const unsubscribe = subscribeToChanges()
    return unsubscribe
  }, [fetchAll, subscribeToChanges])

  const handleStart = async (missionId: string) => {
    if (!user) return
    try {
      await startMission(missionId, user.id)
    } catch {
      // Already joined or network error — silently ignore, UI will reflect store state
    }
  }

  const openSubmit = (missionId: string, existingLink?: string) => {
    setLinkDrafts((p) => ({ ...p, [missionId]: existingLink ?? '' }))
    setSubmitOpen((p) => ({ ...p, [missionId]: true }))
    setSubmitErrors((p) => ({ ...p, [missionId]: '' }))
  }

  const handleSubmit = async (missionId: string) => {
    if (!user) return
    const link = (linkDrafts[missionId] ?? '').trim()
    if (!link) {
      setSubmitErrors((p) => ({ ...p, [missionId]: 'Please enter a link.' }))
      return
    }
    if (!link.startsWith('https://') && !link.startsWith('http://')) {
      setSubmitErrors((p) => ({ ...p, [missionId]: 'Please enter a valid URL starting with https://.' }))
      return
    }
    setSubmitting((p) => ({ ...p, [missionId]: true }))
    setSubmitErrors((p) => ({ ...p, [missionId]: '' }))
    try {
      await submitMission(missionId, user.id, link)
      setSubmitOpen((p) => ({ ...p, [missionId]: false }))
    } catch (err) {
      setSubmitErrors((p) => ({ ...p, [missionId]: err instanceof Error ? err.message : 'Submit failed.' }))
    } finally {
      setSubmitting((p) => ({ ...p, [missionId]: false }))
    }
  }

  const handleAttest = async (missionId: string) => {
    if (!user) return
    setAttesting((p) => ({ ...p, [missionId]: true }))
    setAttestErrors((p) => ({ ...p, [missionId]: '' }))
    try {
      await submitMission(missionId, user.id, 'submitted-for-approval')
    } catch (err) {
      setAttestErrors((p) => ({ ...p, [missionId]: err instanceof Error ? err.message : 'Could not confirm. Try again.' }))
    } finally {
      setAttesting((p) => ({ ...p, [missionId]: false }))
    }
  }

  const filteredMissions = useMemo(() =>
    missions.filter(mission =>
      fuzzySearchFilter(deferredQuery, mission, ['title', 'description'])
    ), [missions, deferredQuery]
  )

  const toggleSearch = () => {
    setIsSearchVisible(!isSearchVisible)
    if (isSearchVisible) setSearchQuery('')
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Glassmorphism Background ── */}
        <div className="absolute inset-0 backdrop-blur-md bg-slate-50/80 pointer-events-auto -z-10" />

        {/* ── Primary Background Container ── */}
        <div
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[24px]"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Title + Search icon */}
          <div className="relative z-10 flex items-center justify-between px-4 pt-6">
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              Missions
            </h1>

            <div className="flex items-center gap-[8px]">
              <button
                onClick={toggleSearch}
                className="bg-white/20 backdrop-blur-md size-[42px] flex items-center justify-center rounded-full border border-white/30 transition-colors active:bg-white/30 shadow-lg"
                aria-label="Search"
              >
                <MagniferOutline className="w-[18px] h-[18px]" color="white" />
              </button>
            </div>
          </div>
        </div>

        <SearchBar
          isVisible={isSearchVisible}
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
          placeholder="Search missions..."
        />
      </header>

      {/* ── Content ── */}
      <div className="flex-1">
        {isLoading && (
          <div className="space-y-3 px-4 pt-5">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonJobCard key={i} />)}
          </div>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-md3-body-md text-red mb-4">{error}</p>
            <button onClick={() => void fetchAll()} className="text-md3-body-md text-primary font-semibold">Try again</button>
          </div>
        )}

        {!isLoading && !error && missions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <BoltOutline className="w-8 h-8" color="rgba(var(--color-primary), 0.5)" />
            </div>
            <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">No missions yet</h2>
            <p className="text-md3-body-md text-slate-500">Check back soon for new bounties.</p>
          </div>
        )}

        {!isLoading && !error && missions.length > 0 && filteredMissions.length === 0 && deferredQuery && (
          <SearchEmptyState headline="No results found" body="Try adjusting your search query." />
        )}

        {!isLoading && !error && filteredMissions.length > 0 && (
          <motion.div
            key={`missions-grid-${deferredQuery}`}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-3 px-4 pt-5 pb-24"
          >
            {filteredMissions.map((mission) => {
              const diff = DIFF_CONFIG[mission.difficulty]
              const isClaimed = mission.status === 'claimed'
              const isExpanded = expandedId === mission.id

              const participantCount = participants.filter((p) => p.mission_id === mission.id).length
              const submissionCount  = submissions.filter((s)  => s.mission_id === mission.id).length

              const isJoined     = user ? participants.some((p) => p.mission_id === mission.id && p.user_id === user.id) : false
              const mySubmission = user ? submissions.find((s)  => s.mission_id === mission.id && s.user_id === user.id) : undefined
              const hasWon       = mySubmission?.status === 'approved'

              return (
                <motion.div
                  key={mission.id}
                  variants={cardItem}
                  ref={(el) => { cardRefs.current[mission.id] = el }}
                  className={`bg-white border border-[rgba(156,163,175,0.3)] rounded-[24px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.1)] overflow-hidden transition-opacity ${isClaimed && !hasWon ? 'opacity-60' : ''}`}
                >
                  {/* Card header — tap to expand */}
                  <motion.button
                    onClick={() => !isClaimed && setExpandedId(prev => prev === mission.id ? null : mission.id)}
                    className={`w-full px-[18px] py-4 text-left ${isClaimed && !hasWon ? 'cursor-default' : ''}`}
                    whileTap={isClaimed && !hasWon ? {} : { scale: 0.98 }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Difficulty & XP row */}
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="text-[9px] font-semibold tracking-[0.9px] uppercase px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: diff.bg, color: diff.text }}
                          >
                            {mission.difficulty?.toUpperCase() ?? 'EASY'}
                          </span>
                          <span className="bg-[rgba(254,248,209,0.9)] text-[#d2ad19] text-[9px] font-semibold tracking-[0.9px] uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                            <StarOutline className="w-[10px] h-[10px]" color="#F8C630" />
                            {mission.xp_reward} EXP
                          </span>
                        </div>

                        {/* Title row */}
                        <div className="flex flex-col items-start">
                          <p className="font-proxima font-bold text-[16px] text-black w-full leading-snug">
                            {mission.title}
                          </p>

                          {isClaimed && !hasWon && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 mt-1">
                              Claimed
                            </span>
                          )}
                          {hasWon && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gold/20 text-amber-700 flex items-center gap-1 mt-1">
                              <CupFirstOutline className="w-2.5 h-2.5" /> You won!
                            </span>
                          )}
                        </div>

                        {/* Live stats */}
                        <div className="flex items-center gap-3 py-1 mt-1">
                          <div className="flex items-center gap-1">
                            <UsersGroupRoundedOutline className="w-[10px] h-[10px]" color="#94A3B8" />
                            <span className="font-proxima text-[#6b7280] text-[12px]">{participantCount} joined</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FileTextOutline className="w-[10px] h-[10px]" color="#94A3B8" />
                            <span className="font-proxima text-[#6b7280] text-[12px]">{submissionCount} submitted</span>
                          </div>
                        </div>
                      </div>

                      {!isClaimed && (
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                          className="shrink-0 mt-8"
                        >
                          <AltArrowDownOutline className="w-4 h-4" color="#94A3B8" />
                        </motion.div>
                      )}
                    </div>
                  </motion.button>

                  {/* Expanded body */}
                  <AnimatePresence initial={false}>
                    {isExpanded && !isClaimed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="overflow-hidden"
                      >
                        <div className="px-[18px] pb-5 pt-3 border-t border-slate-100 space-y-4">
                          {/* Description */}
                          {mission.description && (
                            <p className="text-md3-body-md text-slate-600 leading-relaxed whitespace-pre-line">
                              {mission.description}
                            </p>
                          )}

                          {/* ── Won state (all types) ── */}
                          {hasWon && (
                            <div className="bg-gold/10 rounded-xl p-3 flex items-center gap-3">
                              <CupFirstOutline className="w-5 h-5 shrink-0" color="#D97706" />
                              <div>
                                <p className="text-md3-body-md font-bold text-amber-700">
                                  {mission.submission_type === 'submit_for_approval' ? 'Mission completed!' : 'You won this mission!'}
                                </p>
                                <p className="text-md3-label-md text-amber-600">+{mission.xp_reward} XP has been added to your account.</p>
                              </div>
                            </div>
                          )}

                          {/* ── Type: link — track participation + open URL ── */}
                          {!hasWon && mission.submission_type === 'link' && (
                            <>
                              {mission.github_url && (mission.github_url.startsWith('https://') || mission.github_url.startsWith('http://')) && (
                                <motion.a
                                  href={mission.github_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => { if (user && !isJoined) void handleStart(mission.id) }}
                                  className="w-full bg-primary text-white font-bold text-md3-body-md py-3 rounded-full shadow-sm flex items-center justify-center gap-2"
                                >
                                  <ShareOutline color="#fff" />
                                  Open Link
                                </motion.a>
                              )}
                              {isJoined && (
                                <p className="text-[11px] text-slate-400 text-center">
                                  You opened this link
                                </p>
                              )}
                            </>
                          )}

                          {/* ── Type: submit_for_approval — "Mark as Done" → pending admin review ── */}
                          {mission.submission_type === 'submit_for_approval' && !hasWon && (
                            <div className="space-y-2">
                              {mission.github_url && (mission.github_url.startsWith('https://') || mission.github_url.startsWith('http://')) && (
                                <a href={mission.github_url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-md3-body-md text-slate-500 hover:text-slate-800 transition-colors">
                                  <CodeSquareOutline className="w-4 h-4 shrink-0" />
                                  <span className="truncate text-md3-label-md">{mission.github_url}</span>
                                  <ShareOutline className="w-3 h-3 shrink-0 ml-auto" />
                                </a>
                              )}

                              {mySubmission && mySubmission.status === 'pending' && (
                                <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                  <div>
                                    <p className="text-md3-label-md font-semibold text-slate-700">Pending review</p>
                                    <p className="text-[10px] text-slate-400">Submitted {new Date(mySubmission.submitted_at).toLocaleString()}</p>
                                  </div>
                                </div>
                              )}

                              {!isJoined && (
                                <motion.button
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => void handleStart(mission.id)}
                                  className="w-full bg-primary text-white font-bold text-md3-body-md py-3 rounded-full shadow-sm"
                                >
                                  Start Mission
                                </motion.button>
                              )}

                              {isJoined && !mySubmission && (
                                <>
                                  {attestErrors[mission.id] && (
                                    <p className="text-md3-label-md text-red">{attestErrors[mission.id]}</p>
                                  )}
                                  <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => void handleAttest(mission.id)}
                                    disabled={attesting[mission.id]}
                                    className="w-full bg-primary text-white font-bold text-md3-body-md py-3 rounded-full shadow-sm disabled:opacity-50"
                                  >
                                    {attesting[mission.id] ? 'Submitting…' : 'Mark as Done'}
                                  </motion.button>
                                </>
                              )}
                            </div>
                          )}

                          {/* ── Type: proof_upload — submit link for admin review ── */}
                          {!hasWon && mission.submission_type === 'proof_upload' && (
                            <div className="space-y-2">
                              {mission.github_url && (mission.github_url.startsWith('https://') || mission.github_url.startsWith('http://')) && !submitOpen[mission.id] && (
                                <a href={mission.github_url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-md3-body-md text-slate-500 hover:text-slate-800 transition-colors">
                                  <CodeSquareOutline className="w-4 h-4 shrink-0" />
                                  <span className="truncate text-md3-label-md">{mission.github_url}</span>
                                  <ShareOutline className="w-3 h-3 shrink-0 ml-auto" />
                                </a>
                              )}

                              {!isJoined && (
                                <motion.button
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => void handleStart(mission.id)}
                                  className="w-full bg-primary text-white font-bold text-md3-body-md py-3 rounded-full shadow-sm"
                                >
                                  Start Mission
                                </motion.button>
                              )}

                              {isJoined && (
                                <>
                                  {mySubmission && !submitOpen[mission.id] && (
                                    <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Your Submission</p>
                                      <a href={mySubmission.pr_link} target="_blank" rel="noopener noreferrer"
                                        className="text-md3-label-md text-blue hover:underline break-all block">{mySubmission.pr_link}</a>
                                      <p className="text-[10px] text-slate-400">
                                        Submitted {new Date(mySubmission.submitted_at).toLocaleString()}
                                      </p>
                                    </div>
                                  )}

                                  <AnimatePresence>
                                    {submitOpen[mission.id] && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-2"
                                      >
                                        <input
                                          type="text"
                                          inputMode="url"
                                          maxLength={2048}
                                          value={linkDrafts[mission.id] ?? ''}
                                          onChange={(e) => setLinkDrafts((p) => ({ ...p, [mission.id]: e.target.value }))}
                                          placeholder="https://..."
                                          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-white text-slate-900 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                        />
                                        {submitErrors[mission.id] && (
                                          <p className="text-md3-label-md text-red">{submitErrors[mission.id]}</p>
                                        )}
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => setSubmitOpen((p) => ({ ...p, [mission.id]: false }))}
                                            className="flex-1 py-2.5 rounded-full border border-slate-200 text-slate-600 text-md3-body-md font-semibold"
                                          >
                                            Cancel
                                          </button>
                                          <motion.button
                                            whileTap={{ scale: 0.97 }}
                                            onClick={() => void handleSubmit(mission.id)}
                                            disabled={submitting[mission.id]}
                                            className="flex-1 py-2.5 rounded-full bg-primary text-white text-md3-body-md font-bold disabled:opacity-50 shadow-sm"
                                          >
                                            {submitting[mission.id] ? 'Submitting…' : mySubmission ? 'Update Link' : 'Submit'}
                                          </motion.button>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>

                                  {!submitOpen[mission.id] && (
                                    <motion.button
                                      whileTap={{ scale: 0.97 }}
                                      onClick={() => openSubmit(mission.id, mySubmission?.pr_link)}
                                      className={`w-full font-bold text-md3-body-md py-3 rounded-full shadow-sm ${
                                        mySubmission
                                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                          : 'bg-primary text-white'
                                      }`}
                                    >
                                      {mySubmission ? 'Update Link' : 'Submit Link'}
                                    </motion.button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </div>
  )
}
