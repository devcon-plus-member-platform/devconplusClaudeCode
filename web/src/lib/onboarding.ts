// Tracks whether a visitor has already gone through the onboarding carousel.
// Persisted in localStorage so it survives across sessions. Follows the app's
// existing 'devcon-' storage key convention (see useThemeStore / useFormDraft).

const KEY = 'devcon-onboarding-seen'

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* storage unavailable — onboarding will just show again, acceptable */
  }
}
