'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { isPWAContext } from '@/lib/pwa'
import { Spinner } from '@/components/ui/spinner'

function MagicLoading() {
  return (
    <div className="page-root relative flex min-h-screen items-center justify-center">
      <div className="dot-pattern pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 glass-card rounded-2xl px-8 py-7 flex flex-col items-center gap-4">
        <Spinner size="md" clockwise />
        <p className="text-sm text-muted-foreground tracking-wider">
          verifying<span className="blink-cursor">_</span>
        </p>
      </div>
    </div>
  )
}

function MagicPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      router.replace('/login?error=missing_token')
      return
    }

    fetch('/api/auth/magic/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, isPwa: isPWAContext() }),
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string }
          setError(data.error ?? 'Link expired or already used')
          return
        }
        const { accessToken } = await res.json() as { accessToken: string }
        const [, b64] = accessToken.split('.')
        const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
          sub: string
          permissions: string
          isPwa: boolean
        }
        setAuth(accessToken, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
        router.replace('/home')
      })
      .catch(() => {
        setError('Something went wrong. Please try again.')
      })
  }, [searchParams, router, setAuth])

  if (error) {
    return (
      <div className="page-root relative flex min-h-screen items-center justify-center px-4">
        <div className="dot-pattern pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative z-10 glass-card rounded-2xl px-8 py-7 flex flex-col items-center gap-4 max-w-sm w-full text-center">
          <p className="text-sm tracking-wider" style={{ color: 'oklch(0.7 0.19 22)' }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="glass-button glass-button-ghost rounded-lg px-4 py-2 text-xs tracking-widest text-muted-foreground"
          >
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return <MagicLoading />
}

export default function MagicPage() {
  return (
    <Suspense fallback={<MagicLoading />}>
      <MagicPageInner />
    </Suspense>
  )
}
