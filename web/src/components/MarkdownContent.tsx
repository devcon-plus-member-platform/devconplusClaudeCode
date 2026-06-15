import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface MarkdownContentProps {
  value: string
  className?: string
}

const markdownComponents: Components = {
  h2: ({ children }) => (
    <h2 className="text-md3-headline-sm font-bold text-slate-900 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-md3-title-md font-semibold text-slate-900 mb-1">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-md3-body-md text-slate-600 leading-relaxed mb-2">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 text-md3-body-md text-slate-600 mb-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 text-md3-body-md text-slate-600 mb-2">{children}</ol>
  ),
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="font-mono text-md3-label-md bg-slate-100 px-1 rounded">{children}</code>
  ),
  img: () => null,
}

export function MarkdownContent({ value, className = '' }: MarkdownContentProps) {
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {value}
      </Markdown>
    </div>
  )
}
