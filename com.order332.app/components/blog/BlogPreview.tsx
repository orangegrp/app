'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface Props {
  markdown: string
}

export function BlogPreview({ markdown }: Props) {
  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <div className="blog-preview max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  )
}
