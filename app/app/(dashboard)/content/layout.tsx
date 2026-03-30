import { RequireAppPermission } from '@/components/auth/RequireAppPermission'
import { PERMISSIONS } from '@/lib/permissions'

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return <RequireAppPermission permission={PERMISSIONS.APP_CONTENT}>{children}</RequireAppPermission>
}
