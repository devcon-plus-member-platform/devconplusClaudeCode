# Rule: Prevent Vercel Build Failure (Exit Code 2)

## Rule 0: A green build is not a working bundle (env vars)

**Incident (2026-06-12):** staging white-screened with `supabaseUrl is required` while every pipeline stage was green. Root cause: the Vercel project's env vars are stored **sensitive/encrypted** — `vercel pull` exports them with **empty values** (`VITE_SUPABASE_URL=""`), so any CI-side build (`vercel build`, `vite build`) bakes empty config. Vite happily builds with missing `VITE_*` vars and only fails in the user's browser.

Standing protections — do not remove them:

1. **Never build the frontend in CI.** `deploy-frontend-staging.yml` uses `vercel deploy --prod` (remote build on Vercel infra, where sensitive env is injected). Reintroducing `vercel pull` + `vercel build` reintroduces the white screen.
2. **`web/vite.config.ts` hard-fails builds with missing required env** (`REQUIRED_ENV` list). When adding a new required `VITE_*` var, add it to that list — and to the Vercel project env + `web/.env`.
3. **The deploy workflow asserts the served bundle** contains baked-in config after every deploy. HTTP 200 on `index.html` proves nothing about the JS — verify the artifact, not the door.
4. Same content ⇒ same Vite hash: if a "successful" deploy serves an **unchanged bundle filename**, the build inputs didn't change — treat it as a failed deploy, not a propagation delay.

## The Rule

Every change to `apps/member/src/` must produce a clean `tsc -b` before it is considered done. A TypeScript error is a deployment failure — Vercel runs `tsc -b && vite build` and the entire deploy aborts if `tsc -b` exits non-zero. This has caused two separate rollback incidents (`cfa050d`, `93a368e`).

**Run this before marking any task complete:**
```bash
npm run typecheck        # tsc --noEmit across all packages
npm run build            # tsc -b && vite build (mirrors Vercel exactly)
```

If either fails locally, it will fail on Vercel. Fix it before committing.

---

## Why `tsc -b` Is Stricter Than You Expect

The `tsconfig.app.json` enables flags beyond `strict: true`:

| Flag | What it catches |
|------|----------------|
| `strict: true` | `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, etc. |
| `noUnusedLocals: true` | Any declared variable or import that is never read → **error** |
| `noUnusedParameters: true` | Any function parameter that is never used → **error** |
| `noFallthroughCasesInSwitch: true` | Switch case with no `break` / `return` → **error** |
| `noUncheckedSideEffectImports: true` | Side-effect-only imports must use `import 'module'` syntax |

`noUnusedLocals` and `noUnusedParameters` are the most common cause of "it passed locally but failed Vercel" — Vite's dev server is more lenient than `tsc -b`.

---

## Checklist Before Every Commit

### Imports
- [ ] Every import is actually used in the file
- [ ] When removing a feature or refactoring, also remove its import
- [ ] Type-only imports use `import type { Foo }` (not `import { Foo }`) when the value is never used at runtime
- [ ] No `import * as X` where only a subset of `X` is used and the rest go unused

### Variables and Parameters
- [ ] No declared variable that is never read
- [ ] No destructured value that is never used — remove it or replace with `_`
- [ ] Unused function parameters are prefixed with `_` (e.g. `_event`, `_index`)
  ```ts
  // ❌ Fails noUnusedParameters
  function handleChange(value: string, event: React.ChangeEvent<HTMLInputElement>) { ... }

  // ✅ Correct — prefix unused param with _
  function handleChange(value: string, _event: React.ChangeEvent<HTMLInputElement>) { ... }
  ```

### Types
- [ ] No `any` — use `unknown` + type narrowing, or the correct generated DB type
- [ ] No `@ts-ignore` or `@ts-expect-error` without an explanation comment
- [ ] All Supabase queries use types from `packages/supabase/src/database.types.ts`
- [ ] After any DB schema change: run `supabase gen types typescript` and commit the updated `database.types.ts`
- [ ] No type assertions (`as Foo`) that bypass null checks

### Environment Variables
- [ ] Always use `import.meta.env.VITE_*` — never `process.env.*` (Vite does not expose `process.env` to the browser bundle)
- [ ] Every `VITE_*` variable accessed in code must exist in `apps/member/.env.local` (dev) and Vercel environment settings (prod)

### React-Specific
- [ ] `useEffect` dependency arrays are complete — missing deps cause stale closure bugs AND can trigger ESLint errors that become build errors
- [ ] No unused state variables from `useState` destructuring
- [ ] No component defined but never rendered (remove it or export it)

---

## Common Patterns That Cause Exit Code 2

```ts
// ❌ Import declared, never used → noUnusedLocals
import { useState } from 'react'
import { SomeComponent } from './SomeComponent'

// ❌ Variable declared, never read → noUnusedLocals
const result = await supabase.from('events').select()

// ❌ Param declared, never used → noUnusedParameters
const handler = (value: string, index: number) => value.toUpperCase()

// ❌ process.env in Vite → undefined at runtime, type error in strict mode
const url = process.env.VITE_SUPABASE_URL

// ❌ Type mismatch from stale database.types.ts after schema change
const { data } = await supabase.from('profiles').select('total_points')
//                                                          ^^^^^^^^^^^
//  Error: Property 'total_points' does not exist (renamed to spendable_points)

// ✅ Fixes
import type { SomeType } from './types'           // type-only import
const _result = await supabase.from('events')...  // prefix with _ if intentionally unused
const handler = (value: string, _index: number) => value.toUpperCase()
const url = import.meta.env.VITE_SUPABASE_URL
```

---

## Files Most Likely to Cause Build Failures

When editing these files, run `npm run typecheck` immediately after:

- `apps/member/src/stores/` — any store that queries Supabase using DB types
- `apps/member/src/pages/` — pages with many imports that get refactored
- `apps/member/src/components/` — components that receive typed props
- `packages/supabase/src/database.types.ts` — regenerated after schema changes; downstream consumers must be updated

---

## If the Build Fails on Vercel but Passes Locally

This almost always means `tsc -b` was not run locally — only the dev server was used. The dev server (`vite`) does NOT run the TypeScript compiler. Fixes:

1. Run `npm run typecheck` to surface all TS errors
2. Run `npm run build` to simulate Vercel's exact build command
3. Never rely on "the dev server didn't show errors" as proof of TypeScript correctness
