import type { MaintenanceShellProps } from '../components/MaintenanceShell'

/**
 * Content for the maintenance screen. Edit THIS for each window — never App.tsx.
 *
 * Every field is optional; drop one to hide that part of the screen
 * (`backBy: null` hides the ETA pill, `socials: []` hides the socials row).
 */
export const MAINTENANCE_CONFIG: MaintenanceShellProps = {
  heading: 'DEVCON+ is getting an upgrade',
  message:
    'We’re making things faster and better for the community. We will be back online soon!',
  backBy: 'Monday, August 3, 2026',
  contactEmail: 'plusmemberplatform@devcon.ph',
  socials: [
    { label: 'Facebook', handle: 'DEVCON Philippines' },
    { label: 'X / Twitter', handle: '@devconph' },
    { label: 'Instagram', handle: '@devcon.ph' },
  ],
}

/** Query param that lets the team through the maintenance screen. */
export const MAINTENANCE_BYPASS_PARAM = 'maintenance-bypass'

/**
 * Bypass key. Rotate this per maintenance window.
 *
 * ⚠️ NOT a security boundary. This value is compiled into the public JS bundle —
 * anyone who opens DevTools can read it and skip the screen. It exists so the team
 * can verify the real app while members see the maintenance page, nothing more.
 * If a window genuinely needs to block access, gate it at the API / nginx layer;
 * this shell only stops the app UI.
 */
export const MAINTENANCE_BYPASS_KEY = 'devcon-ops'

const STORAGE_KEY = 'dc-maintenance-bypass'

/**
 * True when this tab should skip the maintenance screen.
 *
 * Passing `?maintenance-bypass=<key>` sets a sessionStorage flag so the bypass
 * survives in-app navigation and reloads for the rest of the tab session. A fresh
 * tab (or a new browser session) sees the maintenance screen again.
 *
 * `search` / `store` are injectable for tests. sessionStorage access is wrapped
 * because Safari private mode throws on read/write.
 */
export function isMaintenanceBypassed(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
  store: Storage | null = typeof window === 'undefined' ? null : window.sessionStorage,
): boolean {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    params = new URLSearchParams()
  }

  if (params.get(MAINTENANCE_BYPASS_PARAM) === MAINTENANCE_BYPASS_KEY) {
    try {
      store?.setItem(STORAGE_KEY, '1')
    } catch {
      // Storage unavailable (private mode) — the bypass just won't persist.
    }
    return true
  }

  try {
    return store?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Evaluated ONCE at module load, deliberately.
 *
 * App.tsx uses this in an early return placed above its hooks. A value that could
 * change between renders would change React's hook order mid-session and crash the
 * app; a module constant cannot.
 */
export const SHOW_MAINTENANCE: boolean = !isMaintenanceBypassed()
