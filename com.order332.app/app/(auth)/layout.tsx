'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'

/** QR handoff must stay mounted while signed in so the phone can approve the desktop session. */
function isQrHandoffPath(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname === '/auth/qr' || pathname.startsWith('/auth/qr/')
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const router = useRouter()
  const pathname = usePathname()
  const qrHandoff = isQrHandoffPath(pathname)

  useEffect(() => {
    if (accessToken && !qrHandoff) {
      router.replace('/home')
    }
  }, [accessToken, router, qrHandoff])

  if (accessToken && !qrHandoff) return null
  return <>{children}</>
}
