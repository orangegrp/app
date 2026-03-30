'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { Spinner } from '@/components/ui/spinner'

function CallbackLoading() {
  return (
    <div className="page-root relative flex min-h-screen items-center justify-center">
      <div className="dot-pattern pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative z-10 glass-card rounded-2xl px-8 py-7 flex flex-col items-center gap-4">
        <Spinner size="md" clockwise />
        <p className="text-sm text-muted-foreground tracking-wider">
          authenticating<span className="blink-cursor">_</span>
        </p>
      </div>
    </div>
  )
}

function AuthCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  useEffect(() => {
    // Token is delivered via hash fragment (#token=...) so it never appears in
    // server logs or Referer headers. Error redirects still use ?error= query params.
    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    const hashParams = new URLSearchParams(hash)
    const token = hashParams.get('token')
    const error = searchParams.get('error')

    if (error || !token) {
      clearAuth()
      router.replace(`/login?error=${error ?? 'auth_failed'}`)
      return
    }

    try {
      const [, b64] = token.split('.')
      const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
        sub: string
        permissions: string
        isPwa: boolean
      }
      setAuth(token, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
      router.replace('/home')
    } catch {
      clearAuth()
      router.replace('/login?error=invalid_token')
    }
  }, [searchParams, setAuth, clearAuth, router])

  return <CallbackLoading />
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<CallbackLoading />}>
      <AuthCallbackInner />
    </Suspense>
  )
}
