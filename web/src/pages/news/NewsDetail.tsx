import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftOutline, CalendarOutline, TagOutline } from 'solar-icon-set'
import { motion } from 'framer-motion'
import { useNewsStore } from '../../stores/useNewsStore'
import { fadeUp } from '../../lib/animation'
import { CATEGORY_LABELS } from '../../lib/constants'
import { formatDate } from '../../lib/dates'
import NotFound from '../NotFound'

const WELCOME_POST = {
  id: 'welcome',
  title: 'Welcome to DEVCON+ — Your Tech Community Hub',
  body: `DEVCON+ is the unified platform for DEVCON Philippines — the country's largest volunteer tech community with 11 nationwide chapters, 60,000+ members, and 14,000+ annual attendees.

## What's Live on DEVCON+

### Event Registration
Browse and register for chapter events across all 11 DEVCON chapters nationwide. Submit your registration and receive a QR ticket instantly — or track your pending approval from chapter officers in real time.

### QR Check-In
Show your QR ticket at the venue and get checked in by an officer with a single scan. Points are awarded automatically the moment you're verified at the door.

### Points+ System
Every activity earns you Points+. Attend events, volunteer at chapters, refer new members, and more. Points are tracked live — check your balance and full transaction history anytime from the Points tab.

### Rewards Catalog
Spend your Points+ on exclusive DEVCON merchandise: lanyards, caps, shirts, mugs, keyboard, headset, and coffee vouchers. The catalog is live — rewards are claimable on-site at chapter events.

### Jobs Board
Browse tech career opportunities curated for Filipino developers — from frontend and full-stack roles to DevOps, data engineering, and product management. Listings are updated regularly with both local and remote positions.

### Volunteer at Events
Sign up to volunteer at upcoming chapter events directly through the app. Approved volunteers earn bonus points on top of the standard attendance award.

### Google Sign-In
Create your account or log in instantly with Google — no separate password needed. Your profile, points, and registrations sync across all your devices.

---

DEVCON+ is built by the community, for the community. Keep attending events, keep earning, and keep leveling up.

— The DEVCON+ Team`,
  category: 'devcon' as const,
  is_featured: true,
  is_promoted: false,
  cover_image_url: '/photos/devcon-summit-group.jpg',
  author_id: null,
  created_at: '2026-04-09T09:00:00Z',
}

/** Renders a body string with basic markdown-like formatting:
 *  ## Heading 2, ### Heading 3, --- divider, plain paragraphs.
 *  Splits on double newlines for paragraph breaks. */
function ArticleBody({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/)

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const trimmed = block.trim()

        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={i} className="text-md3-body-lg font-bold text-slate-900 pt-2">
              {trimmed.slice(3)}
            </h2>
          )
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={i} className="text-md3-body-md font-bold text-primary">
              {trimmed.slice(4)}
            </h3>
          )
        }

        if (trimmed === '---') {
          return <hr key={i} className="border-slate-200" />
        }

        // Lines starting with "-" → bullet list
        if (trimmed.startsWith('- ')) {
          const items = trimmed.split('\n').filter((l) => l.startsWith('- '))
          return (
            <ul key={i} className="space-y-1 pl-4">
              {items.map((item, j) => (
                <li key={j} className="text-md3-body-md text-slate-700 leading-relaxed list-disc">
                  {item.slice(2)}
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={i} className="text-md3-body-md text-slate-700 leading-relaxed">
            {trimmed}
          </p>
        )
      })}
    </div>
  )
}

// Flower-of-life pattern matching Rewards/Dashboard/Events
const TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="0" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="0" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="0" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="60" cy="60" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/><circle cx="30" cy="30" r="30" stroke="white" stroke-width="0.8" stroke-opacity="0.10" fill="none"/></svg>`
const PATTERN_BG = `url("data:image/svg+xml,${encodeURIComponent(TILE_SVG)}")`

export default function NewsDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { posts, fetchNews, isLoading } = useNewsStore()

  useEffect(() => {
    if (id !== 'welcome' && posts.length === 0) void fetchNews()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const post = id === 'welcome' ? WELCOME_POST : posts.find((p) => p.id === id)

  if (!post && isLoading) return null
  if (!post) return <NotFound />

  const dateStr = post.created_at ? formatDate.long(post.created_at) : ''

  return (
    <div className="bg-slate-50 min-h-screen pb-10">
      {/* Floating back button (Sticky/Fixed) */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 pt-12 pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-white/40 transition-colors shadow-lg pointer-events-auto"
        >
          <ArrowLeftOutline className="w-5 h-5" color="white" />
        </button>
      </div>

      {/* ── Header ── */}
      <header 
        className="relative z-50 h-60 bg-slate-200 overflow-hidden"
        style={{ clipPath: 'ellipse(100% 100% at 50% 0%)' }}
      >
        {post.cover_image_url ? (
          <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full bg-primary"
            style={{ backgroundImage: PATTERN_BG, backgroundSize: '60px 60px' }}
          />
        )}
      </header>

      {/* Article content */}
      <motion.div 
        className="px-4 pt-5 space-y-4"        variants={fadeUp}
        initial="hidden"
        animate="visible"
      >
        {/* Meta row */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
            <TagOutline className="w-3 h-3" />
            {CATEGORY_LABELS[post.category] ?? post.category}
          </span>
          {dateStr && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <CalendarOutline className="w-3 h-3" />
              {dateStr}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-md3-title-lg font-black text-slate-900 leading-snug">{post.title}</h1>

        {/* Divider */}
        <hr className="border-slate-200" />

        {/* Article body */}
        {post.body && <ArticleBody body={post.body} />}

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200">
          <p className="text-[11px] text-slate-400 text-center">
            Published by DEVCON Philippines · {dateStr}
          </p>
        </div>
      </motion.div>
    </div>
  )
}
