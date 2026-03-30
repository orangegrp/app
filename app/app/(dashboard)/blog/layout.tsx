import { RequireAppPermission } from '@/components/auth/RequireAppPermission'
import { PERMISSIONS } from '@/lib/permissions'

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <RequireAppPermission permission={PERMISSIONS.APP_BLOG}>{children}</RequireAppPermission>
}
