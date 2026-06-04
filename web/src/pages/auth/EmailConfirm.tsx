import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { CheckCircleOutline, CloseCircleOutline } from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

type Status = 'verifying' | 'confirmed' | 'error'

export default function EmailConfirm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const statusParam = searchParams.get('status')   // 'success' | 'error' (Firebase path)
    const reasonParam = searchParams.get('reason')   // 'expired' | 'invalid' | undefined
    const rawToken    = searchParams.get('token')    // NestJS bridge JWT (fallback: old email links)

    function onConfirmed() {
      setStatus('confirmed')
      const savedReturnTo = localStorage.getItem('devcon_returnTo')
      if (savedReturnTo) localStorage.removeItem('devcon_returnTo')
      const destination = (typeof savedReturnTo === 'string' && savedReturnTo.startsWith('/') && !savedReturnTo.startsWith('//'))
        ? savedReturnTo
        : '/home'
      setTimeout(() => navigate(destination), 2000)
    }

    function onFailed(msg?: string) {
      setErrorMsg(msg ?? 'Link expired or already used. Please sign up again.')
      setStatus('error')
    }

    // ── Firebase custom email verification path ──────────────────────────
    // NestJS GET /auth/email/verify redirects here with ?status=success|error
    if (statusParam === 'success') {
      onConfirmed()
      return
    }
    if (statusParam === 'error') {
      const msg = reasonParam === 'expired'
        ? 'This verification link has expired. Please request a new one.'
        : 'This verification link is invalid. Please sign up again.'
      onFailed(msg)
      return
    }

    // ── NestJS bridge JWT fallback ───────────────────────────────────────
    // Old email links pointed to APP_URL/email-confirm?token=<JWT> instead of
    // SERVER_URL/auth/email/verify?token=<JWT>. Redirect to the backend endpoint
    // so it can verify and redirect back with ?status=success|error.
    if (rawToken) {
      const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'
      window.location.replace(`${apiUrl}/auth/email/verify?token=${encodeURIComponent(rawToken)}`)
      return
    }

    // Implicit flow — detectSessionInUrl:true has already exchanged the hash fragment.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { onConfirmed(); return }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') {
          subscription.unsubscribe()
          clearTimeout(timeout)
          onConfirmed()
        }
      })

      const timeout = setTimeout(() => {
        subscription.unsubscribe()
        onFailed()
      }, 8000)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
            Email Confirmation
          </p>
        </div>
      </header>

      <div className="flex-1 px-4 pt-10 pb-10 flex flex-col items-center text-center">
        {status === 'verifying' && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-6 h-6 border-2 border-blue/30 border-t-blue rounded-full animate-spin" />
            <p className="text-md3-body-md text-slate-400">Confirming your email…</p>
          </div>
        )}

        {status === 'confirmed' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-green/10 flex items-center justify-center mb-5 mt-4">
              <CheckCircleOutline className="w-8 h-8" color="#21C45D" />
            </div>
            <h2 className="text-md3-title-lg font-black text-slate-900 mb-2">Email Confirmed!</h2>
            <p className="text-md3-body-md text-slate-500">Your account is ready. Redirecting you now…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red/10 flex items-center justify-center mb-5 mt-4">
              <CloseCircleOutline className="w-8 h-8" color="#EF4444" />
            </div>
            <h2 className="text-md3-title-lg font-black text-slate-900 mb-2">Confirmation Failed</h2>
            <p className="text-md3-body-md text-slate-500 mb-6 max-w-xs">{errorMsg}</p>
            <Link
              to="/sign-up"
              className="w-full bg-blue text-white font-bold py-4 rounded-2xl text-center block"
            >
              Sign Up Again
            </Link>
            <Link to="/sign-in" className="text-blue font-semibold text-md3-body-md mt-4 block">
              Back to Sign In
            </Link>
          </>
        )}

      </div>
    </div>
  )
}
