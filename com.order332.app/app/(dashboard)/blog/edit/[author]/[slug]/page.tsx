import { use } from 'react'
import { BlogEditor } from '@/components/blog/BlogEditor'

interface Props {
  params: Promise<{ author: string; slug: string }>
}

export default function BlogEditPage({ params }: Props) {
  const { author, slug } = use(params)
  return <BlogEditor author={author} slug={slug} />
}
