'use client'

import { RequireAppPermission } from '@/components/auth/RequireAppPermission'
import { PERMISSIONS } from '@/lib/permissions'

export default function MusicLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAppPermission permission={PERMISSIONS.APP_MUSIC}>
      {children}
    </RequireAppPermission>
  )
}
