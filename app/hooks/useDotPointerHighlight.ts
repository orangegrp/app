'use client'

import { useEffect, useRef, type RefObject } from 'react'

/** Tracks pointer position within `ref` and sets `--dot-pointer-x` / `--dot-pointer-y` (percent). */
export function useDotPointerHighlight(ref: RefObject<HTMLElement | null>): void {
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef({ x: 50, y: 50 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const apply = (): void => {
      rafRef.current = null
      const { x, y } = pendingRef.current
      el.style.setProperty('--dot-pointer-x', `${x}%`)
      el.style.setProperty('--dot-pointer-y', `${y}%`)
    }

    const onMove = (e: MouseEvent): void => {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      pendingRef.current = {
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      }
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(apply)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [ref])
}
