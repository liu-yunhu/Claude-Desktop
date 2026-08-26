import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

/** 统一的 Markdown 渲染（GFM + 代码高亮） */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown-body text-[14px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
