import { useState } from 'react'
import { MarkdownContent } from './MarkdownContent'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  error?: string
  maxLength?: number
}

type EditorTab = 'edit' | 'preview'

export function MarkdownEditor({
  value,
  onChange,
  error,
  maxLength = 1000,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<EditorTab>('edit')
  const length = value.length
  const isOverLimit = length > maxLength

  return (
    <div>
      <div className="flex border-b-2 border-slate-200">
        <button
          type="button"
          onClick={() => setTab('edit')}
          className={`px-4 py-2 text-md3-label-md font-semibold rounded-t-md transition-colors ${
            tab === 'edit' ? 'bg-primary text-white' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setTab('preview')}
          className={`px-4 py-2 text-md3-label-md font-semibold rounded-t-md transition-colors ${
            tab === 'preview' ? 'bg-primary text-white' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          Preview
        </button>
      </div>

      <div className="border border-t-0 border-slate-200 rounded-b-xl min-h-[120px]">
        {tab === 'edit' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={5}
            className="w-full p-3 font-mono text-sm text-slate-900 resize-none bg-transparent outline-none rounded-b-xl"
            placeholder="What is this event about? Markdown supported."
          />
        ) : (
          <div className="p-3 min-h-[120px]">
            {value.trim() ? (
              <MarkdownContent value={value} />
            ) : (
              <p className="text-md3-body-md text-slate-400 italic">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-1">
        {tab === 'edit' ? (
          <span className="text-md3-label-sm text-slate-400">
            {'**bold**'}&nbsp;&nbsp;{'_italic_'}&nbsp;&nbsp;{'## heading'}&nbsp;&nbsp;{'- list'}
          </span>
        ) : (
          <span />
        )}
        <span
          className={`text-md3-label-sm font-mono ${
            isOverLimit ? 'text-red font-semibold' : 'text-slate-400'
          }`}
        >
          {length} / {maxLength}
        </span>
      </div>

      {error && <p className="text-md3-label-md text-red mt-1">{error}</p>}
    </div>
  )
}
