import { useEffect, useMemo, useState } from 'react'

export interface UsePaginationResult<T> {
  /** Items belonging to the current page. */
  pageItems: T[]
  /** Current 1-based page number. */
  page: number
  /** Total number of pages (always >= 1). */
  totalPages: number
  /** Total number of items across all pages. */
  totalItems: number
  /** 1-based index of the first item on the current page (0 when empty). */
  startIndex: number
  /** 1-based index of the last item on the current page (0 when empty). */
  endIndex: number
  /** Active page size. */
  pageSize: number
  /** Jump to a specific page (clamped to valid range). */
  setPage: (page: number) => void
  nextPage: () => void
  prevPage: () => void
}

/**
 * Client-side pagination for an already-loaded array.
 *
 * Slices `items` into pages of `pageSize`. The current page is clamped to a
 * valid range whenever the list shrinks (e.g. after filtering or deletion), so
 * callers never land on an empty out-of-range page.
 */
export function usePagination<T>(items: T[], pageSize = 10): UsePaginationResult<T> {
  const [page, setPageState] = useState(1)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  // Clamp the active page when the dataset changes underneath us.
  useEffect(() => {
    if (page > totalPages) setPageState(totalPages)
  }, [page, totalPages])

  const safePage = Math.min(page, totalPages)

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endIndex = Math.min(safePage * pageSize, totalItems)

  const setPage = (next: number) => {
    setPageState(Math.min(Math.max(1, next), totalPages))
  }

  return {
    pageItems,
    page: safePage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    pageSize,
    setPage,
    nextPage: () => setPage(safePage + 1),
    prevPage: () => setPage(safePage - 1),
  }
}
