# DEVCON+ — Agentic Skills
> Last Updated: April 21, 2026 (Skill 5 corrected 2026-08 for the polling-first realtime inversion — see its own note)
> Version: MVP 1.6
> Structured Claude Code workflows for common recurring tasks.
> When asked to perform one of these operations, execute the full workflow below — don't improvise.

---

## Skill 1: `SchemaUpdate` — Add or Modify a Database Table/Column

Use when: adding a new table, adding a column, changing a constraint, or seeding new data.

### Workflow

**Step 1 — Write the migration SQL**
```bash
# Create a new migration file with today's date and a descriptive name
# Pattern: supabase/migrations/YYYYMMDD_description.sql
```
- Include `CREATE TABLE` or `ALTER TABLE` statement
- Add RLS: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
- Add at minimum one policy — even if it's "service role only"
- Add performance indexes for foreign keys and commonly filtered columns
- Seed data if applicable

**Step 2 — Apply the migration**
```bash
# Via Supabase CLI:
supabase db push

# Or paste directly in Supabase Dashboard → SQL Editor
```

**Step 3 — Regenerate TypeScript types**
```bash
supabase gen types typescript --project-id <project-ref> \
  > web/src/types/src/database.types.ts
```

**Step 4 — Verify downstream consumers**
```bash
npm run typecheck
# Fix any type errors — the generated types may rename or add fields
```

**Step 5 — Update stores if needed**
- If new table: create a new Zustand store in `web/src/stores/`
- If modified table: update the relevant store's select query and TypeScript types
- If the store uses Realtime: implement the two-layer recovery pattern (see `.claude/rules/db-connection-resilience.md`)

**Step 6 — Verify build**
```bash
npm run build
```

**Checklist before done:**
- [ ] Migration file created with date prefix
- [ ] RLS enabled on new table
- [ ] At least one RLS policy defined
- [ ] `database.types.ts` regenerated
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` succeeds

---

## Skill 2: `NewPageRoute` — Add a New Page and Route

Use when: creating a new screen accessible via a URL.

### Workflow

**Step 1 — Create the page component**

Determine which layout tree it belongs to:
- Member experience → `web/src/pages/` (e.g., `profile/NewPage.tsx`)
- Organizer experience → `web/src/pages/organizer/OrgNewPage.tsx`
- Admin experience → `web/src/pages/admin/AdminNewPage.tsx`

Component template:
```tsx
import { motion } from 'framer-motion'
import { fadeUp } from '@/lib/animation'

export default function NewPage() {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="px-4 pb-24"
    >
      {/* content */}
    </motion.div>
  )
}
```

Rules:
- Every async call needs loading + error + empty state
- Use `<Skeleton />` for loading
- Use `<ComingSoonModal />` for incomplete sub-features
- No dead-end navigation — every action resolves somewhere

**Step 2 — Register the route in router.tsx**
```tsx
// web/src/router.tsx
// Add inside the appropriate layout's children array:
{
  path: '/new-path',
  element: <NewPage />,
  // For large components (admin, QR scanner): lazy-load
  // element: React.lazy(() => import('./pages/NewPage'))
}
```

**Step 3 — Wire up navigation**
- Add a link from wherever users will discover this page
- If it's in the bottom nav: update the nav array in `MemberLayout.tsx` or `OrganizerLayout.tsx`
- Run the app and confirm the route is reachable and has no console errors

**Step 4 — Verify**
```bash
npm run typecheck
npm run build
```

**Checklist before done:**
- [ ] Component uses `fadeUp` or appropriate animation variant from `lib/animation.ts`
- [ ] Loading, error, and empty states handled
- [ ] Route registered in `router.tsx` under the correct layout
- [ ] Navigation to/from this page is not a dead-end
- [ ] `npm run typecheck` passes

---

## Skill 3: `EdgeFunctionUpdate` — Modify or Deploy an Edge Function

Use when: updating business logic in `supabase/functions/`, adding a new edge function, or updating the CORS allowlist.

### Workflow

**Step 1 — Make the code change**

Edge functions are in `supabase/functions/<function-name>/index.ts` (Deno runtime).

Key patterns:
- Always import the shared logger: `import { log } from '../_shared/logger.ts'`
- Always return CORS headers using the shared helper in `_shared/cors.ts`
- Rate limit sensitive endpoints using the `check-rate-limit` function pattern
- Use `log.info()`, `log.warn()`, `log.error()` — never `console.log()` directly

**Step 2 — Test locally (optional but recommended)**
```bash
supabase functions serve <function-name> --env-file supabase/.env
# Then hit it with curl or the app in dev mode
```

**Step 3 — Deploy**
```bash
supabase functions deploy <function-name>

# If you updated _shared/cors.ts or _shared/logger.ts,
# ALL functions share the same _shared/ directory —
# you must redeploy EVERY function:
supabase functions deploy generate-qr-token
supabase functions deploy award-points-on-scan
supabase functions deploy approve-at-door
supabase functions deploy check-rate-limit
supabase functions deploy generate-user-qr
```

**Step 4 — Verify in Supabase Dashboard**
- Go to Edge Functions → click the function name → check the logs
- Trigger the function from the app and confirm the response

**Step 5 — If adding a new domain to CORS allowlist**
```ts
// supabase/functions/_shared/cors.ts
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://devconplusbeta-v1.vercel.app',
  'https://plus-beta.devcon.ph',  // add new domain here
]
```
Then redeploy all 5 functions.

**Checklist before done:**
- [ ] Uses shared logger, not `console.log()`
- [ ] Returns CORS headers on all responses (including error paths)
- [ ] Rate limiting applied if the function handles user actions
- [ ] Function deployed and visible in Supabase Dashboard
- [ ] Verified with a real request from the app

---

## Skill 4: `SecurityAudit` — OWASP Top 10 Review Pass

Use when: preparing for launch, after adding new auth flows, or after adding new user-facing endpoints.

### Workflow

Work through each category. Document findings as: **[PASS / FAIL / PARTIAL]** with a one-line note.

**A01 — Broken Access Control**
- [ ] Every Supabase table with user data has RLS enabled
- [ ] Organizer-only routes check `role IN ('chapter_officer', 'hq_admin', 'super_admin')` via `OrganizerLayout` guard
- [ ] Admin routes check `role IN ('hq_admin', 'super_admin')` via `AdminLayout` guard
- [ ] Edge functions that touch protected data validate the JWT via `supabase.auth.getUser()`
- [ ] No route allows a member to view another member's registrations or points

**A02 — Cryptographic Failures**
- [ ] QR tokens are HMAC-SHA256 signed (not just base64 encoded)
- [ ] QR tokens have short expiry (verify in `generate-qr-token`)
- [ ] No sensitive data (service role key, JWT secret) in client-side code or git
- [ ] HTTPS enforced on production (Vercel handles this)

**A03 — Injection**
- [ ] All Supabase queries use parameterized queries (the SDK handles this)
- [ ] No raw SQL constructed from user input in edge functions
- [ ] Zod validation on all form inputs before DB writes

**A05 — Security Misconfiguration**
- [ ] CSP headers enforced (promoted from Report-Only in April)
- [ ] Supabase anon key is the only key exposed to the browser (not service role)
- [ ] `VITE_APP_ENV` is `production` in Vercel (not `development`)
- [ ] Cloudflare Turnstile token is validated server-side (not just checked for presence)

**A07 — Identification and Authentication Failures**
- [ ] Rate limiting on login, signup, password reset (via `check-rate-limit`)
- [ ] Cloudflare Turnstile on all auth forms
- [ ] Google OAuth redirect URI is restricted to known domains in GCP Console
- [ ] Session tokens are managed by Supabase Auth (not custom implementation)

**A09 — Security Logging and Monitoring**
- [ ] All edge functions log using `_shared/logger.ts` (structured JSON to Supabase Dashboard)
- [ ] Rate limit violations are logged with `log.warn()`
- [ ] Failed QR scans (invalid token, already checked in) are logged

**After audit:** Fix all FAIL findings before marking complete. PARTIAL findings should have a GitHub issue created with priority.

---

## Skill 5: `PollingStoreAdd` — Add a New Zustand Store for Live-ish Data

> ⚠️ **Superseded (2026-06-14):** this skill used to be called `RealtimeStoreAdd` and taught an
> always-on Supabase Realtime channel + a layout-level `resubscribe()`. That pattern is now **banned** —
> see `.claude/rules/db-connection-resilience.md`. Realtime was inverted to polling-first: Supabase's
> free tier caps Realtime at 200 connections and WAL→JSON replication was ~76% of DB execution time.
> There is no `resubscribe()` anymore. Do not add a new always-on channel. This rewritten version
> reflects the current model: fetch through the NestJS gateway, recover via polling only.

Use when: a new domain needs data that should stay reasonably fresh (not just fetched once on mount).

### Workflow

**Step 1 — Create the store file**

```ts
// web/src/stores/useNewDomainStore.ts
import { create } from 'zustand'
import { apiFetch } from '@/lib/api'   // use publicFetch instead if the data needs no auth

interface NewDomainStore {
  items: Item[]
  isLoading: boolean
  error: string | null
  fetchItems: () => Promise<void>
  subscribeToChanges: () => () => void  // kept for interface parity with other stores — no-op
}

export const useNewDomainStore = create<NewDomainStore>((set) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchItems: async () => {
    set({ isLoading: true, error: null })
    try {
      const items = await apiFetch<Item[]>('/api/new-domain')
      set({ items, isLoading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load', isLoading: false })
    }
  },

  // No always-on channel — see the warning above. Matches useRewardsStore / useMissionsStore.
  subscribeToChanges: () => () => {},
}))
```

**Step 2 — Wire into the layout's polling recovery**

Open `MemberLayout.tsx` (or `OrganizerLayout.tsx` for organizer data) and add the fetch to the
existing `recover()` function — there is nothing else to wire up:

```ts
const recover = useCallback(async () => {
  await Promise.all([
    fetchEvents(),
    fetchRewards(),
    fetchNewDomainItems(),  // ← add this
  ])
}, [...])
```

**Step 3 — Verify `recover()` fires on all the required triggers**

```bash
grep -n "recover()" web/src/components/MemberLayout.tsx
# Should be called on: visibilitychange (visible), window 'online', a 60s setInterval, and auth-change
```

**Step 4 — Verify**
```bash
cd web && npm run typecheck
cd web && npm run build
# Manually test: load the page, put the tab in background for a minute, return — data should refresh
```

**Checklist before done:**
- [ ] Data is fetched via `apiFetch`/`publicFetch` against the NestJS gateway — not `supabase.from(...)` directly
- [ ] No new Supabase Realtime channel was added
- [ ] `fetchItems()` is called in the layout's `recover()` function
- [ ] `recover()` still fires on visibility / online / 60s interval / auth-change (unchanged by this addition)
- [ ] `cd web && npm run typecheck` passes

---

## Skill 6: `FigmaMCPDesign` — UI/UX Design with Figma MCP via Gemini CLI

> **Tool clarification (as of April 21, 2026):**
> - **Claude Code has native Figma MCP** built into claude.ai sessions — tools available include `get_design_context`, `get_screenshot`, `get_metadata`, and more. No `.mcp.json` config is needed when using Claude Code via claude.ai/code.
> - **Despite native support, per developer observation, Claude Code does not capture Figma elements accurately** — layouts and tokens are often misread. Gemini CLI produces better design-to-code results.
> - **Gemini CLI is preferred** for Figma design work when access is available.
> - **Gemini CLI requires organizational access** not provisioned to DEVCON Philippines by default — confirm with the team lead before using it.
> - **Figma MCP is free.** However, **Figma Dev Mode** — which passes precise CSS values, layout specs, and component context to the model — requires a **paid Figma plan**. Without Dev Mode, MCP accuracy is reduced for both tools.
> - If Gemini CLI is unavailable, use Claude Code + Figma MCP natively (claude.ai session) or via local `.mcp.json` setup, with awareness of accuracy limits. Supplement with the manual Figma Inspect panel method.

Use when: translating a Figma frame to a React component, extracting design tokens from Figma, verifying design fidelity, or generating component skeletons from Figma specs.

### When to use Gemini CLI vs Claude Code

| Task | Tool |
|------|------|
| Read a Figma frame / inspect design | **Gemini CLI** (preferred) / Claude Code + Figma MCP (lower accuracy) |
| Extract spacing, color, typography tokens from Figma | **Gemini CLI** (preferred) — Claude Code Figma MCP captures elements less accurately |
| Generate initial component skeleton from Figma spec | **Gemini CLI** (preferred) / Claude Code + manual Figma Inspect fallback |
| Verify finished component against Figma design | **Gemini CLI** (preferred) / human visual QA at 390px |
| Implement logic, stores, Supabase queries | **Claude Code** |
| Wire Tailwind tokens, animation, TypeScript types | **Claude Code** |
| Fix build errors, run typecheck | **Claude Code** |

### Workflow

**Step 1 — Inspect in Gemini CLI (Figma MCP)**

In Gemini CLI, with the Figma MCP server active:
```
# Point Gemini at the Figma frame URL or node ID
# Ask it to extract: layout structure, spacing, colors, font sizes, component hierarchy
# Have it output a React + Tailwind skeleton using the project's MD3 type scale and design tokens
```

Key things to extract from Figma:
- Layout: flex direction, gap, padding, alignment
- Colors: map to existing Tailwind tokens (`bg-primary`, `text-slate-900`, etc.)
- Typography: map to MD3 scale (`text-md3-title-lg`, `text-md3-body-md`, etc.)
- Radius: map to Tailwind (`rounded-xl`, `rounded-2xl`, `rounded-3xl`)
- Shadows: map to project tokens (`shadow-card`, `shadow-blue`, `shadow-primary`)

**Step 2 — Hand off skeleton to Claude Code**

Paste the Gemini-generated skeleton into Claude Code and ask it to:
- Replace any hardcoded hex/px values with proper Tailwind/CSS-var tokens
- Wire real data from the appropriate Zustand store
- Add `framer-motion` animation variants from `lib/animation.ts`
- Add `whileTap` spring values per the design system
- Ensure `solar-icon-set` icons use `color` prop (not `text-*` classes)
- Run `npm run typecheck` to confirm no TS errors

**Step 3 — Verify design fidelity in Gemini CLI**

Return to Gemini CLI to compare the finished component screenshot against the original Figma frame. Ask Gemini to flag any spacing, color, or typography mismatches.

**Step 4 — Final build check in Claude Code**
```bash
npm run typecheck
npm run build
```

### Fallback Workflow *(when Gemini CLI access is not provisioned)*

If DEVCON Philippines has not been granted Gemini CLI access, use this human-assisted path instead:

**Step 1 — Human extracts specs from Figma Inspect panel**

In Figma (browser), select each frame/layer and copy values from the Inspect panel:
- Layout: flex direction, gap, padding
- Colors: hex values → map manually to project tokens
- Typography: font size, weight → map to MD3 scale
- Border radius: px → map to Tailwind (`rounded-xl`, `rounded-2xl`, etc.)

**Step 2 — Paste specs into Claude Code**

Paste the extracted values and ask Claude Code to build the component using the correct project tokens (no hardcoded hex, no magic px values).

**Step 3 — Human visual QA**

Open the running dev server (`cd web && npm run dev`) at `localhost:5173`, set DevTools to 390px width, and compare the component side-by-side with the Figma frame.

**Step 4 — Claude Code final check**
```bash
npm run typecheck
npm run build
```

### Checklist before done
- [ ] Gemini CLI used for Figma inspection OR human manually extracted specs from Figma Inspect panel
- [ ] All colors mapped to project Tailwind tokens — no hardcoded hex
- [ ] All font sizes mapped to MD3 scale or legacy scale
- [ ] Solar icons use `color` prop, not `text-*` classes
- [ ] `framer-motion` variants imported from `lib/animation.ts`
- [ ] `whileTap` spring applied to all tappable elements
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` succeeds
