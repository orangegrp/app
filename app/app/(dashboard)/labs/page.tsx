import { PageBackground } from '@/components/layout/PageBackground'

export default function LabsPage() {
  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">
        <p className="section-label">332 Labs</p>
        <h2 className="mb-8 text-4xl tracking-widest text-foreground">
          332 Labs<span className="blink-cursor">_</span>
        </h2>
        <div className="glass-card rounded-2xl p-8">
          <p className="card-label mb-4">Coming Soon</p>
          <p className="text-muted-foreground tracking-wider">
            Interactive education, experiments, and courses.
          </p>
        </div>
      </div>
    </div>
  )
}
