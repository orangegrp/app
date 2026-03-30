'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/auth-store'
import { isPWAContext } from '@/lib/pwa'
import { consumePostLoginRedirect } from '@/lib/qr-login-redirect'
import { Spinner } from '@/components/ui/spinner'

interface Props {
  onFatalError?: (msg: string) => void
}

export function MagicLinkForm({ onFatalError }: Props) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/magic/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), isPwa: isPWAContext() }),
        credentials: 'include',
      })

      if (!res.ok) {
        onFatalError?.('Invalid or expired magic link.')
        toast.error('Invalid or expired magic link.')
        return
      }

      const { accessToken } = await res.json() as { accessToken: string }
      const [, b64] = accessToken.split('.')
      const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
        sub: string; permissions: string; isPwa: boolean
      }
      setAuth(accessToken, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
      router.push(consumePostLoginRedirect())
    } catch {
      const msg = 'Something went wrong. Please try again.'
      onFatalError?.(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        data-slot="input"
        type="text"
        placeholder="Paste your magic link token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className="w-full rounded-lg px-3 py-2 tracking-wider text-foreground placeholder:text-muted-foreground"
        style={{ minHeight: '44px', fontSize: '1rem' }}
      />
      <button
        type="submit"
        disabled={loading || !token.trim()}
        className="glass-button glass-button-glass w-full rounded-lg px-4 py-2 text-sm tracking-widest disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size="xs" clockwise />
            Verifying...
          </span>
        ) : 'Verify token'}
      </button>
    </form>
  )
}
