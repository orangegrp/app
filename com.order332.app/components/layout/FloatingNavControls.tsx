'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Module-level stack — persists for the lifetime of the SPA session
const navHistory: string[] = []
let navIndex = -1

export function FloatingNavControls({ sidebarWidth }: { sidebarWidth: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const [snapshot, setSnapshot] = useState({ index: -1, length: 0 })
  const skipRef = useRef(false)
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track in-app navigation
  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false
      return
    }
    if (navIndex >= 0 && navHistory[navIndex] === pathname) return
    // New navigation — truncate any forward history
    navHistory.splice(navIndex + 1)
    navHistory.push(pathname)
    navIndex = navHistory.length - 1
    setSnapshot({ index: navIndex, length: navHistory.length })
  }, [pathname])

  const canGoBack = snapshot.index > 0
  const canGoForward = snapshot.index < snapshot.length - 1
  const hasNavigated = snapshot.length > 1

  const goBack = useCallback(() => {
    if (navIndex <= 0) return
    skipRef.current = true
    navIndex--
    setSnapshot({ index: navIndex, length: navHistory.length })
    router.push(navHistory[navIndex])
  }, [router])

  const goForward = useCallback(() => {
    if (navIndex >= navHistory.length - 1) return
    skipRef.current = true
    navIndex++
    setSnapshot({ index: navIndex, length: navHistory.length })
    router.push(navHistory[navIndex])
  }, [router])

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(true)
  }, [])

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => setVisible(false), 200)
  }, [])

  if (!hasNavigated) return null
  if (pathname.startsWith('/blog/edit/')) return null

  // Horizontally center over the main content area (viewport minus sidebar)
  const left = `calc(${sidebarWidth}px + (100vw - ${sidebarWidth}px) / 2)`

  return (
    <div
      className="hidden sm:block fixed z-[90] -translate-x-1/2"
      style={{ left, top: 'var(--instatus-banner-height, 0px)' }}
    >
      {/* Invisible hover capture zone */}
      <div
        className="h-9 w-40"
        onMouseEnter={show}
        onMouseLeave={hide}
      />

      {/* Pill — floats down on hover */}
      <div
        className={[
          'flex justify-center transition-[opacity,transform] duration-200 ease-out',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none',
        ].join(' ')}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <div className="glass-card rounded-full flex items-center px-1.5 py-1.5 gap-0.5">
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/8 disabled:opacity-30 disabled:cursor-default transition-colors"
            aria-label="Back"
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </button>

          {canGoForward && (
            <>
              <div className="w-px h-3.5 bg-white/15 mx-0.5" />
              <button
                onClick={goForward}
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
                aria-label="Forward"
              >
                <ChevronRight size={15} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
