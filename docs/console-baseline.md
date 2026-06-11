# Console Baseline — Known-Harmless Browser Console Lines

> Last verified: June 12, 2026 (staging.cloud-engineer.dev)
>
> The browser console on auth pages shows a handful of recurring lines that are
> **not bugs**. They've been investigated; do not re-investigate them. Anything
> NOT in this table is worth a look — a clean baseline is what makes new
> errors visible.

## Known-harmless lines

| Console line | Source | Why it's harmless |
|---|---|---|
| `[Violation] Avoid using document.write()` from `normal?lang=auto` | Cloudflare Turnstile's challenge iframe | Cloudflare's own minified code running in Cloudflare's cross-origin frame. Not reachable from our code. |
| `Request for the Private Access Token challenge.` | Turnstile iframe | Turnstile probing Apple's PAT mechanism. Internal to Cloudflare. |
| `The resource .../cmg/1 was preloaded using link preload but not used...` | Turnstile iframe | Cloudflare's own preload hint. |
| `Cross-Origin-Opener-Policy policy would block the window.closed call.` (repeats during Google sign-in) | Browser engine, triggered by Firebase SDK | Firebase polls `popup.closed` to detect popup cancellation; Google's sign-in page severs that handle via its own COOP. Firebase falls back to a timeout — sign-in works. The only "fix" is weakening our COOP header, which would be a security regression. |

## Hiding them while developing

Paste into the DevTools Console **Filter** box (persists across sessions):

```
-url:challenges.cloudflare.com -Cross-Origin-Opener-Policy
```

Or right-click a Turnstile message → "Hide messages from challenges.cloudflare.com".

End users never see any of this — console output is invisible without DevTools.

## Why we can't suppress these in code

Console messages come in three classes with different owners:

1. **Our `console.*` calls** — fix in code. (Done: `[bridge]` request tracing in
   `web/src/lib/authBridge.ts` is dev-only since commit `8206bbe`.)
2. **Cross-origin third-party logs** (the Turnstile lines) — browsers hard-isolate
   cross-origin iframes; our JS cannot intercept their console.
3. **Browser-engine diagnostics** (COOP/CSP/`[Violation]`/preload warnings) — emitted
   by the browser itself, bypassing the JS `console` object entirely. Suppressible
   only by fixing the underlying condition (when it's actually ours) or filtering.

## If a NEW console line appears

- CSP violation naming one of our directives → check `web/vercel.json` and
  `.claude/rules/vercel-build-safety.md` (Rule 0) before widening anything.
- `supabaseUrl is required` / white screen → build shipped without env vars; see
  Rule 0 in `.claude/rules/vercel-build-safety.md`.
- Anything else → investigate; the baseline above is intentionally short.
