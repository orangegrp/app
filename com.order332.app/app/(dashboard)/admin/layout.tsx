import { RequireAnyAdminPermission } from '@/components/auth/RequireAnyAdminPermission'

export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  return <RequireAnyAdminPermission>{children}</RequireAnyAdminPermission>
}
