import { useState, useCallback, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircleOutline, CloseCircleOutline } from 'solar-icon-set'
import { useAuthStore } from '../../stores/useAuthStore'
import { useChaptersStore } from '../../stores/useChaptersStore'
import LegalModal, { type LegalModalType } from '../../components/LegalModal'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

const USERNAME_RE = /^[a-z0-9_]+$/

const schema = z.object({
  full_name:  z.string().min(2, 'Name required').max(100, 'Name must be under 100 characters'),
  username:   z.string().min(3, 'Min 3 characters').max(20, 'Max 20 characters').regex(USERNAME_RE, 'Only lowercase letters, numbers, underscores'),
  chapter_id: z.string().min(1, 'Please select your chapter'),
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

function isSafeReturnTo(url: string | null): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
}

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

/**
 * Profile completion for OAuth (Google) users. The Firebase exchange creates a
 * profile row with a null username; this page collects the missing username +
 * chapter and persists them via the NestJS backend (no Supabase Auth / direct
 * table writes). Reached only via the layout completeness guard.
 */
export default function CompleteProfile() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo')

  const user = useAuthStore((s) => s.user)
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const completeProfile = useAuthStore((s) => s.completeProfile)
  const checkUsernameAvailable = useAuthStore((s) => s.checkUsernameAvailable)
  const { chapters, isLoading: chaptersLoading, error: chaptersError, fetchChapters } = useChaptersStore()

  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [formError, setFormError] = useState<string | null>(null)
  const [legalModal, setLegalModal] = useState<LegalModalType | null>(null)
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', username: '', chapter_id: '' },
  })

  useEffect(() => { void fetchChapters() }, [fetchChapters])

  // Guard: only members with an incomplete profile belong here. Wait for
  // initialization so a not-yet-loaded session doesn't bounce us to /sign-in.
  useEffect(() => {
    if (!isInitialized) return
    if (!user) { navigate('/sign-in', { replace: true }); return }
    if (user.username && user.chapter_id) {
      navigate(isSafeReturnTo(returnTo) ? returnTo : '/home', { replace: true })
    }
  }, [isInitialized, user, navigate, returnTo])

  // Prefill from the created profile once the user is loaded.
  useEffect(() => {
    if (!user) return
    setValue('full_name', user.full_name ?? '')
    setValue('chapter_id', user.chapter_id ?? '')
  }, [user, setValue])

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
          ? 'Please wait for the username check to complete.'
          : 'Username is already taken.',
      )
      return
    }
    setFormError(null)
    try {
      await completeProfile({
        full_name:  data.full_name,
        username:   data.username.toLowerCase(),
        chapter_id: data.chapter_id,
      })
      const role = useAuthStore.getState().user?.role
      if (isSafeReturnTo(returnTo)) navigate(returnTo, { replace: true })
      else navigate(role === 'super_admin' || role === 'hq_admin' ? '/admin' : '/home', { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="flex flex-col pointer-events-none">
        <div
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[48px] pt-16 text-center"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat',
          }}
        >
          <img src={logoHorizontal} alt="DEVCON+" className="h-8 w-auto mx-auto relative z-10" />
          <p className="text-white/60 mt-3 text-md3-body-md font-proxima relative z-10 uppercase tracking-widest font-bold">
            Complete your profile
          </p>
        </div>
      </header>

      <div className="px-4 pt-10 pb-10 overflow-y-auto">
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
                {...register('username', { onChange: (e) => handleUsernameChange(e.target.value) })}
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
            <div className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 text-md3-body-md text-slate-500 flex items-center gap-2">
              <GoogleIcon />
              <span>{user?.email ?? ''}</span>
            </div>
          </div>

          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Nearest Chapter</label>
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

          <p className="text-md3-label-md text-slate-400 text-center">
            By completing your profile you agree to our{' '}
            <button type="button" onClick={() => setLegalModal('terms')} className="text-blue underline">Terms &amp; Conditions</button>
            {' '}and{' '}
            <button type="button" onClick={() => setLegalModal('privacy')} className="text-blue underline">Privacy Policy</button>.
          </p>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary text-white font-bold py-3 rounded-full shadow-sm disabled:opacity-60 hover:bg-blue-dark transition-colors"
          >
            {isSubmitting ? 'Completing…' : 'Complete Profile'}
          </button>
        </form>
      </div>

      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  )
}
