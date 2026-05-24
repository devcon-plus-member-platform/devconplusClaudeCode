import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link } from 'react-router-dom'
import { EyeOutline, EyeClosedOutline } from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

const schema = z.object({
  password:        z.string().min(8, 'At least 8 characters'),
  confirmPassword: z.string().min(8, 'At least 8 characters'),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

type PageState = 'waiting' | 'ready' | 'invalid'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [pageState, setPageState] = useState<PageState>('waiting')
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    // CheckCircleOutline for an existing recovery session (e.g. user landed via reset link)
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setPageState('ready'); return }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPageState('ready')
      if (event === 'SIGNED_OUT')        setPageState('invalid')
    })

    // If no event fires within 3s, the link is invalid/expired
    const timeout = setTimeout(() => {
      setPageState((s) => s === 'waiting' ? 'invalid' : s)
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const onSubmit = async (data: FormData) => {
    setFormError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password })
      if (error) throw error
      navigate('/sign-in', { state: { passwordReset: true } })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update password.')
    }
  }

  return (
    <div className="min-h-screen bg-blue flex flex-col">
      {/* Header */}
      <div className="bg-blue px-4 pt-16 pb-10 text-center">
        <img src={logoHorizontal} alt="DEVCON+" className="h-7 w-auto mx-auto" />
        <p className="text-white/60 mt-3 text-md3-body-md">Set a new password</p>
      </div>

      {/* Card */}
      <div className="flex-1 bg-slate-50 rounded-t-3xl px-4 pt-8 pb-10">

        {/* Waiting for Supabase to exchange the token */}
        {pageState === 'waiting' && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-6 h-6 border-2 border-blue/30 border-t-blue rounded-full animate-spin" />
            <p className="text-md3-body-md text-slate-400">Verifying your link…</p>
          </div>
        )}

        {/* Invalid / expired link */}
        {pageState === 'invalid' && (
          <div className="flex flex-col items-center text-center pt-6 gap-4">
            <p className="text-md3-body-lg font-bold text-slate-800">Link expired or invalid</p>
            <p className="text-md3-body-md text-slate-500">
              Password reset links expire after 1 hour. Request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="w-full bg-blue text-white font-bold py-4 rounded-2xl text-center mt-2"
            >
              Request New Link
            </Link>
          </div>
        )}

        {/* Ready — show form */}
        {pageState === 'ready' && (
          <>
            <h2 className="text-md3-title-lg font-black text-slate-900 mb-1">New Password</h2>
            <p className="text-md3-body-md text-slate-500 mb-6">Choose a strong password for your account.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="text-md3-body-md font-medium text-slate-700 block mb-1">New Password</label>
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
                {errors.password && (
                  <p className="text-red text-md3-label-md mt-1">{errors.password.message}</p>
                )}
              </div>

              <div>
                <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Confirm Password</label>
                <div className="relative">
                  <input
                    {...register('confirmPassword')}
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeClosedOutline className="w-4 h-4" /> : <EyeOutline className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-red text-md3-label-md mt-1">{errors.confirmPassword.message}</p>
                )}
              </div>

              {formError && (
                <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue text-white font-bold py-4 rounded-2xl disabled:opacity-60 hover:bg-blue-dark transition-colors"
              >
                {isSubmitting ? 'Updating password…' : 'Set New Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
