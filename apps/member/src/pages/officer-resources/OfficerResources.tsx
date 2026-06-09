import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftOutline,
  ArrowRightUpOutline,
  DocumentTextOutline,
  BookOutline,
  SquareAcademicCapOutline,
  ClipboardListOutline,
  ShareOutline,
  CheckCircleOutline,
} from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useOfficerResourcesStore } from '../../stores/useOfficerResourcesStore'
import { useAuthStore, ORGANIZER_ROLES } from '../../stores/useAuthStore'
import {
  OFFICER_CATEGORY_ORDER,
  officerCategoryFromSlug,
  type OfficerResourceCategory,
  type OfficerLink,
} from '../../lib/officerResources'
import type { SolarIcon } from '../../lib/icons'
import { staggerContainer, cardItem } from '../../lib/animation'
import NotFound from '../NotFound'
import logoMark from '../../assets/logos/logo-mark.svg'

const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

// Per-category icon — mirrors the organizer dashboard quick-action cards.
const CATEGORY_ICON: Record<OfficerResourceCategory, SolarIcon> = {
  resource: BookOutline,
  training: SquareAcademicCapOutline,
  seed_funds: ClipboardListOutline,
}

/**
 * Internal officer-resource page (one per category) at /officer-resources/:slug.
 *
 * Access is restricted to chapter officers and HQ / super admins — NOT the public
 * and NOT regular members. Enforced at two layers:
 *   1. RLS on `officer_resources` (see 20260609_officer_resources_restrict_to_officers.sql)
 *      — anon/member reads return nothing, even via the API.
 *   2. The role guard below — redirects non-officers away so they never see the page.
 */
export default function OfficerResources() {
  const { category: slug } = useParams<{ category: string }>()
  const navigate = useNavigate()
  const meta = officerCategoryFromSlug(slug)

  const user = useAuthStore((s) => s.user)
  const isOfficer = !!user && (ORGANIZER_ROLES as readonly string[]).includes(user.role)

  const { resources, trainings, planning, loaded, isLoading, fetch } = useOfficerResourcesStore()
  const [copied, setCopied] = useState(false)

  // Role guard. Auth is already initialized before the router mounts (see App.tsx),
  // so `user` is reliable here: signed-out visitors get sent to sign-in (preserving
  // the destination), and signed-in members are bounced to their home dashboard.
  useEffect(() => {
    if (!user) {
      navigate(`/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`, { replace: true })
    } else if (!isOfficer) {
      navigate('/home', { replace: true })
    }
  }, [user, isOfficer, navigate])

  useEffect(() => {
    if (isOfficer) void fetch()
  }, [isOfficer, fetch])

  // Reset scroll to the top whenever the category changes. The cross-links reuse
  // this same route component (only the :category param changes), so without this
  // a click from the bottom of one page lands scrolled-down on the next — looking
  // like a "blank page" until a manual reload resets scroll.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [slug])

  // Unknown slug → 404 (kept after hooks so hook order stays stable).
  if (!meta) return <NotFound />

  // Non-officers are mid-redirect (see guard effect above) — render nothing to
  // avoid flashing officer content before navigation completes.
  if (!isOfficer) return null

  const linksByCategory: Record<OfficerResourceCategory, OfficerLink[]> = {
    resource: resources,
    training: trainings,
    seed_funds: planning,
  }
  const links = linksByCategory[meta.category]
  const Icon = CATEGORY_ICON[meta.category]

  const openLink = (href: string) => {
    if (!href) return
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — no-op, link is still in the address bar.
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-50">
        <div
          className="bg-[#1152D4] relative overflow-hidden pb-7 pt-12"
          style={{
            clipPath: 'ellipse(100% 100% at 50% 0%)',
            backgroundImage: PATTERN_BG,
            backgroundSize: '60px 60px',
            backgroundRepeat: 'repeat',
          }}
        >
          {/* Top row: back + logo (left), copy-link (right) */}
          <div className="relative z-10 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center active:bg-white/40 transition-colors shadow-sm shrink-0"
                aria-label="Go back"
              >
                <ArrowLeftOutline color="white" size={20} />
              </button>
              <img src={logoMark} alt="DEVCON+" className="h-[24px] w-[42px] object-contain" />
            </div>

            <button
              onClick={() => void copyShareLink()}
              className="flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-white/20 backdrop-blur-md border border-white/30 active:bg-white/40 transition-colors shadow-sm shrink-0"
              aria-label="Share this page"
            >
              {copied ? (
                <CheckCircleOutline color="white" size={18} />
              ) : (
                <ShareOutline color="white" size={18} />
              )}
              <span className="text-white text-md3-label-md font-semibold font-proxima" aria-live="polite">
                {copied ? 'Copied link' : 'Share'}
              </span>
            </button>
          </div>

          {/* Title block */}
          <div className="relative z-10 px-4 mt-5 flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shrink-0 shadow-sm"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
            >
              <Icon color={meta.accent} size={26} />
            </div>
            <div className="min-w-0">
              <p className="text-white/70 text-md3-label-md font-proxima uppercase tracking-widest mb-0.5">
                DEVCON+ Officers
              </p>
              <h1 className="text-white text-[22px] font-bold font-proxima leading-tight">
                {meta.title}
              </h1>
              <p className="text-white/80 text-md3-body-md font-proxima leading-snug mt-1">
                {meta.subtitle}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      {/* key={meta.category} forces a remount when navigating between categories so
          framer-motion replays its entrance animation. Without it the persisted
          <motion.div> leaves newly-mounted link cards stuck at opacity:0 — they
          still take layout space, so the page looks blank until a manual reload. */}
      <div key={meta.category} className="px-4 pt-5 pb-24 md:max-w-2xl md:mx-auto space-y-4">
        {/* Links list */}
        {isLoading && !loaded ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-40" />
                    <div className="h-3 bg-slate-100 rounded w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : links.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue/10 flex items-center justify-center mx-auto mb-3">
              <DocumentTextOutline color="#1152D4" size={28} />
            </div>
            <p className="text-md3-body-lg font-bold text-slate-700">Nothing here yet</p>
            <p className="text-md3-body-md text-slate-400 mt-1">
              Check back soon — resources are on the way.
            </p>
          </div>
        ) : (
          <motion.div
            className="space-y-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {links.map((link) => (
              <motion.button
                key={link.title}
                variants={cardItem}
                whileTap={{ scale: 0.97 }}
                onClick={() => openLink(link.href)}
                className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-card hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-blue/10 flex items-center justify-center shrink-0">
                  <DocumentTextOutline color="#1152D4" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-md3-body-md font-semibold text-slate-900 leading-snug">{link.title}</p>
                  {link.subtitle && (
                    <p className="text-md3-label-md text-slate-400 mt-0.5">{link.subtitle}</p>
                  )}
                </div>
                <ArrowRightUpOutline color="#94A3B8" size={16} />
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* Cross-links to the other officer-resource pages */}
        <div className="pt-2">
          <p className="text-md3-label-md font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">
            More for officers
          </p>
          <div className="space-y-2">
            {OFFICER_CATEGORY_ORDER.filter((m) => m.category !== meta.category).map((m) => {
              const OtherIcon = CATEGORY_ICON[m.category]
              return (
                <button
                  key={m.category}
                  onClick={() => navigate(`/officer-resources/${m.slug}`)}
                  className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50 transition-colors text-left"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${m.accent}1A` }}
                  >
                    <OtherIcon color={m.accent} size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-md3-body-md font-semibold text-slate-800 leading-snug">{m.title}</p>
                    <p className="text-md3-label-md text-slate-400 truncate">{m.subtitle}</p>
                  </div>
                  <span className="text-slate-300 text-lg">›</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
