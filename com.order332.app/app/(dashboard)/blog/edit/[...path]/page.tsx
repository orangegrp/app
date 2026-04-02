import { use } from 'react'
import { BlogEditor } from '@/components/blog/BlogEditor'

interface Props {
  params: Promise<{ path: string[] }>
}

export default function BlogEditPage({ params }: Props) {
  const { path } = use(params)
  // Reconstruct the full repo-relative path with leading slash
  const repoPath = '/' + path.join('/')
  return <BlogEditor repoPath={repoPath} />
}
