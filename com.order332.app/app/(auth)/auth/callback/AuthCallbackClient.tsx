'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { consumePostLoginRedirect } from '@/lib/qr-login-redirect'
import { Spinner } from '@/components/ui/spinner'

export function AuthCallbackClient() {
  const searchParams = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const router = useRouter()

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      router.replace('/login')
      return
    }

    try {
      const [, b64] = token.split('.')
      const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
        sub: string; permissions: string; isPwa: boolean
      }
      setAuth(token, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
      router.replace(consumePostLoginRedirect())
    } catch {
      router.replace('/login')
    }
  }, [searchParams, setAuth, router])

  return (
    <section className="page-root relative flex min-h-screen items-center justify-center px-4">
      <div className="dot-pattern pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 glass-card rounded-2xl px-8 py-7 flex flex-col items-center gap-4">
        <Spinner size="md" clockwise />
        <p className="text-sm text-muted-foreground tracking-wider">
          authenticating<span className="blink-cursor">_</span>
        </p>
      </div>
    </section>
  )
}
