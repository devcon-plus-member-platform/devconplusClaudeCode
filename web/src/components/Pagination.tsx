import { motion } from 'framer-motion'
import { AltArrowLeftOutline, AltArrowRightOutline } from 'solar-icon-set'
import type { UsePaginationResult } from '../hooks/usePagination'

/** Only the display + navigation fields are needed (not pageItems). */
type PaginationController = Omit<UsePaginationResult<unknown>, 'pageItems'>

interface PaginationProps {
  /** The object returned by `usePagination` (spread as `const { pageItems, ...rest }`). */
  controller: PaginationController
  /** Singular noun for the count label, e.g. "user" → "Showing 1–10 of 42 users". */
  itemLabel?: string
  className?: string
}

/**
 * Builds the page list. Shows *every* page up to 5, otherwise the first/last
 * page plus a 2-wide window around the current page with ellipsis gaps,
 * e.g. [1, '…', 4, 5, 6, 7, 8, '…', 20].
 */
function buildPageList(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | 'gap')[] = [1]
  const start = Math.max(2, page - 2)
  const end = Math.min(totalPages - 1, page + 2)

  if (start > 2) pages.push('gap')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < totalPages - 1) pages.push('gap')

  pages.push(totalPages)
  return pages
}

// Ghost "Previous" / "Next" buttons — borderless, hover-filled.
const NAV_BTN =
  'flex items-center gap-1.5 h-9 px-3 rounded-lg text-md3-label-lg font-medium text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors'

export default function Pagination({
  controller,
  itemLabel = 'item',
  className = '',
}: PaginationProps) {
  const { page, totalPages, totalItems, startIndex, endIndex, setPage } = controller
  if (totalItems === 0) return null

  const pageList = buildPageList(page, totalPages)
  const plural = totalItems === 1 ? itemLabel : `${itemLabel}s`

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 ${className}`}
    >
      <p className="text-md3-label-md text-slate-500">
        Showing <span className="font-semibold text-slate-700">{startIndex}–{endIndex}</span> of{' '}
        <span className="font-semibold text-slate-700">{totalItems}</span> {plural}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* Previous */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            className={NAV_BTN}
          >
            <AltArrowLeftOutline size={16} color="#334155" />
            Previous
          </motion.button>

          {/* Page numbers */}
          {pageList.map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="w-9 h-9 flex items-center justify-center text-md3-label-lg text-slate-400">
                ⋯
              </span>
            ) : (
              <motion.button
                key={p}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onClick={() => setPage(p)}
                aria-current={p === page ? 'page' : undefined}
                className={`w-9 h-9 flex items-center justify-center rounded-lg text-md3-label-lg transition-colors ${
                  p === page
                    ? 'border border-slate-300 bg-white shadow-sm font-bold text-slate-900'
                    : 'font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {p}
              </motion.button>
            )
          )}

          {/* Next */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
            className={NAV_BTN}
          >
            Next
            <AltArrowRightOutline size={16} color="#334155" />
          </motion.button>
        </div>
      )}
    </div>
  )
}
