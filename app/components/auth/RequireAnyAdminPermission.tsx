'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAnyPermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/lib/auth-store'
import { PERMISSIONS } from '@/lib/permissions'
import { Spinner } from '@/components/ui/spinner'

const ADMIN_PERMS = [
  PERMISSIONS.ADMIN_INVITES_MANAGE,
  PERMISSIONS.ADMIN_SYSTEM_CLEANUP,
  PERMISSIONS.ADMIN_PERMISSIONS_MANAGE,
]

export function RequireAnyAdminPermission({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const allowed = useAnyPermission(ADMIN_PERMS)

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
