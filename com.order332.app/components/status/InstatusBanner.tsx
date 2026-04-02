'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  areIncidentIdsAllDismissed,
  dismissIncidentIds,
} from '@/lib/instatus-banner-dismiss'
import {
  parseInstatusSummary,
  shouldShowInstatusBanner,
  type InstatusSummary,
} from '@/lib/instatus-summary'

const POLL_MS = 8 * 60 * 1000

export function InstatusBanner() {
  const [summary, setSummary] = useState<InstatusSummary | null>(null)
  const [spacerHeight, setSpacerHeight] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)

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
        const ids = parsed.activeIncidents.map((i) => i.id)
        if (areIncidentIdsAllDismissed(ids)) {
          setSummary(null)
        } else {
          setSummary(parsed)
        }
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

  useLayoutEffect(() => {
    if (!summary) {
      setSpacerHeight(0)
      return
    }
    const el = barRef.current
    if (!el) return
    const sync = () => setSpacerHeight(el.offsetHeight)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [summary])

  useLayoutEffect(() => {
    const h = summary ? (spacerHeight > 0 ? spacerHeight : 52) : 0
    document.documentElement.style.setProperty('--instatus-banner-height', `${h}px`)
    return () => {
      document.documentElement.style.setProperty('--instatus-banner-height', '0px')
    }
  }, [summary, spacerHeight])

  const onDismiss = useCallback(() => {
    if (!summary) return
    dismissIncidentIds(summary.activeIncidents.map((i) => i.id))
    setSummary(null)
  }, [summary])

  if (!summary) return null

  const incidents = summary.activeIncidents
  const first = incidents[0]
  const rest = incidents.length - 1
  const detailsHref = rest > 0 ? summary.page.url : first.url
  const detailsLabel = rest > 0 ? 'View status page' : 'Details'

  const issueText = incidents.map((i) => i.name).join(' · ')
  const ariaLabel = `Service alert: ${issueText}`

  const reserveHeight = spacerHeight > 0 ? spacerHeight : 52

  return (
    <>
      <div className="shrink-0" style={{ height: reserveHeight }} aria-hidden />
      <div
        ref={barRef}
        role="status"
        aria-label={ariaLabel}
        className={cn(
          'fixed inset-x-0 top-0 z-[100] w-full border-b border-amber-500/25',
          'bg-gradient-to-r from-amber-950/90 via-amber-900/40 to-amber-950/90',
          'backdrop-blur-md',
          'pt-[max(0.5rem,env(safe-area-inset-top))]',
          'px-4 pb-2.5 sm:px-6',
        )}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-2 text-center sm:justify-between sm:text-left sm:gap-x-3">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:justify-start sm:gap-3">
            <AlertTriangle className="size-4 shrink-0 self-center text-amber-400/95" aria-hidden />
            <span className="shrink-0 text-sm font-medium tracking-wide text-amber-50/95">
              Service alert
            </span>
            <span className="shrink-0 text-amber-200/50" aria-hidden>
              ·
            </span>
            <p className="min-w-0 flex-1 text-sm leading-snug text-amber-100/90 break-words">
              {issueText}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={detailsHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'rounded-lg border border-amber-400/35 bg-amber-950/50 px-3 py-1.5',
                'text-xs font-medium tracking-widest text-amber-100',
                'transition-colors hover:border-amber-300/50 hover:bg-amber-900/60 hover:text-white',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/80',
              )}
            >
              {detailsLabel}
            </a>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss alert"
              className={cn(
                'flex size-9 items-center justify-center rounded-lg text-amber-200/90',
                'transition-colors hover:bg-amber-950/80 hover:text-amber-50',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/80',
              )}
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
