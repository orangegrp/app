'use client'

import type { ReactElement, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export function DashboardPageTransition({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname()
  return (
    <div key={pathname} className="min-h-full">
      {children}
    </div>
  )
}
