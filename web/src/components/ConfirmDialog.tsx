import { createPortal } from 'react-dom'

interface Props {
  title: string
  /** Optional secondary line. Defaults to the irreversible-action warning when omitted. */
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` → red confirm button (destructive), `primary` → blue confirm button. */
  tone?: 'danger' | 'primary'
  /** Disables both buttons and shows a working label while an async action runs. */
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Reusable confirmation popup for admin actions. Matches the look of the original
 * inline `ConfirmDelete` (centered card, dimmed backdrop) so confirmations are
 * consistent across the admin panel. Rendered through a portal so it sits above
 * any scroll/overflow container.
 */
export default function ConfirmDialog({
  title,
  message = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4"
      onClick={loading ? undefined : onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 w-80 max-w-[90vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-md3-body-md text-slate-700 mb-1 font-semibold">{title}</p>
        {message && <p className="text-md3-label-md text-slate-400 mb-5">{message}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2 border border-slate-200 rounded-xl text-md3-body-md text-slate-600 font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2 text-white rounded-xl text-md3-body-md font-bold transition-opacity disabled:opacity-60 ${
              tone === 'danger' ? 'bg-red hover:opacity-90' : 'bg-blue hover:bg-blue-dark'
            }`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
