'use client'

import { hasAnyPermission, hasPermission } from '@/lib/permissions'
import { useAuthStore } from '@/lib/auth-store'

export function usePermission(permission: string): boolean {
  const user = useAuthStore((s) => s.user)
  if (!user) return false
  return hasPermission(user.permissions, permission)
}

export function useAnyPermission(permissions: string[]): boolean {
  const user = useAuthStore((s) => s.user)
  if (!user) return false
  return hasAnyPermission(user.permissions, permissions)
}
