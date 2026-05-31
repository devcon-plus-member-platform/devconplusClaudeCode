import { useState, useRef, useEffect } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom'
import { EyeOutline, EyeClosedOutline } from 'solar-icon-set'
import { useAuthStore } from '../../stores/useAuthStore'
import { useFormDraft } from '../../hooks/useFormDraft'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 300_000

function isSafeReturnTo(url: string | null): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
}

function isOverloadError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('429') ||
      msg.includes('service unavailable') ||
      msg.includes('gateway timeout') ||
      msg.includes('too many requests') ||
      msg.includes('resource exhausted')
    ) return true
  }
  const typed = err as { status?: number; statusCode?: number } | null
  const status = typed?.status ?? typed?.statusCode
  return status === 503 || status === 504 || status === 429
}

/** Map raw Supabase/GoTrue errors to user-friendly messages. */
function friendlyAuthError(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login credentials'))
    return 'Incorrect email or password. Please double-check and try again.'
  if (lower.includes('email not confirmed'))
    return 'Your email hasn\u2019t been verified yet. Please check your inbox for a confirmation link.'
  if (lower.includes('rate limit') || lower.includes('too many'))
    return msg // already user-friendly from our rate limiter
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Unable to reach our servers. Please check your internet connection and try again.'
  return msg
}

const HIGH_TRAFFIC_MESSAGE =
  'There are currently a lot of members using DEVCON+ and the servers are catching up. Our team is on it \u2014 please wait a moment and try again.'

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(8, 'At least 8 characters'),
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

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo')
  const { signIn, signInWithGoogle } = useAuthStore()
  const { draft, saveDraft, clearDraft } = useFormDraft<{ email: string }>(
    'sign-in',
    'session',
    { exclude: ['password'] },
  )

  const [googleLoading, setGoogleLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isHighTraffic, setIsHighTraffic] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)
  // Client-side rate limiting (UX convenience only — server enforcement via Supabase GoTrue)
  const failedAttempts  = useRef(0)
  const lockedUntil     = useRef<number>(0)

  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: (draft.email as string) ?? '' },
  })

  useEffect(() => {
    const { unsubscribe } = watch((values) => {
      saveDraft({ email: values.email as string })
    })
    return unsubscribe
  }, [watch, saveDraft])

  const onSubmit = async (data: FormData) => {
    const now = Date.now()
    if (now < lockedUntil.current) {
      const secsLeft = Math.ceil((lockedUntil.current - now) / 1000)
      setFormError(`Too many attempts. Please wait ${secsLeft}s before trying again.`)
      return
    }

    setFormError(null)
    setIsHighTraffic(false)
    try {
      await signIn(data.email, data.password, turnstileToken ?? undefined)
      failedAttempts.current = 0
      clearDraft()
      navigate(isSafeReturnTo(returnTo) ? returnTo : '/home')
    } catch (err) {
      // Firebase path: user signed up but hasn't clicked the verification link.
      // Redirect to /email-sent so they can resend — don't count as a failed attempt.
      if ((err as { code?: string }).code === 'email_not_verified') {
        navigate('/email-sent', { state: { email: data.email, type: 'signup' } })
        return
      }
      turnstileRef.current?.reset()
      setTurnstileToken(null)
      if (isOverloadError(err)) {
        setIsHighTraffic(true)
        setFormError(HIGH_TRAFFIC_MESSAGE)
        return
      }
      const serverSecs = (err as { retryAfterSeconds?: number }).retryAfterSeconds
      if (serverSecs) {
        failedAttempts.current = 0
        lockedUntil.current    = Date.now() + serverSecs * 1000
        setFormError(friendlyAuthError(err instanceof Error ? err.message : `Too many login attempts. Please wait ${serverSecs} seconds before trying again.`))
        return
      }
      failedAttempts.current += 1
      if (failedAttempts.current >= MAX_ATTEMPTS) {
        lockedUntil.current    = Date.now() + LOCKOUT_MS
        failedAttempts.current = 0
        setFormError(`Too many failed attempts. Please wait ${LOCKOUT_MS / 1000} seconds before trying again.`)
      } else {
        setFormError(friendlyAuthError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.'))
      }
    }
  }

  // Flower-of-life pattern matching Rewards/Dashboard/Events
  const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
  const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

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
              Sign in to your account
            </p>
          </div>
        </header>

        {/* Card */}
        <div className="px-4 pt-10 pb-10 overflow-y-auto">

        {/* Password reset success banner */}
        {passwordReset && (
          <div className="bg-green/10 border border-green/20 rounded-xl px-4 py-3 mb-5">
            <p className="text-green text-md3-body-md font-semibold">Password updated successfully!</p>
            <p className="text-green/80 text-md3-label-md mt-0.5">Sign in with your new password.</p>
          </div>
        )}

        <button
          type="button"
          disabled={googleLoading}
          onClick={async () => {
            setGoogleLoading(true)
            setFormError(null)
            setIsHighTraffic(false)
            if (isSafeReturnTo(returnTo)) {
              sessionStorage.setItem('devcon_returnTo', returnTo)
            }
            try {
              await signInWithGoogle()
              // signInWithGoogle resolved without throwing — popup completed or was
              // silently dismissed. Navigate to home if auth succeeded (user is set),
              // otherwise just reset the button.
              setGoogleLoading(false)
              navigate(isSafeReturnTo(returnTo) ? returnTo : '/home')
            } catch (err) {
              setGoogleLoading(false)
              if (isOverloadError(err)) {
                setIsHighTraffic(true)
                setFormError(HIGH_TRAFFIC_MESSAGE)
              } else {
                setFormError('Unable to connect to Google Sign-In. Please try again or use email.')
              }
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
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="juan@devcon.ph"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
            />
            {errors.email && <p className="text-red text-md3-label-md mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-md3-body-md font-medium text-slate-700">Password</label>
              <Link to="/forgot-password" className="text-md3-label-md text-blue font-semibold">
                Forgot password?
              </Link>
            </div>
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
            {errors.password && <p className="text-red text-md3-label-md mt-1">{errors.password.message}</p>}
          </div>

          {formError && isHighTraffic && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-amber-800 text-md3-body-sm font-semibold mb-0.5">High Traffic Right Now</p>
              <p className="text-amber-700 text-md3-label-md leading-relaxed">{formError}</p>
            </div>
          )}
          {formError && !isHighTraffic && (
            <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <Turnstile
            ref={turnstileRef}
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
            options={{ theme: 'light', size: 'normal' }}
          />

          <button
            type="submit"
            disabled={isSubmitting || !turnstileToken}
            className="w-full bg-blue text-white font-bold py-4 rounded-2xl disabled:opacity-60 hover:bg-blue-dark transition-colors"
          >
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-md3-body-md text-slate-500 mt-6">
          Don't have an account?{' '}
          <Link
            to={isSafeReturnTo(returnTo) ? `/sign-up?returnTo=${encodeURIComponent(returnTo)}` : '/sign-up'}
            className="text-blue font-semibold"
          >
            Sign Up
          </Link>
        </p>
      </div>

    </div>
  )
}
