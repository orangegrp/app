'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { isPWAContext } from '@/lib/pwa'
import { Spinner } from '@/components/ui/spinner'
import { QRCodeSVG } from 'qrcode.react'
import { QR_CODE_POLL_MS, QR_LOGIN_SYMBOL_VERSION } from '@/lib/qr-shared'

type QRStatus = 'loading' | 'active' | 'scanned' | 'approved' | 'rejected' | 'expired' | 'error'

interface Props {
  onFatalError?: (msg: string) => void
}

export function QRLoginPanel({ onFatalError }: Props) {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [status, setStatus] = useState<QRStatus>('loading')
  const [qrUrl, setQrUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionGenRef = useRef(0)
  const lastQrUrlRef = useRef('')

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const finalizeLogin = useCallback(async (sid: string) => {
    stopPolling()
    try {
      const res = await fetch('/api/auth/qr/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, isPwa: isPWAContext() }),
        credentials: 'include',
      })
      if (!res.ok) {
        const msg = 'Failed to complete login.'
        setErrorMsg(msg)
        setStatus('error')
        onFatalError?.(msg)
        return
      }
      const { accessToken } = await res.json() as { accessToken: string }
      const [, b64] = accessToken.split('.')
      const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
        sub: string; permissions: string; isPwa: boolean
      }
      setAuth(accessToken, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
      router.push('/home')
    } catch {
      const msg = 'Login failed. Please try again.'
      setErrorMsg(msg)
      setStatus('error')
      onFatalError?.(msg)
    }
  }, [setAuth, router, stopPolling, onFatalError])

  const poll = useCallback(async (sid: string, gen: number) => {
    if (gen !== sessionGenRef.current) return
    try {
      const res = await fetch(`/api/auth/qr/code?sessionId=${encodeURIComponent(sid)}`)
      if (gen !== sessionGenRef.current) return
      if (!res.ok) { stopPolling(); setStatus('error'); setErrorMsg('QR session error'); return }
      const data = await res.json() as {
        status?: QRStatus; qrUrl?: string
      }
      if (gen !== sessionGenRef.current) return
      if (data.status === 'approved') { setStatus('approved'); void finalizeLogin(sid); return }
      if (data.status === 'rejected') { stopPolling(); setStatus('rejected'); return }
      if (data.status === 'expired') { stopPolling(); setStatus('expired'); return }
      if (data.status === 'scanned') { setStatus('scanned'); return }
      if (data.qrUrl) {
        if (data.qrUrl !== lastQrUrlRef.current) {
          lastQrUrlRef.current = data.qrUrl
          setQrUrl(data.qrUrl)
        }
        setStatus('active')
      }
    } catch { /* network blip */ }
  }, [finalizeLogin, stopPolling])

  const startSession = useCallback(async () => {
    stopPolling()
    const gen = ++sessionGenRef.current
    lastQrUrlRef.current = ''
    setQrUrl('')
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/qr/init', { method: 'POST', credentials: 'include' })
      if (gen !== sessionGenRef.current) return
      if (!res.ok) { setStatus('error'); setErrorMsg('Failed to start QR session'); return }
      const { sessionId: sid } = await res.json() as { sessionId: string }
      if (gen !== sessionGenRef.current) return
      await poll(sid, gen)
      if (gen !== sessionGenRef.current) return
      pollRef.current = setInterval(() => void poll(sid, gen), QR_CODE_POLL_MS)
    } catch {
      if (gen === sessionGenRef.current) {
        setStatus('error'); setErrorMsg('Failed to start QR session')
      }
    }
  }, [poll, stopPolling])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void startSession()
    })
    return () => {
      cancelled = true
      stopPolling()
      sessionGenRef.current += 1
    }
  }, [startSession, stopPolling])

  const retry = () => { void startSession() }

  return (
    <div className="flex flex-col items-center gap-4">
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Spinner size="md" clockwise />
          <p className="text-xs text-muted-foreground tracking-wider">generating<span className="blink-cursor">_</span></p>
        </div>
      )}

      {status === 'active' && qrUrl && (
        <div className="flex flex-col items-center gap-3">
          <div className="overflow-hidden rounded-2xl bg-white p-3 shadow-[0_4px_24px_oklch(0_0_0/12%)]">
            <QRCodeSVG
              value={qrUrl}
              size={200}
              bgColor="#ffffff"
              fgColor="#000000"
              level="H"
              minVersion={QR_LOGIN_SYMBOL_VERSION}
            />
          </div>
        </div>
      )}

      {status === 'scanned' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Spinner size="md" clockwise />
          <p className="text-sm tracking-wider">QR scanned<span className="blink-cursor">_</span></p>
          <p className="text-xs text-muted-foreground tracking-wider">Waiting for approval on your phone…</p>
        </div>
      )}

      {(status === 'rejected' || status === 'expired' || status === 'error') && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm tracking-wider" style={{ color: 'oklch(0.7 0.19 22)' }}>
            {status === 'rejected' ? 'Login was rejected' : status === 'expired' ? 'QR code expired' : errorMsg}
          </p>
          <button onClick={retry} className="glass-button glass-button-ghost rounded-lg px-4 py-2 text-xs tracking-widest text-muted-foreground">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
