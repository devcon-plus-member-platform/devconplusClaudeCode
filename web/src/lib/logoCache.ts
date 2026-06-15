// Module-level cache — persists across component remounts for the SPA session.
// Keyed by logo_url. 'ok' = successfully loaded at least once, 'error' = failed.
export const logoStatusCache = new Map<string, 'ok' | 'error'>()
