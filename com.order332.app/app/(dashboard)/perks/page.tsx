import { PageBackground } from '@/components/layout/PageBackground'

export default function PerksPage() {
  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">
        <p className="section-label">Member Perks</p>
        <h2 className="mb-8 text-4xl tracking-widest text-foreground">
          Member Perks<span className="blink-cursor">_</span>
        </h2>

        No partner offers available at this time. Please check back later.
      </div>
    </div>
  )
}
