import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircleOutline, CloseCircleOutline, LinkOutline } from 'solar-icon-set'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { useChaptersStore } from '../../stores/useChaptersStore'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

const USERNAME_RE = /^[a-z0-9_]+$/

const optionalUrl = z.string().url('Must be a valid URL').or(z.literal('')).optional()

const schema = z.object({
  full_name:         z.string().min(2, 'Name required').max(100, 'Name must be under 100 characters'),
  username:          z.string().min(3, 'Min 3 characters').max(20, 'Max 20 characters').regex(USERNAME_RE, 'Only lowercase letters, numbers, underscores'),
  school_or_company: z.string().max(100, 'Must be under 100 characters').optional(),
  linkedin_url:      optionalUrl,
  github_url:        optionalUrl,
  portfolio_url:     optionalUrl,
  chapter_id:        z.string().min(1, 'Please select your chapter'),
})
type FormData = z.infer<typeof schema>

export default function OAuthProfileComplete() {
  const navigate = useNavigate()
  const { checkUsernameAvailable } = useAuthStore()
  const { chapters, fetchChapters } = useChaptersStore()
  const [formError, setFormError] = useState<string | null>(null)
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => { void fetchChapters() }, [fetchChapters])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const meta = session.user.user_metadata
      const googleName = (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? ''
      reset({ full_name: googleName, username: '', school_or_company: '', linkedin_url: '', github_url: '', portfolio_url: '', chapter_id: '' })
    })
  }, [reset])

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
      setFormError(usernameStatus === 'checking' ? 'Please wait for username check to complete.' : 'Username is already taken.')
      return
    }
    setFormError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/sign-in', { replace: true }); return }

    const meta = session.user.user_metadata

    const { error } = await supabase.from('profiles').upsert({
      id:                session.user.id,
      full_name:         data.full_name,
      username:          data.username.toLowerCase(),
      email:             session.user.email ?? '',
      chapter_id:        data.chapter_id,
      school_or_company: data.school_or_company || null,
      avatar_url:        (meta.avatar_url as string | undefined) ?? null,
      linkedin_url:      data.linkedin_url  || null,
      github_url:        data.github_url    || null,
      portfolio_url:     data.portfolio_url || null,
      role:              'member',
      // spendable_points and lifetime_points are managed by DB triggers — never overwrite them here
    }, { onConflict: 'id', ignoreDuplicates: false })

    if (error) {
      setFormError('Something went wrong saving your profile. Please try again.')
      return
    }

    // Initialize store so OrganizerCodeGate can read user + initials
    await useAuthStore.getState().initialize()

    navigate('/home', { replace: true }) // was: navigate('/organizer-code-gate') — temporarily disabled
  }

  return (
    <div className="min-h-screen bg-blue flex flex-col">
      <div className="bg-blue px-4 pt-16 pb-10 text-center">
        <img src={logoHorizontal} alt="DEVCON+" className="h-7 w-auto mx-auto" />
        <p className="text-white/60 mt-3 text-md3-body-md">Complete your profile to continue</p>
      </div>

      <div className="flex-1 bg-slate-50 rounded-t-3xl px-4 pt-8 pb-10 overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Full Name — pre-filled from Google */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Full Name</label>
            <input
              {...register('full_name')}
              type="text"
              placeholder="Juan dela Cruz"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
            />
            {errors.full_name && <p className="text-red text-md3-label-md mt-1">{errors.full_name.message}</p>}
          </div>

          {/* Username */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-md3-body-md select-none">@</span>
              <input
                {...register('username', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleUsernameChange(e.target.value),
                })}
                type="text"
                placeholder="juan_delacruz"
                autoCapitalize="none"
                className="w-full border border-slate-200 rounded-xl pl-8 pr-10 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === 'checking' && <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-400 rounded-full animate-spin" />}
                {usernameStatus === 'available' && <CheckCircleOutline className="w-4 h-4" color="#21C45D" />}
                {usernameStatus === 'taken' && <CloseCircleOutline className="w-4 h-4" color="#EF4444" />}
              </span>
            </div>
            {errors.username && <p className="text-red text-md3-label-md mt-1">{errors.username.message}</p>}
            {usernameStatus === 'taken' && !errors.username && <p className="text-red text-md3-label-md mt-1">Username already taken</p>}
            {usernameStatus === 'available' && <p className="text-green text-md3-label-md mt-1">Username available!</p>}
          </div>

          {/* School / Company */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
              School / Company <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              {...register('school_or_company')}
              type="text"
              placeholder="University of Santo Tomas"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
            />
          </div>

          {/* Social Links */}
          <div className="space-y-3">
            <p className="text-md3-body-md font-medium text-slate-700 flex items-center gap-1.5">
              <LinkOutline className="w-4 h-4" color="#94A3B8" />
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

          {/* Chapter */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Chapter</label>
            <select
              {...register('chapter_id')}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-blue"
            >
              <option value="">Select your chapter…</option>
              {['Luzon', 'Visayas', 'Mindanao'].map((region) => {
                const group = chapters.filter((c) => c.region === region)
                if (!group.length) return null
                return (
                  <optgroup key={region} label={region}>
                    {group.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                )
              })}
            </select>
            {errors.chapter_id && <p className="text-red text-md3-label-md mt-1">{errors.chapter_id.message}</p>}
          </div>

          {formError && (
            <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">{formError}</p>
          )}

          <Turnstile
            ref={turnstileRef}
            siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''}
            onSuccess={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken(null)}
            onError={() => setTurnstileToken(null)}
          />

          <button
            type="submit"
            disabled={isSubmitting || usernameStatus === 'taken' || usernameStatus === 'checking' || !turnstileToken}
            className="w-full bg-blue text-white font-bold py-4 rounded-2xl disabled:opacity-60 hover:bg-blue-dark transition-colors"
          >
            {isSubmitting ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
