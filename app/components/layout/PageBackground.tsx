'use client'

import { useRef, type CSSProperties } from 'react'
import { useDotPointerHighlight } from '@/hooks/useDotPointerHighlight'

/** Dense dot grid + soft pointer-follow highlight (same as login; no ambient orbs). */
export function PageBackground() {
  const shellRef = useRef<HTMLDivElement>(null)
  useDotPointerHighlight(shellRef)

  return (
    <div
      ref={shellRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
      style={
        {
          '--dot-pointer-x': '50%',
          '--dot-pointer-y': '50%',
        } as CSSProperties
      }
    >
      <div className="dot-pattern dot-pattern--dense absolute inset-0" />
      <div className="dot-pointer-highlight absolute inset-0" />
    </div>
  )
}
