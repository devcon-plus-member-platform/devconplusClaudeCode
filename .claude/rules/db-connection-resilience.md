# Rule: Frontend Must Maintain Active DB Connection Even When Stalled

## The Rule

Every update to the app — new feature, bug fix, refactor, layout change — must preserve and not regress the DB connection resilience pattern. The frontend must always be able to recover data AND realtime subscriptions after any stall: network drop, device sleep, tab background, or idle timeout.

## Why This Exists

On 2026-04-06 we fixed a bug where the app lost its Supabase WebSocket connection whenever the network dropped and came back. The `online` event only refetched HTTP data but never re-established the WebSocket channels, so users saw stale data until a full page refresh. This rule exists to prevent that class of regression from ever being reintroduced.

## The Two-Layer Recovery Pattern

Every layout that owns a Supabase realtime session (currently `MemberLayout`, `OrganizerLayout`) MUST implement BOTH layers:

### Layer 1 — Data refetch (`recover`)
Calls all store fetch functions to pull fresh data over HTTP. Handles the case where data changed while the connection was down.

### Layer 2 — Channel re-subscription (`resubscribe`)
Tears down existing Supabase channels and re-creates them. Handles the case where WebSocket channels silently transitioned to CLOSED during sleep or network interruption.

## Required Trigger Points

All three of the following MUST call BOTH `recover()` AND `resubscribe()`:

| Trigger | Event | Notes |
|---------|-------|-------|
| Tab becomes visible | `visibilitychange` → `document.visibilityState === 'visible'` | Handles device sleep / alt-tab |
| Network restores | `window` `online` event | Handles WiFi↔cellular switch, brief drop |
| Periodic keepalive | `setInterval` every **90 seconds** | Handles silent channel death during idle |

**Do NOT pass `recover` alone to any of these. Always pair it with `resubscribe`.**

The layout also fires **debounced follow-up attempts** at +5 s and +15 s after each visibility/online trigger. This catches connections that appear alive but serve stale data (common on mobile Safari after extended backgrounding).

```ts
// WRONG — only refetches data, leaves dead channels
window.addEventListener('online', recover)
setInterval(recover, 90_000)

// CORRECT — refetches data AND re-establishes WebSocket channels,
// with follow-up retries for stale connections
const handleTrigger = () => {
  recover(); resubscribe()
  window.setTimeout(() => { recover(); resubscribe() }, 5_000)
  window.setTimeout(() => { recover(); resubscribe() }, 15_000)
}
window.addEventListener('online', handleTrigger)
// Polling fallback — exempt from debounce
const pollInterval = setInterval(() => { recover(); resubscribe() }, 90_000)

// On unmount — always clear timers
clearInterval(pollInterval)
window.removeEventListener('online', handleTrigger)
```

**Clear all `setTimeout` handles on component unmount** to prevent post-unmount state updates.

## Realtime Store Requirements

Every Zustand store that creates a Supabase realtime channel MUST:

1. Return a cleanup function: `return () => { void supabase.removeChannel(channel) }`
2. Pass a status callback to `.subscribe()` that logs `CHANNEL_ERROR` and `TIMED_OUT`:

```ts
.subscribe((status, err) => {
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    console.warn('[channel-name] channel error', status, err)
  }
})
```

## Checklist Before Every Update

When writing or modifying any component, store, or layout that touches Supabase realtime:

- [ ] Does `resubscribe()` get called on `online` event?
- [ ] Does `resubscribe()` get called in the `setInterval` keepalive (90 s)?
- [ ] Does `resubscribe()` get called on `visibilitychange` → visible?
- [ ] Does every `removeEventListener` reference the exact named handler function (not an anonymous arrow)?
- [ ] Does every new realtime channel have a status callback?
- [ ] Does every new realtime channel return a cleanup function?

## Files That Own This Pattern

- `apps/member/src/components/MemberLayout.tsx` — member session recovery
- `apps/member/src/components/OrganizerLayout.tsx` — organizer session recovery
- `apps/member/src/stores/useEventsStore.ts` — `subscribeToChanges`, `subscribeToRegistration`
- `apps/member/src/stores/useRewardsStore.ts` — `subscribeToChanges`
- `apps/member/src/stores/useNotificationsStore.ts` — `subscribe`

Any new layout or store added to this list must follow the same pattern on day one.
