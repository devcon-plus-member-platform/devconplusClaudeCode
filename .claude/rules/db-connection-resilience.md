# Rule: Frontend Recovers via Polling — Realtime Is Best-Effort Only

## The Rule

Every update to the app — new feature, bug fix, refactor, layout change — must preserve the
**polling-first recovery model**. App correctness must NEVER depend on a Supabase Realtime channel
being connected. Fresh data comes from refetching over HTTP (`recover()` on focus / online / interval);
realtime, where used at all, is a **best-effort enhancement** that may silently fail and fall back to
polling. The frontend must recover all data after any stall (network drop, device sleep, tab
background, idle timeout) **using polling alone**.

## Why This Exists (inverted 2026-06-14)

> This rule previously REQUIRED maintaining always-on realtime channels (re-subscribing on every
> recovery trigger). That premise is now **inverted**.

Supabase **Free tier caps Realtime at 200 concurrent connections** and fails *hard* past it — the
201st client is refused and, under the old model, its live features silently broke. A 500+ user launch
would blow straight through the cap. The June 12 diagnostics also showed Realtime (WAL→JSON replication
+ the `pg_publication_tables` subscription-management query) was ~76% of DB execution time — the real
scaling ceiling. So we removed the always-on subscriptions and made polling the baseline. See plan
`lets-now-work-on-fluffy-sutton.md` for the full migration.

## The Recovery Model: Polling Baseline

Every layout that owns a member/organizer session (`MemberLayout`, `OrganizerLayout`) implements ONE
layer: **`recover()`** — calls all store fetch functions over HTTP. There is **no `resubscribe()`**;
there are no always-on channels to keep alive.

`recover()` MUST run on all of:

| Trigger | Event |
|---------|-------|
| Tab becomes visible | `visibilitychange` → `document.visibilityState === 'visible'` |
| Network restores | `window` `online` event |
| Periodic keepalive | `setInterval` every **60 seconds** (tunable; cheap because reads are Upstash-cached) |
| Sign-in / token refresh | `supabase.auth.onAuthStateChange` → `SIGNED_IN` / `TOKEN_REFRESHED` |

The layout also fires **debounced follow-up attempts** at +5 s and +15 s after each trigger (stale
mobile-Safari connections serve old data on the first refetch). Debounce guard: skip if a recovery ran
in the last 3 s. **Clear all timers + the announcements channel on unmount.**

```ts
// CORRECT — polling only; no resubscribe
const runRecovery = () => {
  if (Date.now() - lastRecoveryRef.current < 3000) return
  lastRecoveryRef.current = Date.now()
  recover()
  retryTimersRef.current.forEach(clearTimeout)
  retryTimersRef.current = [
    window.setTimeout(() => recover(), 5_000),
    window.setTimeout(() => recover(), 15_000),
  ]
}
window.addEventListener('online', runRecovery)
const pollInterval = setInterval(() => recover(), 60_000)
// unmount: clearInterval(pollInterval); clear timers; window.removeEventListener('online', runRecovery)
```

## Best-Effort Realtime Contract (the ONLY realtime allowed)

Realtime is permitted only as a non-critical enhancement on top of a polling baseline, on these surfaces:
- **Announcements** (`useNotificationsStore.subscribe`) — always-on but best-effort; the `fetchRecent`
  poll (with new-arrival toast) is the fallback.
- **EventPending** approval flip and **EventTicket** check-in flip — transient, per-screen; a 5 s poll of
  `/api/registrations/mine` is the fallback.

Any such channel MUST:
1. Run **on top of a polling baseline** that already keeps the data correct.
2. **Give up on the first error** — in `.subscribe()`, on `CHANNEL_ERROR` / `TIMED_OUT` call
   `supabase.removeChannel(channel)` and do NOT retry. This is what makes the 201st+ client degrade to
   polling instead of storming Supabase with reconnects.
3. Return a cleanup function: `return () => { void supabase.removeChannel(channel) }`.
4. Not rebuild on `visibilitychange` / `online` (the poll covers it). The announcements channel may
   re-attempt once on those events ONLY if no healthy channel exists, keyed so it doesn't churn on every
   poll-driven refetch.

```ts
.subscribe((status, err) => {
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    console.warn('[channel] unavailable, falling back to polling:', status, err)
    void supabase.removeChannel(channel) // give up — poll covers it
  }
})
```

**Do NOT add a new always-on subscription** (one held for a whole session in a layout). `events` and
`points` realtime were removed for exactly this reason; their stores' `subscribeToChanges` are now
no-ops (`return () => {}`), matching `useRewardsStore` / `useMissionsStore`.

## Realtime Publication

The `supabase_realtime` publication is pruned to **`event_registrations` + `event_announcements`** only
(the two tables the best-effort subscriptions read). Do not add tables back without a connection-budget
plan — every published table multiplies WAL→JSON work per connection.

## Checklist Before Every Update

- [ ] Does the feature work correctly with **realtime entirely disabled** (polling only)?
- [ ] Is any realtime channel **best-effort** — gives up on `CHANNEL_ERROR`/`TIMED_OUT`, never retries?
- [ ] Did you avoid adding a new **always-on** (layout-level) subscription?
- [ ] Does `recover()` fetch the data your feature needs, and run on visibility / online / 60 s / auth-change?
- [ ] Are all `setTimeout`/`setInterval` handles and channels cleaned up on unmount?
- [ ] Does every `removeEventListener` reference the exact named handler (not an anonymous arrow)?
- [ ] No direct `supabase.from(...)` reads in components — go through the NestJS backend (`apiFetch`).

## Files That Own This Pattern

> Paths are in `web/src/`.

- `web/src/components/MemberLayout.tsx` — polling recovery + the best-effort announcements channel.
- `web/src/components/OrganizerLayout.tsx` — polling recovery only (no realtime channels).
- `web/src/stores/useEventsStore.ts` — `subscribeToChanges` is a no-op; `subscribeToRegistration` is best-effort.
- `web/src/stores/usePointsStore.ts` — `subscribeToChanges` is a no-op.
- `web/src/stores/useNotificationsStore.ts` — `subscribe` is best-effort; `fetchRecent` is the poll + new-arrival toast.
- `web/src/pages/events/EventPending.tsx`, `web/src/pages/events/EventTicket.tsx` — 5 s poll + best-effort channel.

Any new layout/store/screen added here must follow the polling-first model on day one. To re-enable
always-on realtime (e.g. after a Supabase Pro upgrade lifts the 200-connection cap), restore the
original handlers from git history and re-add the tables to the publication.
