export default function OfflinePage() {
  return (
    <section className="page-root relative flex min-h-screen items-center justify-center px-4">
      <div className="dot-pattern pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-md text-center">
        <div className="glass-card rounded-2xl p-8">
          <p className="section-label">Status</p>
          <h1 className="mb-4 text-4xl tracking-widest text-foreground">
            offline<span className="blink-cursor">_</span>
          </h1>
          <p className="text-muted-foreground tracking-wider">
            You are currently offline. Please check your connection and try again.
          </p>
        </div>
      </div>
    </section>
  )
}
