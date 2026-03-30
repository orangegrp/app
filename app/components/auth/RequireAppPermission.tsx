'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { usePermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/lib/auth-store'
import { Spinner } from '@/components/ui/spinner'

export function RequireAppPermission({
  permission,
  children,
}: {
  permission: string
  children: ReactNode
}): ReactNode {
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const allowed = usePermission(permission)

  useEffect(() => {
    if (!accessToken) return
    if (!allowed) router.replace('/home')
  }, [accessToken, allowed, router])

  if (!accessToken) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="md" clockwise />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="md" clockwise />
      </div>
    )
  }

  return <>{children}</>
}
