import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CameraOutline } from 'solar-icon-set'
import { useAuthStore } from '../../stores/useAuthStore'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

const MAX_CODE_ATTEMPTS = 5
const CODE_LOCKOUT_MS   = 60_000

export default function OrganizerCodeGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo
  const { user, initials, setOrganizerSession, requestOrganizerUpgrade, uploadAvatar, updateProfile } = useAuthStore()
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const failedAttempts = useRef(0)
  const lockedUntil    = useRef<number>(0)
  const fileInputRef                        = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview]   = useState<string | null>(user?.avatar_url ?? null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError]       = useState<string | null>(null)

  const firstName = user?.full_name?.split(' ')[0] ?? 'there'

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError(null)

    const objectUrl = URL.createObjectURL(file)
    setAvatarPreview(objectUrl)
    setAvatarUploading(true)

    try {
      const url = await uploadAvatar(file)
      await updateProfile({ avatar_url: url })
      setAvatarPreview(url)   // swap blob URL → permanent URL before revoke
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed — tap to retry')
      setAvatarPreview(user?.avatar_url ?? null)
    } finally {
      setAvatarUploading(false)
      URL.revokeObjectURL(objectUrl)
    }
  }

  const handleAccessPortal = async () => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) { setError('Please enter your organizer code.'); return }
    const ORGANIZER_CODE_RE = /^[A-Z0-9\-]{6,20}$/
    if (!ORGANIZER_CODE_RE.test(trimmed)) {
      setError('Invalid code format. Expected format: DCN-XXX-1234')
      return
    }
    if (!user) { setError('Session expired. Please sign in again.'); return }

    const now = Date.now()
    if (now < lockedUntil.current) {
      const secsLeft = Math.ceil((lockedUntil.current - now) / 1000)
      setError(`Too many attempts. Please wait ${secsLeft}s before trying again.`)
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await requestOrganizerUpgrade(trimmed)

      if (result === 'invalid_code') {
        failedAttempts.current += 1
        if (failedAttempts.current >= MAX_CODE_ATTEMPTS) {
          lockedUntil.current    = Date.now() + CODE_LOCKOUT_MS
          failedAttempts.current = 0
          setError('Too many invalid attempts. Please wait 60 seconds.')
        } else {
          setError('Invalid organizer code. Please check and try again.')
        }
        return
      }
      if (result === 'wrong_chapter') {
        setError('This code does not match your chapter. Contact your chapter lead.')
        return
      }
      if (result === 'already_pending') {
        setError('You already have a pending upgrade request. Please wait for approval.')
        return
      }

      // Explicit check — safe against future UpgradeResult union additions
      if (result !== 'submitted') {
        setError('Something went wrong. Please try again.')
        return
      }

      // Success — request is pending admin approval
      failedAttempts.current = 0
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleContinueAsMember = () => {
    setOrganizerSession(false)
    // navigate('/interests', { state: { returnTo } })  // skipped — users can set interests from Profile
    navigate(returnTo ?? '/home', { replace: true })
  }

  return (
    <div className="min-h-screen bg-blue flex flex-col">
      {/* Gradient header */}
      <div className="bg-blue px-4 pt-16 pb-10 text-center">
        <img src={logoHorizontal} alt="DEVCON+" className="h-7 w-auto mx-auto" />
        <p className="text-white/70 mt-3 text-md3-body-md">Welcome, {firstName}!</p>
      </div>

      {/* Card */}
      <div className="flex-1 bg-slate-50 rounded-t-3xl px-4 pt-8 pb-32 overflow-y-auto">

        {submitted ? (
          /* Success state — request is pending admin approval */
          <div className="flex flex-col items-center text-center pt-6 gap-4">
            <div className="w-14 h-14 rounded-full bg-green/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-md3-body-lg font-bold text-slate-800">Request Submitted!</p>
              <p className="text-md3-body-md text-slate-500 mt-1">
                Your officer upgrade request is pending approval from your chapter lead. You'll be notified once it's approved.
              </p>
            </div>
            <button
              type="button"
              onClick={handleContinueAsMember}
              className="w-full bg-blue text-white font-bold py-4 rounded-2xl hover:bg-blue-dark transition-colors mt-2"
            >
              Continue as Member
            </button>
          </div>
        ) : (
          <>
            {/* Avatar picker — optional, non-blocking */}
            <div className="flex flex-col items-center mb-6">
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 rounded-full bg-blue/10 overflow-hidden flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-blue font-bold text-md3-title-lg select-none">{initials}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-blue flex items-center justify-center shadow-sm"
                  aria-label="Upload profile photo"
                >
                  {avatarUploading
                    ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <CameraOutline className="w-3 h-3" color="white" />
                  }
                </button>
              </div>

              {avatarError && (
                <p className="text-red text-md3-label-md mt-2 text-center max-w-[180px]">{avatarError}</p>
              )}

              <p className="text-md3-label-md text-slate-400 mt-1">Add a profile photo (optional)</p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleAvatarChange(e)}
              />
            </div>

            <h2 className="text-md3-title-lg font-black text-slate-900 mb-1">Are you a Chapter Officer?</h2>
            <p className="text-md3-body-md text-slate-500 mb-6">
              Enter your organizer code to request officer access, or continue as a member.
            </p>

            <div className="space-y-3">
              <input
                value={code}
                onChange={(e) => { setCode(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleAccessPortal()}
                placeholder="e.g. DCN-ABC-1234"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue uppercase tracking-wider"
              />
              {error && <p className="text-red text-md3-label-md">{error}</p>}

              <button
                type="button"
                onClick={handleAccessPortal}
                disabled={loading}
                className="w-full bg-navy text-white font-bold py-4 rounded-2xl disabled:opacity-60 hover:bg-blue transition-colors"
              >
                {loading ? 'Verifying…' : 'Request Officer Access'}
              </button>
            </div>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-md3-label-md text-slate-400 font-medium">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleContinueAsMember}
              className="w-full border border-slate-200 bg-white text-slate-700 font-bold py-4 rounded-2xl hover:bg-slate-50 transition-colors"
            >
              Continue as Member
            </button>

            <p className="text-center text-md3-label-md text-slate-400 mt-5">
              Organizer codes are issued by your chapter lead.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
