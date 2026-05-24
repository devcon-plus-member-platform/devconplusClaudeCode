import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

/**
 * Compile a fuzzy-match regex from a query string.
 * Returns null when the query is empty or invalid (caller should treat null as "show all").
 * Compile once per filter pass and reuse across items via `fuzzyMatchItem`.
 */
export function buildFuzzyRegex(query: string | null | undefined): RegExp | null {
  if (!query) return null
  const trimmed = query.trim()
  if (!trimmed) return null
  if (trimmed.length > 200) return null

  // Builds a subsequence regex: each char separated by .* so "rct" matches "React"
  const pattern = trimmed
    .split('')
    .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')

  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

/**
 * Test a single item against a pre-compiled regex from `buildFuzzyRegex`.
 * Use this inside `.filter()` to avoid recompiling the regex for every item.
 */
export function fuzzyMatchItem<T extends object>(
  regex: RegExp | null,
  item: T,
  keys: (keyof T)[]
): boolean {
  if (!regex) return true
  return keys.some((key) => {
    const value = item[key]
    if (value === null || value === undefined) return false
    return regex.test(String(value))
  })
}

/**
 * Convenience wrapper for one-off single-item checks.
 * Do NOT use inside a `.filter()` loop — use `buildFuzzyRegex` + `fuzzyMatchItem` instead.
 */
export function fuzzySearchFilter<T extends object>(
  query: string | null | undefined,
  item: T,
  keys: (keyof T)[]
): boolean {
  return fuzzyMatchItem(buildFuzzyRegex(query), item, keys)
}
