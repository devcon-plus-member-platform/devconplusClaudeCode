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
import { supabase } from '../../lib/supabase'

const USERNAME_RE = /^[a-z0-9_]+$/

interface Chapter { id: string; name: string; region: string }

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
  const { signUp, checkUsernameAvailable, signInWithGoogle } = useAuthStore()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [legalModal, setLegalModal] = useState<LegalModalType | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [isOAuthMode, setIsOAuthMode] = useState(false)
  const [oauthEmail, setOauthEmail] = useState('')

  const { draft, saveDraft, clearDraft } = useFormDraft<Omit<FormData, 'password'>>(
    'sign-up',
    'session',
    { exclude: ['password'] },
  )

  useEffect(() => {
    supabase.from('chapters').select('id, name, region').then(({ data }) => {
      if (data) setChapters(data as Chapter[])
    })
  }, [])

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name:  (draft.full_name  as string) ?? '',
      username:   (draft.username   as string) ?? '',
      email:      (draft.email      as string) ?? '',
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
      if (isOAuthMode) return   // session is authoritative in OAuth mode
      const { password: _omit, ...rest } = values
      saveDraft(rest as Omit<FormData, 'password'>)
    })
    return unsubscribe
  }, [watch, saveDraft, isOAuthMode])

  // OAuth completion mode detection — fires when OAuthCallback redirects here
  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const provider = session.user.app_metadata?.provider as string | undefined
      if (!provider || provider === 'email') return  // normal email signup


      void supabase
        .from('profiles')
        // .select('full_name, username, email, school_or_company, chapter_id, linkedin_url, github_url, portfolio_url')
        .select('full_name, username, email, chapter_id')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          const isComplete = Boolean(profile?.chapter_id && profile?.username)

          if (isComplete) {
            navigate('/home', { replace: true })
            return
          }

          setIsOAuthMode(true)
          setOauthEmail(session.user.email ?? '')
          const meta = session.user.user_metadata

          if (profile) {
            setValue('full_name',  profile.full_name ?? '')
            setValue('username',   profile.username ?? '')
            // setValue('school_or_company', profile.school_or_company ?? '')
            setValue('chapter_id', profile.chapter_id ?? '')
            // setValue('linkedin_url',  profile.linkedin_url  ?? '')
            // setValue('github_url',    profile.github_url    ?? '')
            // setValue('portfolio_url', profile.portfolio_url ?? '')
          } else {
            const googleName = (meta.full_name as string | undefined)
              ?? (meta.name as string | undefined)
              ?? ''
            setValue('full_name', googleName)
          }
          setValue('email', session.user.email ?? '')
        })
    })
  }, [setValue, navigate])

  const handleUsernameChange = useCallback((value: string) => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current)
    if (!value || value.length < 3 || !USERNAME_RE.test(value)) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    usernameTimerRef.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(value)
      setUsernameStatus(available ? 'available' : 'taken')
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

    // ── OAuth completion mode ─────────────────────────────────────────────────
    if (isOAuthMode) {
      try {
        // 1. Set local password (no re-auth needed — OAuth session is active)
        const { error: pwErr } = await supabase.auth.updateUser({ password: data.password })
        if (pwErr) {
          setFormError('Failed to set password. Please try again.')
          return
        }

        // 2. Upsert profile (creates or updates — handles both new and existing users)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { navigate('/sign-in', { replace: true }); return }
        const meta = session.user.user_metadata

        const { error: profileErr } = await supabase.from('profiles').upsert({
          id:         session.user.id,
          full_name:  data.full_name,
          username:   data.username.toLowerCase(),
          email:      session.user.email ?? '',
          chapter_id: data.chapter_id,
          // school_or_company: data.school_or_company || null,
          avatar_url: (meta.avatar_url as string | undefined) ?? null,
          // linkedin_url:  data.linkedin_url  || null,
          // github_url:    data.github_url    || null,
          // portfolio_url: data.portfolio_url || null,
          role:       'member',
        }, { onConflict: 'id', ignoreDuplicates: false })

        if (profileErr) {
          setFormError('Something went wrong saving your profile. Please try again.')
          return
        }

        // 3. Initialize store so the rest of the app has the correct user + isOAuthOnly=false
        await useAuthStore.getState().initialize()
        clearDraft()
        navigate('/organizer-code-gate', { replace: true, state: { returnTo: isSafeReturnTo(returnTo) ? returnTo : undefined } })
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Sign-up failed. Please try again.'
        setFormError(friendlyAuthError(raw))
      }
      return
    }
    // ── END OAuth completion mode ─────────────────────────────────────────────

    // Normal email/password signup (unchanged below)
    try {
      const { emailConfirmationPending } = await signUp(
        data.email, data.password, data.full_name, data.username, data.chapter_id,
        /* data.school_or_company */ undefined, turnstileToken ?? undefined,
        // { linkedin_url: data.linkedin_url || undefined, github_url: data.github_url || undefined, portfolio_url: data.portfolio_url || undefined },
      )

      const REFERRAL_CODE_RE = /^[A-Z0-9]{6,12}$/i
      const sanitizedRef = refCode && REFERRAL_CODE_RE.test(refCode) ? refCode : null
      if (sanitizedRef) {
        const newUserId = useAuthStore.getState().user?.id
        if (newUserId) {
          supabase
            .rpc('confirm_referral' as any, {
              p_referred_user_id: newUserId,
              p_referral_code:    sanitizedRef,
            })
            .then(() => {})
        }
      }

      if (emailConfirmationPending) {
        clearDraft()
        if (isSafeReturnTo(returnTo)) localStorage.setItem('devcon_returnTo', returnTo)
        navigate('/email-sent', { state: { email: data.email, type: 'signup' } })
      } else {
        clearDraft()
        if (isSafeReturnTo(returnTo)) {
          navigate(returnTo, { replace: true })
        } else {
          navigate('/organizer-code-gate')
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
          className="bg-[#1152d4] relative overflow-hidden z-0 pointer-events-auto pb-[48px] pt-16 text-center"
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
            {isOAuthMode ? 'Complete your profile' : 'Create your account'}
          </p>
        </div>
      </header>

      {/* Floating card */}
      <div className="px-4 pt-10 pb-10 overflow-y-auto">
        {!isOAuthMode && (
          <>
            <button
              type="button"
              disabled={googleLoading}
              onClick={async () => {
                setGoogleLoading(true)
                if (isSafeReturnTo(returnTo)) sessionStorage.setItem('devcon_returnTo', returnTo)
                try { await signInWithGoogle() } catch { setGoogleLoading(false) }
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
          </>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Full Name</label>
            <input
              {...register('full_name')}
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
            {isOAuthMode ? (
              <div className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 text-md3-body-md text-slate-500 flex items-center gap-2">
                <GoogleIcon />
                <span>{oauthEmail}</span>
              </div>
            ) : (
              <>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="juan@devcon.ph"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
                />
                {errors.email && <p className="text-red text-md3-label-md mt-1">{errors.email.message}</p>}
              </>
            )}
          </div>

          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Password</label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
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
          </div>

          {formError && (
            <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          {!isOAuthMode && (
            <Turnstile
              ref={turnstileRef}
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''}
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
              options={{ theme: 'light', size: 'normal' }}
            />
          )}

          <p className="text-md3-label-md text-slate-400 text-center">
            By creating an account you agree to our{' '}
            <button type="button" onClick={() => setLegalModal('terms')} className="text-blue underline">Terms &amp; Conditions</button>
            {' '}and{' '}
            <button type="button" onClick={() => setLegalModal('privacy')} className="text-blue underline">Privacy Policy</button>.
          </p>

          <button
            type="submit"
            disabled={isSubmitting || (!isOAuthMode && !turnstileToken)}
            className="w-full bg-[#1152d4] text-white font-bold py-4 rounded-2xl disabled:opacity-60 hover:bg-blue-dark transition-colors"
          >
            {isSubmitting
              ? (isOAuthMode ? 'Completing sign-up…' : 'Creating account…')
              : (isOAuthMode ? 'Complete Sign Up' : 'Create Account')}
          </button>
        </form>

        {!isOAuthMode && (
          <p className="text-center text-md3-body-md text-slate-500 mt-6">
            Already have an account?{' '}
            <Link
              to={isSafeReturnTo(returnTo) ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}` : '/sign-in'}
              className="text-blue font-semibold"
            >
              Sign In
            </Link>
          </p>
        )}
      </div>

      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  )
}
