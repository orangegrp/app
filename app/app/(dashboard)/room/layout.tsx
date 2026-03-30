import { RequireAppPermission } from '@/components/auth/RequireAppPermission'
import { PERMISSIONS } from '@/lib/permissions'

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return <RequireAppPermission permission={PERMISSIONS.APP_ROOM}>{children}</RequireAppPermission>
}
