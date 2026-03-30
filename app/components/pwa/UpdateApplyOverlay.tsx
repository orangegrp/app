'use client'

import { useEffect, useState } from 'react'

const PROGRESS_MS = 2000
const FLASH_MS = 500
const REDUCED_TOTAL_MS = 350

type Props = {
  onComplete: () => void
}

export function UpdateApplyOverlay({ onComplete }: Props) {
  const [phase, setPhase] = useState<'progress' | 'flash'>('progress')
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    })
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      const t = window.setTimeout(() => {
        onComplete()
      }, REDUCED_TOTAL_MS)
      return () => window.clearTimeout(t)
    }

    const t = window.setTimeout(() => {
      setPhase('flash')
    }, PROGRESS_MS)
    return () => window.clearTimeout(t)
  }, [reducedMotion, onComplete])

  useEffect(() => {
    if (reducedMotion || phase !== 'flash') return
    const t = window.setTimeout(() => {
      onComplete()
    }, FLASH_MS)
    return () => window.clearTimeout(t)
  }, [phase, reducedMotion, onComplete])

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{ background: 'oklch(0 0 0 / 75%)', backdropFilter: 'blur(6px)' }}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="update-apply-title"
    >
      <div className="glass-card relative z-[1] w-full max-w-sm rounded-2xl p-6">
        {phase === 'flash' && (
          <div
            className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-black/40"
            aria-hidden
          />
        )}
        <div className="relative z-[1] flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <p className="section-label">Updating</p>
            <h2 id="update-apply-title" className="text-xl tracking-widest text-foreground">
              Applying update<span className="blink-cursor">_</span>
            </h2>
            <p className="mt-1 text-sm tracking-wider text-muted-foreground">
              Please wait while the app updates.
            </p>
          </div>

          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            {reducedMotion ? (
              <div className="h-full w-full rounded-full bg-primary" />
            ) : (
              <div className="update-apply-progress-fill h-full origin-left rounded-full bg-primary" />
            )}
          </div>
        </div>
      </div>

      {phase === 'flash' && !reducedMotion && (
        <div
          className="update-flash-orbs pointer-events-none absolute inset-0 z-[2] overflow-hidden"
          aria-hidden
        >
          <div
            className="update-flash-orb update-flash-orb--1 absolute left-[-25%] top-[-15%] h-[min(165vw,1300px)] w-[min(165vw,1300px)] rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(0.98 0 0 / 50%), transparent 52%)',
            }}
          />
          <div
            className="update-flash-orb update-flash-orb--2 absolute right-[-20%] top-[10%] h-[min(150vw,1200px)] w-[min(150vw,1200px)] rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(0.95 0 0 / 45%), transparent 52%)',
            }}
          />
          <div
            className="update-flash-orb update-flash-orb--3 absolute bottom-[-18%] left-[5%] h-[min(155vw,1250px)] w-[min(155vw,1250px)] rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(1 0 0 / 42%), transparent 55%)',
            }}
          />
          <div
            className="update-flash-orb update-flash-orb--4 absolute left-1/2 top-1/2 h-[min(175vw,1400px)] w-[min(175vw,1400px)] rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(1 0 0 / 48%), transparent 50%)',
            }}
          />
        </div>
      )}
    </div>
  )
}
