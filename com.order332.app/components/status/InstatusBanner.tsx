'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parseInstatusSummary,
  shouldShowInstatusBanner,
  type InstatusSummary,
} from '@/lib/instatus-summary'

const POLL_MS = 8 * 60 * 1000

export function InstatusBanner() {
  const [summary, setSummary] = useState<InstatusSummary | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/status/summary', { credentials: 'same-origin' })
      if (!res.ok) {
        setSummary(null)
        return
      }
      const raw: unknown = await res.json()
      const parsed = parseInstatusSummary(raw)
      if (parsed && shouldShowInstatusBanner(parsed)) {
        setSummary(parsed)
      } else {
        setSummary(null)
      }
    } catch {
      setSummary(null)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  if (!summary) return null

  const incidents = summary.activeIncidents
  const first = incidents[0]
  const rest = incidents.length - 1
  const detailsHref = rest > 0 ? summary.page.url : first.url
  const detailsLabel = rest > 0 ? 'View status page' : 'Details'

  return (
    <div
      role="status"
      className={cn(
        'relative z-50 w-full shrink-0 border-b border-amber-500/25',
        'bg-gradient-to-r from-amber-950/90 via-amber-900/40 to-amber-950/90',
        'backdrop-blur-md',
        'pt-[max(0.5rem,env(safe-area-inset-top))]',
        'px-4 pb-2.5 sm:px-6',
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center sm:justify-between sm:text-left">
        <div className="flex min-w-0 flex-1 items-start justify-center gap-2.5 sm:justify-start">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-amber-400/95"
            aria-hidden
          />
          <p className="min-w-0 text-sm leading-snug text-amber-50/95">
            <span className="font-medium tracking-wide">Service alert</span>
            <span className="mx-2 text-amber-200/50" aria-hidden>
              ·
            </span>
            <span className="text-amber-100/90">{first.name}</span>
            {rest > 0 ? (
              <span className="text-amber-200/75"> (+{rest} more)</span>
            ) : null}
          </p>
        </div>
        <a
          href={detailsHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'shrink-0 rounded-lg border border-amber-400/35 bg-amber-950/50 px-3 py-1.5',
            'text-xs font-medium tracking-widest text-amber-100',
            'transition-colors hover:border-amber-300/50 hover:bg-amber-900/60 hover:text-white',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/80',
          )}
        >
          {detailsLabel}
        </a>
      </div>
    </div>
  )
}
