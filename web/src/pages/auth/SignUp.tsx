import { useState, useCallback, useEffect, useRef } from 'react'
import LegalModal, { type LegalModalType } from '../../components/LegalModal'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { EyeOutline, EyeClosedOutline, CheckCircleOutline, CloseCircleOutline } from 'solar-icon-set'
import { useAuthStore } from '../../stores/useAuthStore'
import { useFormDraft } from '../../hooks/useFormDraft'
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'
import { useChaptersStore } from '../../stores/useChaptersStore'

const USERNAME_RE = /^[a-z0-9_]+$/

// const optionalUrl = z.string().url('Must be a valid URL').or(z.literal('')).optional()

const schema = z.object({
  full_name:  z.string().min(2, 'Name required').max(100, 'Name must be under 100 characters'),
  username:   z.string().min(3, 'Min 3 characters').max(20, 'Max 20 characters').regex(USERNAME_RE, 'Only lowercase letters, numbers, underscores'),
  email:      z.string().email('Invalid email'),
  password:   z.string().min(8, 'At least 8 characters').max(128, 'Password must be under 128 characters'),
  // school_or_company: z.string().max(100, 'Must be under 100 characters').optional(),
  chapter_id: z.string().min(1, 'Please select your chapter'),
  // linkedin_url:  optionalUrl,
  // github_url:    optionalUrl,
  // portfolio_url: optionalUrl,
})
type FormData = z.infer<typeof schema>

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.84H9v3.48h4.844a4.14 4.14 0 01-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

/** Map raw Supabase/GoTrue errors to user-friendly messages. */
function friendlyAuthError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('database error saving new user'))
    return 'Something went wrong creating your account. This usually means the username is already taken or your chapter selection is invalid. Please try a different username.'
  if (lower.includes('user already registered') || lower.includes('already been registered'))
    return 'An account with this email already exists. Try signing in instead.'
  if (lower.includes('password') && lower.includes('least'))
    return 'Your password is too short. Please use at least 8 characters.'
  if (lower.includes('rate limit') || lower.includes('too many'))
    return msg // already user-friendly from our rate limiter
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Unable to reach our servers. Please check your internet connection and try again.'
  return msg
}

function isSafeReturnTo(url: string | null): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
}

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function SignUp() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const refCode = searchParams.get('ref')
  const returnTo = searchParams.get('returnTo')
  // Officer-invite deep link (and similar) may pre-fill the email field.
  const invitedEmail = searchParams.get('email')
  const { signUp, checkUsernameAvailable, signInWithGoogle } = useAuthStore()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileError, setTurnstileError] = useState(false)
  const [legalModal, setLegalModal] = useState<LegalModalType | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { chapters, isLoading: chaptersLoading, error: chaptersError, fetchChapters } = useChaptersStore()

  // CAPTCHA gates the form when a site key is configured. If the widget never
  // loads (missing key, network, ad-blocker) the gate fails open — the backend
  // doesn't verify the token, so blocking sign-up on it would only lock out
  // legitimate users.
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
  const captchaRequired = turnstileSiteKey !== ''

  useEffect(() => { void fetchChapters() }, [fetchChapters])

  const { draft, saveDraft, clearDraft } = useFormDraft<Omit<FormData, 'password'>>(
    'sign-up',
    'session',
    { exclude: ['password'] },
  )

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name:  (draft.full_name  as string) ?? '',
      username:   (draft.username   as string) ?? '',
      email:      invitedEmail ?? (draft.email as string) ?? '',
      // school_or_company: (draft.school_or_company as string) ?? '',
      chapter_id: (draft.chapter_id as string) ?? '',
      // linkedin_url:  (draft.linkedin_url  as string) ?? '',
      // github_url:    (draft.github_url    as string) ?? '',
      // portfolio_url: (draft.portfolio_url as string) ?? '',
    },
  })
  const watchedPassword = watch('password') ?? ''

  useEffect(() => {
    const { unsubscribe } = watch((values) => {
      const { password: _omit, ...rest } = values
      saveDraft(rest as Omit<FormData, 'password'>)
    })
    return unsubscribe
  }, [watch, saveDraft])

  // OAuth completion handler. Runs after the Google popup resolves (signInWithPopup
  // does NOT remount the page) and on mount. Reads the user from the store — which
  // signInWithGoogle() sets synchronously via applyProfile() — instead of polling
  // supabase.auth.getSession(), whose Firebase-bridge session is often null at this
  // instant and was silently skipping navigation (the "stays on /sign-up" bug).
  const detectOAuthCompletion = useCallback(() => {
    const { user, isOAuthOnly } = useAuthStore.getState()
    // React only to a Google (OAuth) sign-in that populated the store.
    if (!user || !isOAuthOnly) return

    // New Google user (no username yet) → finish on the dedicated /complete-profile
    // page. The layout guard enforces the same thing for every other entry point.
    if (!user.username || !user.chapter_id) {
      navigate('/complete-profile', { replace: true })
      return
    }

    if (isSafeReturnTo(returnTo)) {
      navigate(returnTo, { replace: true })
    } else {
      navigate(
        user.role === 'super_admin' || user.role === 'hq_admin' ? '/admin' : '/home',
        { replace: true },
      )
    }
  }, [navigate, returnTo])

  useEffect(() => { void detectOAuthCompletion() }, [detectOAuthCompletion])

  const handleUsernameChange = useCallback((value: string) => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current)
    if (!value || value.length < 3 || !USERNAME_RE.test(value)) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    usernameTimerRef.current = setTimeout(async () => {
      const result = await checkUsernameAvailable(value)
      setUsernameStatus(result === 'unknown' ? 'idle' : result)
    }, 400)
  }, [checkUsernameAvailable])

  const onSubmit = async (data: FormData) => {
    if (usernameStatus === 'taken' || usernameStatus === 'checking') {
      setFormError(
        usernameStatus === 'checking'
          ? 'Please wait for username check to complete.'
          : 'Username is already taken.'
      )
      return
    }
    setFormError(null)

    // Email/password signup — collects a complete profile, so there is no
    // separate completion step (that path is Google-only, via /complete-profile).
    // The referral code travels with signup and is confirmed server-side after the
    // profile row is created (the confirm_referral RPC is now service-role only).
    const REFERRAL_CODE_RE = /^[A-Z0-9]{6,12}$/i
    const sanitizedRef = refCode && REFERRAL_CODE_RE.test(refCode) ? refCode : undefined
    try {
      const { emailConfirmationPending } = await signUp(
        data.email, data.password, data.full_name, data.username, data.chapter_id,
        /* data.school_or_company */ undefined, turnstileToken ?? undefined, sanitizedRef,
      )

      if (emailConfirmationPending) {
        clearDraft()
        if (isSafeReturnTo(returnTo)) localStorage.setItem('devcon_returnTo', returnTo)
        navigate('/email-sent', { state: { email: data.email, type: 'signup' } })
      } else {
        clearDraft()
        if (isSafeReturnTo(returnTo)) {
          navigate(returnTo, { replace: true })
        } else {
          navigate('/home') // was: navigate('/organizer-code-gate') — temporarily disabled
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Sign-up failed. Please try again.'
      setFormError(friendlyAuthError(raw))
      turnstileRef.current?.reset()
      setTurnstileToken(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Header ── */}
      <header className="flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[48px] pt-16 text-center"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          <img src={logoHorizontal} alt="DEVCON+" className="h-8 w-auto mx-auto relative z-10" />
          <p className="text-white/60 mt-3 text-md3-body-md font-proxima relative z-10 uppercase tracking-widest font-bold">
            Create your account
          </p>
        </div>
      </header>

      {/* Floating card */}
      <div className="px-4 pt-10 pb-10 overflow-y-auto">
        <button
          type="button"
          disabled={googleLoading}
          onClick={async () => {
            setGoogleLoading(true)
            setFormError(null)
            if (isSafeReturnTo(returnTo)) sessionStorage.setItem('devcon_returnTo', returnTo)
            try {
              // signInWithGoogle swallows popup failures (sets store error and
              // resolves) — surface that error here or the button hangs on
              // "Redirecting…" with no feedback.
              await signInWithGoogle()
              const storeError = useAuthStore.getState().error
              if (storeError) { setFormError(storeError); return }
              // Popup succeeded — react to it (no remount happens with a popup).
              detectOAuthCompletion()
            } catch (err) {
              // Surface the real reason (e.g. the /auth/firebase/exchange error)
              // instead of a generic message that hides the cause.
              const storeError = useAuthStore.getState().error
              setFormError(
                storeError ||
                  (err instanceof Error
                    ? err.message
                    : 'Unable to connect to Google Sign-In. Please try again or use email.'),
              )
            } finally {
              setGoogleLoading(false)
            }
          }}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-slate-200 rounded-xl text-md3-body-md font-semibold text-slate-700 hover:bg-slate-50 transition-colors mb-5 shadow-card disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-md3-label-md text-slate-400 font-medium">or email</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Full Name</label>
            <input
              {...register('full_name')}
              autoComplete="name"
              placeholder="Juan dela Cruz"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
            />
            {errors.full_name && <p className="text-red text-md3-label-md mt-1">{errors.full_name.message}</p>}
          </div>

          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-md3-body-md select-none">@</span>
              <input
                {...register('username', {
                  onChange: (e) => handleUsernameChange(e.target.value),
                })}
                autoComplete="username"
                placeholder="juan_delacruz"
                className="w-full border border-slate-200 rounded-xl pl-8 pr-10 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === 'checking' && <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-400 rounded-full animate-spin" />}
                {usernameStatus === 'available' && <CheckCircleOutline className="w-4 h-4" color="#21C45D" />}
                {usernameStatus === 'taken' && <CloseCircleOutline className="w-4 h-4" color="#EF4444" />}
              </span>
            </div>
            {errors.username && <p className="text-red text-md3-label-md mt-1">{errors.username.message}</p>}
            {usernameStatus === 'taken' && !errors.username && (
              <p className="text-red text-md3-label-md mt-1">Username already taken</p>
            )}
          </div>

          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="juan@devcon.ph"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
            />
            {errors.email && <p className="text-red text-md3-label-md mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Password</label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeClosedOutline className="w-4 h-4" /> : <EyeOutline className="w-4 h-4" />}
              </button>
            </div>
            <PasswordStrengthMeter password={watchedPassword} />
            {errors.password && <p className="text-red text-md3-label-md mt-1">{errors.password.message}</p>}
          </div>

          {/* OPTIONAL PROFILING FIELDS — hidden from sign-up; editable in Profile > Edit Profile
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
              School / Company <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              {...register('school_or_company')}
              placeholder="University of Santo Tomas"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
            />
          </div>

          <div className="space-y-3">
            <p className="text-md3-body-md font-medium text-slate-700">
              Social Links <span className="text-slate-400 font-normal">(optional)</span>
            </p>
            <div>
              <label className="text-md3-label-md text-slate-500 block mb-1">LinkedIn</label>
              <input
                {...register('linkedin_url')}
                type="url"
                placeholder="https://linkedin.com/in/yourprofile"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
              {errors.linkedin_url && <p className="text-red text-md3-label-md mt-1">{errors.linkedin_url.message}</p>}
            </div>
            <div>
              <label className="text-md3-label-md text-slate-500 block mb-1">GitHub</label>
              <input
                {...register('github_url')}
                type="url"
                placeholder="https://github.com/yourusername"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
              {errors.github_url && <p className="text-red text-md3-label-md mt-1">{errors.github_url.message}</p>}
            </div>
            <div>
              <label className="text-md3-label-md text-slate-500 block mb-1">Portfolio</label>
              <input
                {...register('portfolio_url')}
                type="url"
                placeholder="https://yourportfolio.com"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
              {errors.portfolio_url && <p className="text-red text-md3-label-md mt-1">{errors.portfolio_url.message}</p>}
            </div>
          </div>
          END OPTIONAL PROFILING FIELDS */}

          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
              Nearest Chapter
            </label>
            <select
              {...register('chapter_id')}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            >
              <option value="">Select your chapter…</option>
              {['Luzon', 'Visayas', 'Mindanao'].map((region) => {
                const group = chapters
                  .filter((c) => c.region === region)
                  .sort((a, b) => {
                    if (region === 'Luzon') {
                      if (a.name === 'Manila' && b.name !== 'Manila') return -1
                      if (b.name === 'Manila' && a.name !== 'Manila') return 1
                    }
                    return a.name.localeCompare(b.name)
                  })
                if (!group.length) return null
                return (
                  <optgroup key={region} label={region}>
                    {group.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            {errors.chapter_id && <p className="text-red text-md3-label-md mt-1">{errors.chapter_id.message}</p>}
            {chaptersLoading && chapters.length === 0 && (
              <p className="text-md3-label-md text-slate-400 mt-1">Loading chapters…</p>
            )}
            {chaptersError && chapters.length === 0 && !chaptersLoading && (
              <div className="mt-1 flex items-center gap-2">
                <p className="text-red text-md3-label-md">Couldn't load chapters.</p>
                <button
                  type="button"
                  onClick={() => void fetchChapters()}
                  className="text-blue text-md3-label-md font-semibold underline"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {formError && (
            <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          {captchaRequired && (
            <div>
              <Turnstile
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                onSuccess={(token) => { setTurnstileToken(token); setTurnstileError(false) }}
                onExpire={() => setTurnstileToken(null)}
                onError={() => { setTurnstileToken(null); setTurnstileError(true) }}
                options={{ theme: 'light', size: 'normal' }}
              />
              {turnstileError && (
                <p className="text-md3-label-md text-slate-500 mt-2">
                  Couldn't load the verification check — you can still create your account.
                </p>
              )}
            </div>
          )}

          <p className="text-md3-label-md text-slate-400 text-center">
            By creating an account you agree to our{' '}
            <button type="button" onClick={() => setLegalModal('terms')} className="text-blue underline">Terms &amp; Conditions</button>
            {' '}and{' '}
            <a
              href="https://devcon.ph/standard-privacy-and-safespace-consent/"
              target="_blank"
              rel="noreferrer noopener"
              className="text-blue underline"
            >
              Privacy Policy
            </a>.
          </p>

          <button
            type="submit"
            disabled={isSubmitting || (captchaRequired && !turnstileToken && !turnstileError)}
            className="w-full bg-primary text-white font-bold py-3 rounded-full shadow-sm disabled:opacity-60 hover:bg-blue-dark transition-colors"
          >
            {isSubmitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-md3-body-md text-slate-500 mt-6">
          Already have an account?{' '}
          <Link
            to={isSafeReturnTo(returnTo) ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : '/sign-in'}
            className="text-blue font-semibold"
          >
            Sign In
          </Link>
        </p>
      </div>

      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  )
}
