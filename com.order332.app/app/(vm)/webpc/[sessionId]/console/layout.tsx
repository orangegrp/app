import { RequireAppPermission } from '@/components/auth/RequireAppPermission'
import { PERMISSIONS } from '@/lib/permissions'

export default function WebPCConsoleLayout({ children }: { children: React.ReactNode }) {
  return <RequireAppPermission permission={PERMISSIONS.APP_WEBPC}>{children}</RequireAppPermission>
}
