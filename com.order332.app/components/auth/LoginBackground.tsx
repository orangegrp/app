'use client'

import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useDotPointerHighlight } from '@/hooks/useDotPointerHighlight'

type Props = {
  children: ReactNode
}

export function LoginBackground({ children }: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  useDotPointerHighlight(sectionRef)

  return (
    <section
      ref={sectionRef}
      className="page-root relative flex min-h-screen items-center justify-center px-4"
      style={
        {
          '--dot-pointer-x': '50%',
          '--dot-pointer-y': '50%',
        } as CSSProperties
      }
    >
      <div
        className="dot-pattern dot-pattern--dense pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div className="dot-pointer-highlight absolute inset-0" aria-hidden="true" />

      {/* Animated floating orbs */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] overflow-clip"
        aria-hidden="true"
        style={{ contain: 'layout style paint' }}
      >
        <div
          className="absolute left-[15%] top-[20%] h-[760px] w-[760px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.92 0 0 / 11%), transparent 68%)',
            filter: 'blur(96px)',
            animation: 'float-orb-1 28s ease-in-out infinite',
          }}
        />
        <div
          className="absolute right-[10%] top-[50%] h-[620px] w-[620px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.85 0 0 / 8.5%), transparent 68%)',
            filter: 'blur(88px)',
            animation: 'float-orb-2 34s ease-in-out infinite',
          }}
        />
        <div
          className="absolute left-[40%] bottom-[10%] h-[560px] w-[560px] rounded-full"
          style={{
            background: 'radial-gradient(circle, oklch(0.78 0 0 / 8%), transparent 68%)',
            filter: 'blur(78px)',
            animation: 'float-orb-3 24s ease-in-out infinite',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">{children}</div>
    </section>
  )
}
