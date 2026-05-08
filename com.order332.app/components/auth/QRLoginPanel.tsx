'use client'
import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { isPWAContext } from '@/lib/pwa'
import { Spinner } from '@/components/ui/spinner'
import { QRCodeSVG } from 'qrcode.react'
import { QR_CODE_POLL_MS, QR_LOGIN_SYMBOL_VERSION } from '@/lib/qr-shared'

type QRStatus =
  | 'loading'
  | 'active'
  | 'awaiting-otp'
  | 'otp-submitting'
  | 'otp-submitted'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'error'

const OTP_LENGTH = 6

interface OtpInputProps {
  onComplete: (value: string) => void
  disabled?: boolean
  errorMsg?: string
}

function OtpInput({ onComplete, disabled, errorMsg }: OtpInputProps) {
  const id = useId()
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null))

  const focusIndex = (i: number) => {
    inputRefs.current[Math.max(0, Math.min(i, OTP_LENGTH - 1))]?.focus()
  }

  const update = (nextDigits: string[]) => {
    setDigits(nextDigits)
    const value = nextDigits.join('')
    if (value.length === OTP_LENGTH) {
      onComplete(value)
    }
  }

  const handleChange = (i: number, raw: string) => {
    const ch = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-1)
    if (!ch) return
    const next = [...digits]
    next[i] = ch
    update(next)
    if (i < OTP_LENGTH - 1) focusIndex(i + 1)
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = [...digits]
      if (digits[i]) {
        next[i] = ''
        update(next)
      } else if (i > 0) {
        next[i - 1] = ''
        update(next)
        focusIndex(i - 1)
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusIndex(i - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusIndex(i + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (!text) return
    const next = Array(OTP_LENGTH).fill('')
    for (let i = 0; i < OTP_LENGTH && i < text.length; i++) next[i] = text[i]
    update(next)
    focusIndex(Math.min(text.length, OTP_LENGTH - 1))
  }

  const handleFocus = (i: number) => {
    inputRefs.current[i]?.select()
  }

  const boxClass =
    'w-10 h-12 text-center rounded-lg text-lg font-mono tracking-widest bg-white/5 border border-white/10 text-foreground focus:outline-none focus:border-white/30 focus:bg-white/8 transition-colors'

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-1.5" onPaste={handlePaste}>
        {Array.from({ length: OTP_LENGTH }, (_, i) => (
          <span key={i} className="contents">
            {i === 3 && (
              <span className="text-muted-foreground/40 text-sm select-none mx-0.5">—</span>
            )}
            <input
              ref={(el) => { inputRefs.current[i] = el }}
              id={`${id}-${i}`}
              type="text"
              inputMode="text"
              maxLength={2}
              value={digits[i]}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={() => handleFocus(i)}
              disabled={disabled}
              autoComplete="off"
              autoFocus={i === 0}
              className={boxClass}
              aria-label={`Code digit ${i + 1}`}
            />
          </span>
        ))}
      </div>
      {errorMsg && (
        <p className="text-xs tracking-wider" style={{ color: 'oklch(0.7 0.19 22)' }}>
          {errorMsg}
        </p>
      )}
    </div>
  )
}

interface Props {
  onFatalError?: (msg: string) => void
  /** Called when login is ready to finalize. Receives a `commit` function that must be called to actually set auth state and navigate — allows the caller to delay commit for an animation. */
  onApproved?: (commit: () => void) => void
}

export function QRLoginPanel({ onFatalError, onApproved }: Props) {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [status, setStatus] = useState<QRStatus>('loading')
  const [qrUrl, setQrUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionGenRef = useRef(0)
  const lastQrUrlRef = useRef('')
  const sessionIdRef = useRef<string>('')
  const onApprovedRef = useRef(onApproved)
  useEffect(() => { onApprovedRef.current = onApproved }, [onApproved])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null }
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
      const commit = () => {
        setAuth(accessToken, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
        router.push('/home')
      }
      if (onApprovedRef.current) {
        onApprovedRef.current(commit)
      } else {
        commit()
      }
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
      const data = await res.json() as { status?: string; qrUrl?: string }
      if (gen !== sessionGenRef.current) return
      if (data.status === 'approved') { setStatus('approved'); void finalizeLogin(sid); return }
      if (data.status === 'rejected') { stopPolling(); setStatus('rejected'); return }
      if (data.status === 'expired') { stopPolling(); setStatus('expired'); return }
      if (data.status === 'scanned') { setStatus('awaiting-otp'); return }
      if (data.status === 'otp-verified') { setStatus('otp-submitted') }
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
    sessionIdRef.current = ''
    setQrUrl('')
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/qr/init', { method: 'POST', credentials: 'include' })
      if (gen !== sessionGenRef.current) return
      if (!res.ok) { setStatus('error'); setErrorMsg('Failed to start QR session'); return }
      const { sessionId: sid } = await res.json() as { sessionId: string }
      if (gen !== sessionGenRef.current) return
      sessionIdRef.current = sid
      const schedulePoll = () => {
        if (gen !== sessionGenRef.current) return
        pollRef.current = setTimeout(() => {
          void poll(sid, gen).then(schedulePoll)
        }, QR_CODE_POLL_MS)
      }
      await poll(sid, gen)
      if (gen !== sessionGenRef.current) return
      schedulePoll()
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

  const handleOtpComplete = async (otp: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    setStatus('otp-submitting')
    setErrorMsg('')
    try {
      const res = await fetch('/api/auth/qr/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, otp }),
      })
      if (!res.ok) {
        setErrorMsg('Incorrect code. Try again.')
        setStatus('awaiting-otp')
        return
      }
      setStatus('otp-submitted')
    } catch {
      setErrorMsg('Something went wrong. Try again.')
      setStatus('awaiting-otp')
    }
  }

  const retry = () => { void startSession() }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {(status === 'loading' || status === 'otp-submitting' || status === 'otp-submitted') && (
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" clockwise />
        </div>
      )}

      {status === 'active' && qrUrl && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-xs tracking-wider text-muted-foreground">
            Scan with your logged-in mobile device
          </p>
          <div className="relative">
            <div
              className="pointer-events-none absolute inset-0 rounded-3xl"
              style={{
                background: 'radial-gradient(circle, oklch(1 0 0 / 35%), transparent 70%)',
                filter: 'blur(20px)',
                transform: 'scale(1.35)',
              }}
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-2xl bg-white p-3 shadow-[0_4px_24px_oklch(0_0_0/12%)]">
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
        </div>
      )}

      {status === 'awaiting-otp' && (
        <div className="flex flex-col items-center gap-3 w-full">
          <p className="text-xs tracking-wider text-muted-foreground text-center">
            Enter the code shown on your phone
          </p>
          <OtpInput
            onComplete={handleOtpComplete}
            disabled={false}
            errorMsg={errorMsg}
          />
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
