'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { fetchAndMergeUserProfile } from '@/lib/fetch-user-profile'
import { isPWAContext } from '@/lib/pwa'
import { Spinner } from '@/components/ui/spinner'

export default function VMLayout({ children }: { children: React.ReactNode }) {
  const store = useAuthStore()
  const [isChecking, setIsChecking] = useState(
    () => !useAuthStore.getState().accessToken
  )

  useEffect(() => {
    if (store.accessToken) return

    fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPwa: isPWAContext() }),
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          store.clearAuth()
          window.location.href = '/login'
          return
        }
        const data = (await res.json()) as { accessToken: string }

        const [, b64] = data.accessToken.split('.')
        const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
          sub: string; permissions: string; isPwa: boolean
        }
        store.setAuth(data.accessToken, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
        const profileOk = await fetchAndMergeUserProfile(data.accessToken)
        if (!profileOk) {
          store.clearAuth()
          window.location.href = '/login'
          return
        }
        setIsChecking(false)
      })
      .catch(() => {
        store.clearAuth()
        window.location.href = '/login'
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
        <div className="glass-card rounded-2xl px-8 py-7 flex flex-col items-center gap-4">
          <Spinner size="md" clockwise />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
