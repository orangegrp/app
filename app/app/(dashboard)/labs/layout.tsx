import { RequireAppPermission } from '@/components/auth/RequireAppPermission'
import { PERMISSIONS } from '@/lib/permissions'

export default function LabsLayout({ children }: { children: React.ReactNode }) {
  return <RequireAppPermission permission={PERMISSIONS.APP_LABS}>{children}</RequireAppPermission>
}
