import { PageBackground } from '@/components/layout/PageBackground'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <PageBackground />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
