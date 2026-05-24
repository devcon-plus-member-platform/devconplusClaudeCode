import { useState, useEffect, useRef } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { LetterOutline, RestartOutline } from 'solar-icon-set'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { supabase } from '../../lib/supabase'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

interface LocationState {
  email: string
  type: 'signup' | 'reset'
}

const RESEND_COOLDOWN = 60

export default function EmailSent() {
  const location = useLocation()
  const state = location.state as LocationState | null
  const email = state?.email ?? ''
  const type = state?.type ?? 'reset'

  const [cooldown, setCooldown] = useState(0)
  const [resendError, setResendError] = useState<string | null>(null)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const handleResend = async () => {
    setResendError(null)
    setResendSuccess(false)
    try {
      if (type === 'signup') {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { captchaToken: turnstileToken ?? undefined },
        })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
          captchaToken: turnstileToken ?? undefined,
        })
        if (error) throw error
      }
      setResendSuccess(true)
      setCooldown(RESEND_COOLDOWN)
      turnstileRef.current?.reset()
      setTurnstileToken(null)
    } catch (err) {
      setResendError(err instanceof Error ? err.message : 'Failed to resend. Try again.')
      turnstileRef.current?.reset()
      setTurnstileToken(null)
    }
  }

  const heading = type === 'signup' ? 'Verify Your Email' : 'Check Your Inbox'
  const body = type === 'signup'
    ? 'We sent a confirmation link to your email. Click it to activate your account.'
    : 'We sent a password reset link to your email. Click it to set a new password.'

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
                {type === 'signup' ? 'One more step' : 'Reset your password'}
              </p>
            </div>
          </header>

          {/* Card */}
          <div className="flex-1 px-4 pt-10 pb-10 flex flex-col items-center text-center">
        {/* LetterOutline icon */}
        <div className="w-16 h-16 rounded-2xl bg-blue/10 flex items-center justify-center mb-5">
          <LetterOutline className="w-8 h-8" color="#1152D4" />
        </div>

        <h2 className="text-md3-title-lg font-black text-slate-900 mb-2">{heading}</h2>
        <p className="text-md3-body-md text-slate-500 leading-relaxed max-w-xs mb-2">{body}</p>

        {email && (
          <p className="text-md3-body-md font-semibold text-slate-700 mb-6 break-all">{email}</p>
        )}

        {/* Resend */}
        {resendSuccess && (
          <p className="text-green text-md3-label-md font-medium mb-3">Link resent — check your inbox.</p>
        )}
        {resendError && (
          <p className="text-red text-md3-label-md mb-3">{resendError}</p>
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
          onClick={handleResend}
          disabled={cooldown > 0 || !turnstileToken}
          className="flex items-center gap-2 text-md3-body-md font-semibold text-blue disabled:text-slate-400 disabled:cursor-not-allowed transition-colors mb-8"
        >
          <RestartOutline className="w-4 h-4" />
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
        </button>

        <p className="text-md3-body-md text-slate-500">
          Wrong email?{' '}
          <Link
            to={type === 'signup' ? '/sign-up' : '/forgot-password'}
            className="text-blue font-semibold"
          >
            {type === 'signup' ? 'Sign up again' : 'Try a different email'}
          </Link>
        </p>

        <p className="text-md3-body-md text-slate-500 mt-3">
          <Link to="/sign-in" className="text-blue font-semibold">Back to Sign In</Link>
        </p>
      </div>
    </div>
  )
}
