import { MagniferOutline } from 'solar-icon-set'

interface SearchEmptyStateProps {
  headline: string
  body: string
  className?: string
}

export default function SearchEmptyState({ headline, body, className = '' }: SearchEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-4 py-16 ${className}`}>
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <MagniferOutline className="w-8 h-8 text-slate-400" />
      </div>
      <h2 className="text-md3-body-lg font-bold text-slate-900 mb-1">{headline}</h2>
      <p className="text-md3-body-md text-slate-500">{body}</p>
    </div>
  )
}
