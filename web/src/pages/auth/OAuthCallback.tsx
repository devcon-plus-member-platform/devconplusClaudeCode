import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { DangerTriangleOutline } from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import { callRateLimit } from '../../stores/useAuthStore'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

const ORGANIZER_ROLES = ['chapter_officer', 'hq_admin', 'super_admin']
const TIMEOUT_MS = 10_000

function isSafeReturnTo(url: string | null): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
}

function friendlyOAuthError(code: string | null): string {
  if (!code) return 'Google sign-in failed. Please try again.'
  if (code === 'access_denied') return 'You cancelled Google sign-in. You can try again below.'
  if (code === 'server_error') return 'Google returned a server error. Please try again in a moment.'
  if (code === 'rate_limited') return 'Too many sign-up attempts from this network. Please try again later.'
  return 'Google sign-in failed. Please try again.'
}

export default function OAuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const navigated = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [error, setError] = useState<string | null>(() => {
    // Supabase appends ?error= when OAuth fails (e.g. user cancels consent)
    const code = searchParams.get('error')
    return code ? friendlyOAuthError(code) : null
  })

  useEffect(() => {
    // If there's already an error in the URL, don't wait for a session
    if (error) return

    async function redirect(userId: string) {
      if (navigated.current) return
      navigated.current = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)

      const { data: profile } = await supabase
        .from('profiles')
        .select('chapter_id, username, role')
        .eq('id', userId)
        .maybeSingle()

      // Branch 1: incomplete profile → new user, gate with rate limit
      if (!profile || !profile.chapter_id || !profile.username) {
        const rl = await callRateLimit('oauth_signup')
        if (!rl.allowed) {
          await supabase.auth.signOut()
          navigated.current = false
          setError('rate_limited')
          return
        }
        navigate('/sign-up', { replace: true })
        return
      }

      // Branch 2: fully set up user
      const savedReturnTo = sessionStorage.getItem('devcon_returnTo')
      if (savedReturnTo) sessionStorage.removeItem('devcon_returnTo')

      if (ORGANIZER_ROLES.includes(profile.role ?? '')) {
        navigate('/organizer', { replace: true })
      } else {
        navigate(isSafeReturnTo(savedReturnTo) ? savedReturnTo : '/home', { replace: true })
      }
    }

    // Timeout fallback — if SIGNED_IN never fires, show an error instead of spinning forever
    timeoutRef.current = setTimeout(() => {
      if (!navigated.current) {
        setError('Sign-in timed out. Please check your connection and try again.')
      }
    }, TIMEOUT_MS)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        void redirect(session.user.id)
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) void redirect(session.user.id)
    })

    return () => {
      subscription.unsubscribe()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [navigate, error])

  if (error) {
    return (
      <div className="min-h-screen bg-blue flex flex-col">
        <div className="bg-blue px-4 pt-16 pb-10 text-center">
          <img src={logoHorizontal} alt="DEVCON+" className="h-7 w-auto mx-auto" />
        </div>

        <div className="flex-1 bg-slate-50 rounded-t-3xl px-4 pt-12 pb-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-red/10 flex items-center justify-center mb-4">
            <DangerTriangleOutline className="w-7 h-7" color="#EF4444" />
          </div>
          <p className="text-md3-body-lg font-bold text-slate-800 mb-2">Sign-in failed</p>
          <p className="text-md3-body-md text-slate-500 mb-8 max-w-xs">{error}</p>
          <Link
            to="/sign-in"
            replace
            className="w-full max-w-xs bg-blue text-white font-bold py-4 rounded-2xl text-center hover:bg-blue-dark transition-colors"
          >
            Back to Sign In
          </Link>
          <Link
            to="/sign-up"
            replace
            className="w-full max-w-xs mt-3 border border-slate-200 bg-white text-slate-700 font-bold py-4 rounded-2xl text-center hover:bg-slate-50 transition-colors"
          >
            Create an Account
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-blue/10 flex items-center justify-center mx-auto animate-pulse">
          <svg width="24" height="24" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.84H9v3.48h4.844a4.14 4.14 0 01-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
          </svg>
        </div>
        <p className="text-slate-500 text-md3-body-md font-medium">Signing you in…</p>
      </div>
    </div>
  )
}
