import ReactMarkdown from 'react-markdown'
import { memo } from 'react'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

// Ref https://github.com/tailwindlabs/tailwindcss-typography to fine-tune the markdown style
const MarkdownRenderer = memo(function MarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="answer-markdown prose prose-sm prose-invert max-w-none prose-pre:p-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {children}
      </ReactMarkdown>
    </div>
  )
})

export default MarkdownRenderer
