import { useEffect } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { ClockCircleOutline, LetterOutline, RefreshOutline } from 'solar-icon-set'
import { staggerContainer, cardItem } from '../lib/animation'
// Horizontal lockup, not logo-vertical.svg — the vertical asset carries a "BETA"
// pill, and DEVCON+ is live on devcon.plus.
import logoHorizontal from '../assets/logos/logo-horizontal.svg'

export interface MaintenanceSocial {
  /** Platform name, e.g. 'Facebook'. */
  label: string
  /** Handle or page name, e.g. '@devcon.ph'. */
  handle: string
  /** Optional link — renders an <a> when present, a plain pill when not. */
  url?: string
}

export interface MaintenanceShellProps {
  heading?: string
  message?: string
  /** Human-readable return date/time. Pass null (or omit) to hide the ETA pill entirely. */
  backBy?: string | null
  /** Pass null (or omit) to hide the contact block. */
  contactEmail?: string | null
  /** Pass [] (or omit) to hide the socials row. */
  socials?: MaintenanceSocial[]
  footerNote?: string
  /** Shows a "Try again" button that reloads the page. Defaults to true. */
  showRetryButton?: boolean
  /** Overrides document.title while the shell is mounted. */
  documentTitle?: string
}

/**
 * Full-screen maintenance / downtime screen for the whole app.
 *
 * Rendered as an early return from App.tsx so it replaces every route — member,
 * organizer, admin, public and the 404 catch-all — and short-circuits before auth
 * init and the dashboard prefetches ever fire. See web/src/lib/maintenance.ts for
 * the content config and docs/runbooks/maintenance-mode.md for the procedure.
 *
 * Every prop is optional: <MaintenanceShell /> renders a complete, correct screen.
 *
 * NOTE: this is deliberately NOT program-themed. It renders before MemberLayout
 * stamps --color-primary on <html>, so it uses the fixed DEVCON blue palette.
 */
export default function MaintenanceShell({
  heading = 'DEVCON+ is getting an upgrade',
  message = 'We’re making things faster and better for the community. We will be back online soon!',
  backBy = null,
  contactEmail = null,
  socials = [],
  footerNote = 'DEVCON+ · Sync. Support. Succeed.',
  showRetryButton = true,
  documentTitle,
}: MaintenanceShellProps) {
  const title = documentTitle ?? `${heading}. We will be back soon!`

  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    // Keep the maintenance screen out of search results for the duration of the window.
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)

    return () => {
      document.title = previousTitle
      meta.remove()
    }
  }, [title])

  return (
    <MotionConfig reducedMotion="user">
      {/* Two levels on purpose: the outer element scrolls, the inner one centres.
          Centring directly on a scroll container (items-center + overflow-y-auto)
          clips overflowing content at the TOP and makes it unreachable — on a short
          viewport the logo would be permanently cut off. min-h-full lets the inner
          wrapper grow past the viewport instead. */}
      <div className="fixed inset-0 overflow-y-auto" style={{ background: BACKDROP }}>
        <div className="min-h-full flex items-center justify-center p-6">
          <motion.div
            className="w-full max-w-[420px]"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={cardItem} className="flex justify-center mb-7">
              <img
                src={logoHorizontal}
                alt="DEVCON+"
                className="w-[180px] h-auto"
                draggable={false}
              />
            </motion.div>

            <motion.main
              variants={cardItem}
              className="bg-white rounded-3xl p-8 sm:p-10 text-center shadow-xl"
            >
              <h1 className="text-md3-title-lg sm:text-md3-headline-sm font-black text-slate-900 mb-3">
                {heading}
              </h1>
              <p className="text-md3-body-md sm:text-md3-body-lg text-slate-500 mb-5">{message}</p>

              {backBy && (
                <div className="flex items-center justify-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 mb-6">
                  <ClockCircleOutline color="#1152D4" width={22} height={22} />
                  <span className="text-left">
                    <span className="block text-md3-label-sm font-bold uppercase tracking-wider text-slate-400">
                      Back by
                    </span>
                    <span className="block text-md3-title-sm font-bold text-blue">{backBy}</span>
                  </span>
                </div>
              )}

              {showRetryButton && (
                <motion.button
                  type="button"
                  onClick={() => window.location.reload()}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="inline-flex items-center gap-2 bg-blue text-white rounded-full px-5 py-2.5 text-md3-label-lg font-semibold"
                >
                  <RefreshOutline color="#FFFFFF" width={18} height={18} />
                  Try again
                </motion.button>
              )}

              {(contactEmail || socials.length > 0) && (
                <hr className="border-0 border-t border-slate-200 my-6" />
              )}

              {contactEmail && (
                <>
                  <p className="flex items-center justify-center gap-1.5 text-md3-label-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                    <LetterOutline color="#94A3B8" width={14} height={14} />
                    Need us sooner?
                  </p>
                  <a
                    href={`mailto:${contactEmail}`}
                    className="text-md3-body-md font-bold text-blue break-words"
                  >
                    {contactEmail}
                  </a>
                </>
              )}

              {socials.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2.5 mt-4">
                  {socials.map((social) =>
                    social.url ? (
                      <a
                        key={social.label}
                        href={social.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={SOCIAL_PILL}
                      >
                        {social.label}: {social.handle}
                      </a>
                    ) : (
                      <span key={social.label} className={SOCIAL_PILL}>
                        {social.label}: {social.handle}
                      </span>
                    ),
                  )}
                </div>
              )}
            </motion.main>

            {footerNote && (
              <motion.p
                variants={cardItem}
                className="mt-5 text-center text-md3-body-sm text-white/75"
              >
                {footerNote}
              </motion.p>
            )}
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  )
}

const SOCIAL_PILL =
  'bg-slate-100 border border-slate-200 rounded-full px-3 py-1.5 text-md3-label-md font-semibold text-slate-700'

// Circle-lattice pattern over the DEVCON blue gradient — matches the static
// nginx-served maintenance page (ops/maintenance-site) so the two look identical.
const CIRCLE_LATTICE =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='60'%20height='60'%3E%3Ccircle%20cx='0'%20cy='0'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3Ccircle%20cx='60'%20cy='0'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3Ccircle%20cx='0'%20cy='60'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3Ccircle%20cx='60'%20cy='60'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3Ccircle%20cx='30'%20cy='30'%20r='30'%20stroke='white'%20stroke-width='0.8'%20stroke-opacity='0.10'%20fill='none'/%3E%3C/svg%3E\") repeat top center / 60px 60px"

// The background-color belongs to the LAST layer of the shorthand, not its own
// comma-separated entry (a bare color is not a valid background-image).
const BACKDROP = [
  CIRCLE_LATTICE,
  'radial-gradient(120% 90% at 15% -10%, #6099F4 0%, rgba(96, 153, 244, 0) 55%) no-repeat',
  'linear-gradient(160deg, #1152D4 0%, #0D42AA 55%, #1E2A56 100%) no-repeat #1152D4',
].join(', ')
