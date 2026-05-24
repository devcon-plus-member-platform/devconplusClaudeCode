import { useRef, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeftOutline, CameraOutline, CheckCircleOutline, CloseCircleOutline, LetterOutline, LockOutline, MapPointOutline, ShieldCheckOutline, LinkOutline } from 'solar-icon-set'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import PasswordConfirmModal from '../../components/PasswordConfirmModal'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Chapter { id: string; name: string; region: string }

const USERNAME_RE = /^[a-z0-9_]+$/

const optionalUrl = z.string().url('Must be a valid URL').or(z.literal('')).optional()

const profileSchema = z.object({
  full_name:         z.string().min(2, 'Name required').max(100, 'Name must be under 100 characters'),
  username:          z.string().min(3, 'Min 3 characters').max(20, 'Max 20 characters').regex(USERNAME_RE, 'Only lowercase letters, numbers, underscores'),
  school_or_company: z.string().max(100, 'Must be under 100 characters').optional(),
  linkedin_url:      optionalUrl,
  github_url:        optionalUrl,
  portfolio_url:     optionalUrl,
})
type ProfileFormData = z.infer<typeof profileSchema>

const emailSchema = z.object({
  new_email: z.string().email('Invalid email'),
})
type EmailFormData = z.infer<typeof emailSchema>

const passwordSchema = z.object({
  new_password:     z.string().min(8, 'At least 8 characters').max(128),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})
type PasswordFormData = z.infer<typeof passwordSchema>

// ── Component ─────────────────────────────────────────────────────────────────

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfileEdit() {
  const navigate = useNavigate()
  const { user, initials, updateProfile, uploadAvatar, updateEmail, updatePassword, requestOrganizerUpgrade, checkUsernameAvailable } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])

  // Username availability
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [usernameTimer, setUsernameTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  // Modal state — 'email' | 'password' | 'chapter' | null
  const [activeModal, setActiveModal] = useState<'email' | 'password' | 'chapter' | null>(null)
  const [pendingNewEmail, setPendingNewEmail] = useState('')
  const [pendingNewPassword, setPendingNewPassword] = useState('')
  const [pendingChapterId, setPendingChapterId] = useState('')
  const [chapterSuccess, setChapterSuccess] = useState(false)
  // Tracks the displayed chapter value (may differ from saved until confirmed)
  const [selectedChapterId, setSelectedChapterId] = useState(user?.chapter_id ?? '')
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Organizer upgrade
  const [upgradeCode, setUpgradeCode] = useState('')
  const [upgradeStatus, setUpgradeStatus] = useState<'idle' | 'loading' | 'submitted' | 'invalid_code' | 'wrong_chapter' | 'already_pending' | 'error' | 'rate_limited'>('idle')
  // Client-side rate limiting (UX convenience only — server enforcement via Supabase GoTrue)
  const upgradeFailedAttempts = useRef(0)
  const upgradeLockedUntil    = useRef<number>(0)

  // Save state
  const [saveError, setSaveError] = useState<string | null>(null)

  // Load chapters
  useEffect(() => {
    supabase.from('chapters').select('id, name, region').order('name').then(({ data }) => {
      if (data) setChapters(data as Chapter[])
    })
  }, [])

  // CheckCircleOutline if upgrade already pending on mount
  useEffect(() => {
    if (user?.pending_role) setUpgradeStatus('already_pending')
  }, [user?.pending_role])

  // ── Profile form ─────────────────────────────────────────────────────────────

  const { register, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name:         user?.full_name ?? '',
      username:          user?.username ?? '',
      school_or_company: user?.school_or_company ?? '',
      linkedin_url:      user?.linkedin_url  ?? '',
      github_url:        user?.github_url    ?? '',
      portfolio_url:     user?.portfolio_url ?? '',
    },
  })

  const watchedUsername = watch('username')

  const handleUsernameChange = useCallback((value: string) => {
    if (usernameTimer) clearTimeout(usernameTimer)
    if (!value || value.length < 3 || !USERNAME_RE.test(value) || value === user?.username) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    const t = setTimeout(async () => {
      const available = await checkUsernameAvailable(value)
      setUsernameStatus(available ? 'available' : 'taken')
    }, 400)
    setUsernameTimer(t)
  }, [usernameTimer, checkUsernameAvailable, user?.username])

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setAvatarPreview(objectUrl)
    setAvatarError(null)
    setAvatarUploading(true)
    try {
      const avatarUrl = await uploadAvatar(file)
      await updateProfile({ avatar_url: avatarUrl })
      setAvatarPreview(avatarUrl)
    } catch {
      setAvatarError('Upload failed. Photo not saved.')
    } finally {
      setAvatarUploading(false)
      URL.revokeObjectURL(objectUrl)
    }
  }

  const onSaveProfile = async (data: ProfileFormData) => {
    if (usernameStatus === 'taken') { setSaveError('Username is already taken'); return }
    setSaveError(null)
    try {
      await updateProfile({
        full_name: data.full_name,
        username: data.username,
        school_or_company: data.school_or_company ?? '',
        linkedin_url:  data.linkedin_url  || null,
        github_url:    data.github_url    || null,
        portfolio_url: data.portfolio_url || null,
      })
      navigate('/profile')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  // ── Email & Password forms ────────────────────────────────────────────────────

  const emailForm = useForm<EmailFormData>({ resolver: zodResolver(emailSchema) })
  const passwordForm = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) })

  const handleChangeEmail = (data: EmailFormData) => {
    setPendingNewEmail(data.new_email)
    setActiveModal('email')
  }

  const handleChangePassword = (data: PasswordFormData) => {
    setPendingNewPassword(data.new_password)
    setActiveModal('password')
  }

  const handleChapterChange = (chapterId: string) => {
    setPendingChapterId(chapterId)
    setChapterSuccess(false)
    setActiveModal('chapter')
  }

  // ── Organizer upgrade ─────────────────────────────────────────────────────────

  const handleUpgradeSubmit = async () => {
    const trimmed = upgradeCode.trim()
    if (!trimmed) return
    const ORGANIZER_CODE_RE = /^[A-Z0-9-]{6,20}$/
    if (!ORGANIZER_CODE_RE.test(trimmed)) {
      setUpgradeStatus('invalid_code')
      return
    }
    const now = Date.now()
    if (now < upgradeLockedUntil.current) {
      setUpgradeStatus('rate_limited')
      return
    }
    setUpgradeStatus('loading')
    try {
      const result = await requestOrganizerUpgrade(trimmed)
      if (result === 'invalid_code') {
        upgradeFailedAttempts.current += 1
        if (upgradeFailedAttempts.current >= 5) {
          upgradeLockedUntil.current    = Date.now() + 60_000
          upgradeFailedAttempts.current = 0
          setUpgradeStatus('rate_limited')
        } else {
          setUpgradeStatus('invalid_code')
        }
        return
      }
      upgradeFailedAttempts.current = 0
      setUpgradeStatus(result ?? 'submitted')
    } catch {
      setUpgradeStatus('error')
    }
  }

  const displayInitials = user ? initials : ''

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex flex-col pointer-events-none">
        {/* ── Blue Background Container ── */}
        <div 
          className="bg-primary relative overflow-hidden z-0 pointer-events-auto pb-[24px] pt-14"
          style={{ 
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundPosition: 'top center',
            backgroundRepeat: 'repeat'
          }}
        >
          {/* Header Row: Back + Title */}
          <div className="relative z-10 flex items-center gap-3 px-4 pb-4">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
            >              <ArrowLeftOutline className="w-5 h-5" color="white" />
            </button>
            <h1 className="text-white text-[24px] font-semibold font-proxima leading-none tracking-tight">
              Edit Profile
            </h1>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-6 pb-24 md:max-w-4xl md:mx-auto">

        {/* ── PROFILE FORM ── */}
        <form id="profile-form" onSubmit={handleSubmit(onSaveProfile)} className="space-y-4">

          {/* Avatar picker */}
          <div className="flex flex-col items-center pt-2 pb-1 gap-1">
            <button
              type="button"
              onClick={() => !avatarUploading && fileInputRef.current?.click()}
              className="relative"
              disabled={avatarUploading}
            >
              <div className="w-32 h-32 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-md3-display-sm font-black text-primary">{displayInitials}</span>
                )}
              </div>
              {avatarUploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {!avatarUploading && (
                <div className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  <CameraOutline className="w-4 h-4" color="white" />
                </div>
              )}
            </button>
            {avatarError && (
              <p className="text-red text-md3-label-md flex items-center gap-1">
                <CloseCircleOutline className="w-3.5 h-3.5" />{avatarError}
              </p>
            )}
            {avatarUploading && (
              <p className="text-md3-label-md text-slate-400">Uploading photo…</p>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handlePhotoChange(e)} />
          </div>

          {/* Full Name */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">Full Name</label>
            <input
              {...register('full_name')}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
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
                  onChange: (e) => handleUsernameChange(e.target.value),
                })}
                className="w-full border border-slate-200 rounded-xl pl-8 pr-10 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameStatus === 'checking' && <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-400 rounded-full animate-spin" />}
                {usernameStatus === 'available' && <CheckCircleOutline className="w-4 h-4" color="#21C45D" />}
                {(usernameStatus === 'taken' || (watchedUsername === user?.username)) && usernameStatus !== 'available' && usernameStatus !== 'checking' && watchedUsername === user?.username && (
                  <CheckCircleOutline className="w-4 h-4" color="#CBD5E1" />
                )}
                {usernameStatus === 'taken' && watchedUsername !== user?.username && <CloseCircleOutline className="w-4 h-4" color="#EF4444" />}
              </span>
            </div>
            {errors.username && <p className="text-red text-md3-label-md mt-1">{errors.username.message}</p>}
            {usernameStatus === 'taken' && watchedUsername !== user?.username && !errors.username && (
              <p className="text-red text-md3-label-md mt-1">Username already taken</p>
            )}
          </div>

          {/* School / Company */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
              School / Company <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              {...register('school_or_company')}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.linkedin_url && <p className="text-red text-md3-label-md mt-1">{errors.linkedin_url.message}</p>}
            </div>
            <div>
              <label className="text-md3-label-md text-slate-500 block mb-1">GitHub</label>
              <input
                {...register('github_url')}
                type="url"
                placeholder="https://github.com/yourusername"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.github_url && <p className="text-red text-md3-label-md mt-1">{errors.github_url.message}</p>}
            </div>
            <div>
              <label className="text-md3-label-md text-slate-500 block mb-1">Portfolio</label>
              <input
                {...register('portfolio_url')}
                type="url"
                placeholder="https://yourportfolio.com"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.portfolio_url && <p className="text-red text-md3-label-md mt-1">{errors.portfolio_url.message}</p>}
            </div>
          </div>

          {/* Chapter — password gated (managed outside RHF) */}
          <div>
            <label className="text-md3-body-md font-medium text-slate-700 block mb-1">
              Chapter <span className="text-[10px] font-normal text-slate-400 ml-1">requires password</span>
            </label>
            <select
              value={selectedChapterId}
              onChange={(e) => {
                const val = e.target.value
                setSelectedChapterId(val)
                if (val !== (user?.chapter_id ?? '')) {
                  handleChapterChange(val)
                }
              }}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-md3-body-md bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select chapter…</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.region})</option>
              ))}
            </select>
            {chapterSuccess ? (
              <p className="text-green text-md3-label-md mt-1 flex items-center gap-1">
                <CheckCircleOutline className="w-3.5 h-3.5" /> Chapter updated successfully.
              </p>
            ) : (
              <p className="text-md3-label-md text-slate-400 mt-1 flex items-center gap-1">
                <MapPointOutline className="w-3 h-3" />
                Changing chapter requires password confirmation
              </p>
            )}
          </div>

        </form>

        {/* ── SENSITIVE SETTINGS CARD ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-md3-label-md font-bold text-slate-500 uppercase tracking-wider">Account Security</p>
          </div>

          {/* Change Email */}
          <div className="px-4 py-4 border-b border-slate-100">
            <p className="text-md3-body-md font-semibold text-slate-900 mb-0.5 flex items-center gap-2">
              <LetterOutline className="w-4 h-4" color="#94A3B8" />
              Change Email
              <span className="text-[10px] font-normal text-slate-400 ml-1">requires password</span>
            </p>
            <p className="text-md3-label-md text-slate-400 mb-3">Current: {user?.email}</p>
            {emailSuccess ? (
              <p className="text-green text-md3-label-md flex items-center gap-1"><CheckCircleOutline className="w-3.5 h-3.5" /> CheckCircleOutline your new email to confirm the change.</p>
            ) : (
              <form onSubmit={emailForm.handleSubmit(handleChangeEmail)} className="flex gap-2">
                <input
                  {...emailForm.register('new_email')}
                  type="email"
                  placeholder="New email address"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button type="submit" className="px-4 py-2.5 bg-primary text-white text-md3-body-md font-bold rounded-xl shrink-0">
                  Update
                </button>
              </form>
            )}
            {emailForm.formState.errors.new_email && (
              <p className="text-red text-md3-label-md mt-1">{emailForm.formState.errors.new_email.message}</p>
            )}
          </div>

          {/* Change Password */}
          <div className="px-4 py-4">
            <p className="text-md3-body-md font-semibold text-slate-900 mb-0.5 flex items-center gap-2">
              <LockOutline className="w-4 h-4" color="#94A3B8" />
              Change Password
              <span className="text-[10px] font-normal text-slate-400 ml-1">requires current password</span>
            </p>
            {passwordSuccess ? (
              <p className="text-green text-md3-label-md flex items-center gap-1 mt-2"><CheckCircleOutline className="w-3.5 h-3.5" /> Password updated successfully.</p>
            ) : (
              <form onSubmit={passwordForm.handleSubmit(handleChangePassword)} className="space-y-2 mt-3">
                <input
                  {...passwordForm.register('new_password')}
                  type="password"
                  placeholder="New password (min 8 characters)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {passwordForm.formState.errors.new_password && (
                  <p className="text-red text-md3-label-md">{passwordForm.formState.errors.new_password.message}</p>
                )}
                <input
                  {...passwordForm.register('confirm_password')}
                  type="password"
                  placeholder="Confirm new password"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {passwordForm.formState.errors.confirm_password && (
                  <p className="text-red text-md3-label-md">{passwordForm.formState.errors.confirm_password.message}</p>
                )}
                <button type="submit" className="w-full bg-slate-900 text-white text-md3-body-md font-bold py-3 rounded-xl mt-1">
                  Update Password
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ── ORGANIZER UPGRADE CARD (members only) ── */}
        {user?.role === 'member' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-md3-label-md font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheckOutline className="w-3.5 h-3.5" />
                Become an Organizer
              </p>
            </div>
            <div className="px-4 py-4">
              {upgradeStatus === 'already_pending' || upgradeStatus === 'submitted' ? (
                <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl p-3">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mt-0.5 shrink-0" />
                  <div>
                    <p className="text-md3-body-md font-semibold text-primary">Upgrade request pending</p>
                    <p className="text-md3-label-md text-slate-500 mt-0.5">Awaiting super admin approval. You'll have organizer access once approved.</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-md3-body-md text-slate-500 mb-3">
                    Enter your organizer code to request access. The code must match your chapter.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={upgradeCode}
                      onChange={(e) => { setUpgradeCode(e.target.value.toUpperCase()); setUpgradeStatus('idle') }}
                      placeholder="DCN-XXX-0000"
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-md3-body-md font-mono focus:outline-none focus:ring-2 focus:ring-primary uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => void handleUpgradeSubmit()}
                      disabled={upgradeStatus === 'loading' || upgradeStatus === 'rate_limited' || !upgradeCode.trim()}
                      className="px-4 py-2.5 bg-primary text-white text-md3-body-md font-bold rounded-xl shrink-0 disabled:opacity-60"
                    >
                      {upgradeStatus === 'loading' ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Submit'}
                    </button>
                  </div>
                  {upgradeStatus === 'invalid_code' && (
                    <p className="text-red text-md3-label-md mt-2 flex items-center gap-1"><CloseCircleOutline className="w-3.5 h-3.5" /> Invalid or inactive organizer code.</p>
                  )}
                  {upgradeStatus === 'wrong_chapter' && (
                    <p className="text-red text-md3-label-md mt-2 flex items-center gap-1"><CloseCircleOutline className="w-3.5 h-3.5" /> This code belongs to a different chapter. Make sure your chapter is set correctly first.</p>
                  )}
                  {upgradeStatus === 'error' && (
                    <p className="text-red text-md3-label-md mt-2">Something went wrong. Please try again.</p>
                  )}
                  {upgradeStatus === 'rate_limited' && (
                    <p className="text-red text-md3-label-md mt-2 flex items-center gap-1"><CloseCircleOutline className="w-3.5 h-3.5" /> Too many attempts. Please wait 60 seconds before trying again.</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── SAVE BUTTON — always at bottom ── */}
        {saveError && (
          <p className="text-red text-md3-label-md bg-red/5 border border-red/20 rounded-lg px-3 py-2">{saveError}</p>
        )}
        <button
          type="submit"
          form="profile-form"
          disabled={isSubmitting}
          className="w-full bg-primary text-white font-bold py-4 rounded-2xl disabled:opacity-60"
        >
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </button>

      </div>

      {/* ── PASSWORD CONFIRM MODALS ── */}

      {activeModal === 'email' && (
        <PasswordConfirmModal
          title="Confirm Email Change"
          description={`Enter your current password to change your email to ${pendingNewEmail}.`}
          confirmLabel="Change Email"
          onConfirm={async (password) => {
            await updateEmail(pendingNewEmail, password)
            setEmailSuccess(true)
            emailForm.reset()
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'password' && (
        <PasswordConfirmModal
          title="Confirm Password Change"
          description="Enter your current password to set a new one."
          confirmLabel="Update Password"
          onConfirm={async (currentPassword) => {
            await updatePassword(pendingNewPassword, currentPassword)
            setPasswordSuccess(true)
            passwordForm.reset()
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'chapter' && (
        <PasswordConfirmModal
          title="Confirm Chapter Change"
          description={`Switch to ${chapters.find((c) => c.id === pendingChapterId)?.name ?? 'selected chapter'}? This may affect organizer code eligibility. Enter your password to confirm.`}
          confirmLabel="Change Chapter"
          onConfirm={async (password) => {
            // Always use the live auth session email — profile.email may be stale
            const { data: sessionData } = await supabase.auth.getSession()
            const authEmail = sessionData.session?.user.email ?? user?.email ?? ''
            const { error } = await supabase.auth.signInWithPassword({
              email: authEmail,
              password,
            })
            if (error) {
              if (error.status === 429 || error.message.toLowerCase().includes('rate')) {
                throw new Error('Too many attempts. Please wait a moment and try again.')
              }
              throw new Error('Incorrect password')
            }
            await updateProfile({ chapter_id: pendingChapterId || undefined })
            setChapterSuccess(true)
          }}
          onClose={() => {
            // Reset the select display back to the currently saved chapter
            setSelectedChapterId(user?.chapter_id ?? '')
            setActiveModal(null)
          }}
        />
      )}

    </div>
  )
}
