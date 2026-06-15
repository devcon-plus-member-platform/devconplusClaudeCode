import type { PointTransaction } from '@devcon-plus/supabase'

export default function TransactionRow({ tx }: { tx: PointTransaction }) {
  const isPositive = tx.amount > 0
  const timeStr = tx.created_at
    ? new Date(tx.created_at).toLocaleString('en-PH', {
        month: '2-digit', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : ''

  return (
    <div className="flex items-start justify-between py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-md3-body-md font-medium text-slate-900">{tx.description}</p>
        <p className="text-md3-label-md text-slate-400 mt-0.5">
          Transaction no. {tx.transaction_ref} · {timeStr}
        </p>
      </div>
      <p className={`text-md3-body-md font-bold ml-4 flex-shrink-0 ${isPositive ? 'text-green' : 'text-red'}`}>
        {isPositive ? '+' : ''}{tx.amount.toLocaleString()} pts
      </p>
    </div>
  )
}
