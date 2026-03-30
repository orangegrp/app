'use client'
import { useEffect, useLayoutEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { fetchAndMergeUserProfile } from '@/lib/fetch-user-profile'
import { isPWAContext } from '@/lib/pwa'
import { Spinner } from '@/components/ui/spinner'
import { PageBackground } from '@/components/layout/PageBackground'

/** QR handoff must stay mounted while signed in so the phone can approve the desktop session. */
function isQrHandoffPath(pathname: string | null): boolean {
  if (!pathname) return false
  return pathname === '/auth/qr' || pathname.startsWith('/auth/qr/')
}

function isLoginOrRegisterPath(pathname: string | null): boolean {
  return pathname === '/login' || pathname === '/register'
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

  const needsProbe = isLoginOrRegisterPath(pathname) && !qrHandoff && !accessToken
  const [probeSettled, setProbeSettled] = useState(() => !needsProbe)

  useLayoutEffect(() => {
    if (needsProbe) {
      setProbeSettled(false)
    } else {
      setProbeSettled(true)
    }
  }, [needsProbe])

  useEffect(() => {
    if (accessToken && !qrHandoff) {
      router.replace('/home')
    }
  }, [accessToken, router, qrHandoff])

  useEffect(() => {
    if (!needsProbe) return
    let cancelled = false
    fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPwa: isPWAContext() }),
      credentials: 'include',
    })
      .then(async (res) => {
        if (cancelled) return
        const { setAuth, clearAuth } = useAuthStore.getState()
        if (!res.ok) {
          clearAuth()
          setProbeSettled(true)
          return
        }
        const { accessToken: token } = await res.json() as { accessToken: string }
        const [, b64] = token.split('.')
        const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
          sub: string
          permissions: string
          isPwa: boolean
        }
        setAuth(token, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
        await fetchAndMergeUserProfile(token)
        router.replace('/home')
      })
      .catch(() => {
        if (!cancelled) {
          useAuthStore.getState().clearAuth()
          setProbeSettled(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [needsProbe, router])

  if (accessToken && !qrHandoff) return null

  if (needsProbe && !probeSettled) {
    return (
      <div className="page-root relative flex min-h-screen items-center justify-center">
        <PageBackground />
        <div className="relative z-10 glass-card rounded-2xl px-8 py-7 flex flex-col items-center gap-4">
          <Spinner size="md" clockwise />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
