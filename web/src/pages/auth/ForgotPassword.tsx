import { useState, useRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/useAuthStore'
import logoHorizontal from '../../assets/logos/logo-horizontal.svg'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})
type FormData = z.infer<typeof schema>

export default function ForgotPassword() {
  const navigate = useNavigate()
  const { resetPassword } = useAuthStore()
  const [formError, setFormError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setFormError(null)
    try {
      await resetPassword(data.email, turnstileToken ?? undefined)
      navigate('/email-sent', { state: { email: data.email, type: 'reset' } })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      turnstileRef.current?.reset()
      setTurnstileToken(null)
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
              Reset your password
            </p>
          </div>
        </header>

        {/* Card */}
        <div className="px-4 pt-10 pb-10">
        <h2 className="text-md3-title-lg font-black text-slate-900 mb-1">Forgot Password?</h2>
        <p className="text-md3-body-md text-slate-500 mb-6">
          Enter your email and we'll send you a link to reset your password.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              placeholder="juan@devcon.ph"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-blue"
            />
            {errors.email && (
              <p className="text-red text-md3-label-md mt-1">{errors.email.message}</p>
            )}
          </div>

          {formError && (
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
            {isSubmitting ? 'Sending link…' : 'Send Reset Link'}
          </button>
        </form>

        <p className="text-center text-md3-body-md text-slate-500 mt-6">
          Remember your password?{' '}
          <Link to="/sign-in" className="text-blue font-semibold">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
