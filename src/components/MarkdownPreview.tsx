import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownPreviewProps {
  content: string
  className?: string
}

export default function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  return (
    <div className={`markdown-preview text-sm text-gray-300 leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-purple-300 mb-3 mt-4 pb-2 border-b border-purple-900/30">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-purple-200 mb-2 mt-4">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-gray-200 mb-2 mt-3">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-gray-300 mb-1 mt-2">{children}</h4>
          ),
          p: ({ children }) => <p className="mb-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-gray-300">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-gray-100">{children}</strong>,
          em: ({ children }) => <em className="italic text-gray-400">{children}</em>,
          code: ({ className: codeClassName, children }) => {
            const isInline = !codeClassName
            if (isInline) {
              return (
                <code className="bg-[#252b3b] text-pink-300 px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              )
            }
            return (
              <code className="text-xs font-mono">{children}</code>
            )
          },
          pre: ({ children }) => (
            <pre className="bg-[#0d1117] border border-purple-900/30 rounded-lg p-3 mb-3 overflow-x-auto text-xs font-mono leading-relaxed">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-purple-500/50 pl-3 my-2 text-gray-400 italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="min-w-full text-xs border border-purple-900/30 rounded">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#252b3b] text-gray-300">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-1.5 text-left font-semibold border-b border-purple-900/30">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 border-b border-purple-900/20">{children}</td>
          ),
          hr: () => <hr className="border-purple-900/30 my-4" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
