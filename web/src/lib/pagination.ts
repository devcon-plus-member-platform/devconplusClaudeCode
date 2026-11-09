// Helpers for the paginated `{ rows, total }` endpoints. Kept free of Firebase /
// fetch imports so they can be unit-tested; re-exported from lib/api.ts.

/** Largest page the paginated endpoints accept (server caps ?limit= at 100). */
export const MAX_PAGE_SIZE = 100

/** Safety stop for fetchAllPages: 100 pages × 100 rows. */
const MAX_PAGES = 100

/**
 * Loads every row of a paginated `{ rows, total }` endpoint by following `total`,
 * for screens that genuinely need the complete set (organizer/admin lists, CSV
 * export, client-side search and filters). Rows are de-duplicated by id, since
 * an insert between two page requests can shift a row onto the next page.
 *
 * A plain array response is taken as the complete list: that is what a server
 * deployed before pagination returns, so the app keeps working whichever of the
 * app and the server goes live first.
 */
export async function fetchAllPages<T extends { id: string }>(
  fetchPage: (offset: number, limit: number) => Promise<{ rows: T[]; total: number } | T[]>,
  pageSize: number = MAX_PAGE_SIZE,
): Promise<T[]> {
  const byId = new Map<string, T>()
  let offset = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchPage(offset, pageSize)
    if (Array.isArray(result)) {
      for (const row of result) byId.set(row.id, row)
      break
    }
    for (const row of result.rows) byId.set(row.id, row)
    offset += result.rows.length
    if (result.rows.length === 0 || offset >= result.total) break
  }
  return [...byId.values()]
}

/**
 * True when the server doesn't have the route at all ("Cannot GET …" is the
 * NestJS 404 for an unknown path) — i.e. a server deployed before that route
 * existed. A missing *record* says something else ("Event not found"), so this
 * never hides a genuine not-found. Lets new endpoints fall back during a deploy.
 */
export function isMissingRoute(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('Cannot GET')
}
