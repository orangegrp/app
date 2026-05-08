'use client'
import { Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { fetchAndMergeUserProfile } from '@/lib/fetch-user-profile'
import { apiFetch } from '@/lib/api-client'
import { isPWAContext } from '@/lib/pwa'
import { mapQrScanError, QR_LINK_INCOMPLETE_MSG } from '@/lib/qr-scan-errors'
import { Spinner } from '@/components/ui/spinner'
import { SlideToApprove } from '@/components/auth/SlideToApprove'
import { Globe, MapPin, Monitor, ShieldCheck } from 'lucide-react'
import type { ReadonlyURLSearchParams } from 'next/navigation'

function readQrParams(searchParams: ReadonlyURLSearchParams): { session: string | null; token: string | null } {
  let session = searchParams.get('session')
  let token = searchParams.get('token')
  if (typeof window !== 'undefined') {
    const qs = new URLSearchParams(window.location.search)
    if (!session) session = qs.get('session')
    if (!token) token = qs.get('token')
  }
  return { session, token }
}

interface DesktopInfo {
  ip: string
  location: string
  device: string
}

type PageState =
  | 'checking-auth'
  | 'scanning'
  | 'otp-display'
  | 'approval'
  | 'approved'
  | 'rejected'
  | 'error'

const APPROVAL_PROMPT_DELAY_MS = 1000
const APPROVE_BUTTON_COOLDOWN_SEC = 3

const rowIconClass = 'size-5 shrink-0 text-muted-foreground'

function QRScanFallback() {
  return (
    <section className="page-root relative flex min-h-screen items-center justify-center px-4">
      <div className="dot-pattern pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="glass-card rounded-3xl px-8 py-10 w-full max-w-sm relative z-10 flex flex-col items-center gap-6">
        <Spinner size="md" clockwise />
        <p className="text-sm text-muted-foreground tracking-wider">
          checking<span className="blink-cursor">_</span>
        </p>
      </div>
    </section>
  )
}

function QRScanPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pageState, setPageState] = useState<PageState>('checking-auth')
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isActing, setIsActing] = useState(false)
  const [approveSecLeft, setApproveSecLeft] = useState(0)

  useLayoutEffect(() => {
    if (pageState !== 'approval') {
      setApproveSecLeft(0)
      return
    }
    setApproveSecLeft(APPROVE_BUTTON_COOLDOWN_SEC)
    const iv = setInterval(() => {
      setApproveSecLeft((n) => {
        if (n <= 1) {
          clearInterval(iv)
          return 0
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [pageState])

  // Main effect: auth check + QR scan
  useEffect(() => {
    const { session, token } = readQrParams(searchParams)

    if (!session || !token) {
      setErrorMsg(QR_LINK_INCOMPLETE_MSG)
      setPageState('error')
      return
    }

    setSessionId(session)

    let cancelled = false

    void (async () => {
      let authToken = useAuthStore.getState().accessToken

      if (!authToken) {
        setPageState('checking-auth')
        try {
          const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isPwa: isPWAContext() }),
            credentials: 'include',
          })
          if (res.ok) {
            const { accessToken } = await res.json() as { accessToken: string }
            const [, b64] = accessToken.split('.')
            const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
              sub: string
              permissions: string
              isPwa: boolean
            }
            useAuthStore.getState().setAuth(accessToken, {
              id: payload.sub,
              permissions: payload.permissions,
              isPwa: payload.isPwa,
            })
            await fetchAndMergeUserProfile(accessToken)
            authToken = accessToken
          }
        } catch {
          // fall through to login redirect
        }
      }

      if (cancelled) return

      if (!authToken) {
        sessionStorage.setItem(
          'qr_redirect',
          `/auth/qr?session=${encodeURIComponent(session)}&token=${encodeURIComponent(token)}`,
        )
        router.replace('/login?qr=1')
        return
      }

      setPageState('scanning')
      try {
        const res = await apiFetch('/auth/qr/scan', {
          method: 'POST',
          body: JSON.stringify({ sessionId: session, token }),
        })
        if (cancelled) return
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          setErrorMsg(mapQrScanError(data.error))
          setPageState('error')
          return
        }
        const data = (await res.json()) as { sessionId: string; otp: string }
        if (cancelled) return
        setOtp(data.otp)
        setPageState('otp-display')
      } catch {
        if (!cancelled) {
          setErrorMsg('Something went wrong. Please try again.')
          setPageState('error')
        }
      }
    })()

    return () => { cancelled = true }
  }, [searchParams, router])

  // Mobile polling effect: polls after scan until OTP is verified by desktop
  useEffect(() => {
    if (pageState !== 'otp-display' || !sessionId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await apiFetch(`/auth/qr/mobile-status?sessionId=${encodeURIComponent(sessionId)}`)
        if (cancelled || !res.ok) return
        const data = await res.json() as { status: string; desktop?: DesktopInfo }
        if (cancelled) return
        if (data.status === 'otp-verified' && data.desktop) {
          setDesktopInfo(data.desktop)
          setPageState('approval')
        } else if (data.status === 'rejected') {
          setPageState('rejected')
        } else if (data.status === 'expired') {
          setErrorMsg('The session expired. Please scan again.')
          setPageState('error')
        } else {
          timer = setTimeout(poll, 1000)
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 2000)
      }
    }

    void poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [pageState, sessionId])

  const handleApprove = async () => {
    if (!sessionId || approveSecLeft > 0) return
    setIsActing(true)
    try {
      const res = await apiFetch('/auth/qr/approve', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      })
      if (res.ok) {
        setPageState('approved')
      } else {
        setErrorMsg('Failed to approve. The QR code may have expired.')
        setPageState('error')
      }
    } catch {
      setErrorMsg('Something went wrong.')
      setPageState('error')
    } finally {
      setIsActing(false)
    }
  }

  const handleReject = async () => {
    if (!sessionId) return
    setIsActing(true)
    try {
      await apiFetch('/auth/qr/reject', { method: 'POST', body: JSON.stringify({ sessionId }) })
    } catch {
      // best effort
    }
    setPageState('rejected')
    setIsActing(false)
  }

  return (
    <section className="page-root relative flex min-h-screen items-center justify-center px-4">
      <div className="dot-pattern pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="glass-card rounded-3xl px-8 py-10 w-full max-w-sm relative z-10 flex flex-col items-center gap-6">
        {pageState === 'checking-auth' || pageState === 'scanning' ? (
          <Spinner size="md" clockwise />
        ) : pageState === 'otp-display' ? (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="relative flex items-center justify-center">
                <div className="pointer-events-none absolute inset-0 rounded-full bg-white/5 blur-xl scale-150" aria-hidden />
                <div className="relative p-3.5 rounded-full border border-white/10 bg-white/5">
                  <ShieldCheck className="size-8 text-white/90" strokeWidth={1.5} aria-hidden />
                </div>
              </div>
              <h2 className="text-lg tracking-widest">
                Your code<span className="blink-cursor">_</span>
              </h2>
              <p className="text-xs text-muted-foreground tracking-wider">
                Enter this code on the device you are signing in on
              </p>
            </div>

            <div className="w-full glass-card rounded-2xl p-6 flex items-center justify-center">
              <p className="text-3xl font-mono tracking-[0.3em] text-foreground">{otp}</p>
            </div>

            <div className="flex items-center gap-2.5">
              <Spinner size="sm" clockwise />
            </div>
          </>
        ) : pageState === 'approval' && desktopInfo ? (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="relative flex items-center justify-center">
                <div className="pointer-events-none absolute inset-0 rounded-full bg-white/5 blur-xl scale-150" aria-hidden />
                <div className="relative p-3.5 rounded-full border border-white/10 bg-white/5">
                  <ShieldCheck className="size-8 text-white/90" strokeWidth={1.5} aria-hidden />
                </div>
              </div>
              <h2 className="text-lg tracking-widest">
                Login request<span className="blink-cursor">_</span>
              </h2>
              <p className="text-xs text-muted-foreground tracking-wider">
                A device is trying to log in with your account
              </p>
            </div>

            <div
              className="w-full rounded-2xl p-4 flex flex-col gap-3"
              style={{
                background: 'oklch(1 0 0 / 4%)',
                border: '1px solid oklch(1 0 0 / 6%)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div className="flex items-center gap-3">
                <Monitor className={rowIconClass} strokeWidth={1.5} aria-hidden />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-[10px] tracking-widest text-muted-foreground/60">DEVICE</p>
                  <p className="text-sm tracking-wider text-foreground/80">{desktopInfo.device}</p>
                </div>
              </div>
              <div className="h-px bg-white/[0.04]" />
              <div className="flex items-center gap-3">
                <Globe className={rowIconClass} strokeWidth={1.5} aria-hidden />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-[10px] tracking-widest text-muted-foreground/60">IP ADDRESS</p>
                  <p className="text-sm tracking-wider font-mono text-foreground/80">{desktopInfo.ip}</p>
                </div>
              </div>
              <div className="h-px bg-white/[0.04]" />
              <div className="flex items-center gap-3">
                <MapPin className={rowIconClass} strokeWidth={1.5} aria-hidden />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-[10px] tracking-widest text-muted-foreground/60">LOCATION</p>
                  <p className="text-sm tracking-wider text-foreground/80">{desktopInfo.location}</p>
                </div>
              </div>
            </div>

            <p
              className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-sm px-3 py-2.5 text-xs leading-snug tracking-wider text-amber-100/80"
              role="status"
            >
              Only approve if you are signing in on a device you can see in front of you. If you did not start this
              login, tap Reject.
            </p>

            <div className="flex flex-col gap-2 w-full select-none">
              <SlideToApprove
                onApprove={handleApprove}
                disabled={isActing || approveSecLeft > 0}
                cooldownSec={approveSecLeft}
              />
              <button
                type="button"
                onClick={handleReject}
                disabled={isActing}
                className="glass-button glass-button-destructive rounded-full px-6 text-sm tracking-wider w-full disabled:opacity-50"
                style={{ height: 60 }}
              >
                Reject
              </button>
            </div>
          </>
        ) : pageState === 'approved' ? (
          <>
            <div className="p-3.5 rounded-full border border-green-400/20 bg-green-400/5 text-green-400">
              <ShieldCheck className="size-8" strokeWidth={1.5} aria-hidden />
            </div>
            <div className="text-center">
              <h2 className="text-lg tracking-widest mb-2">Login approved<span className="blink-cursor">_</span></h2>
              <p className="text-xs text-muted-foreground tracking-wider">
                The other device has been logged in successfully.
              </p>
            </div>
            <button onClick={() => router.push('/home')} className="glass-button glass-button-ghost rounded-xl px-6 py-2.5 text-sm tracking-widest text-muted-foreground">
              Back to home
            </button>
          </>
        ) : pageState === 'rejected' ? (
          <>
            <div className="text-center">
              <h2 className="text-lg tracking-widest mb-2">Login rejected<span className="blink-cursor">_</span></h2>
              <p className="text-xs text-muted-foreground tracking-wider">You denied this login request.</p>
            </div>
            <button onClick={() => router.push('/home')} className="glass-button glass-button-ghost rounded-xl px-6 py-2.5 text-sm tracking-widest text-muted-foreground">
              Back to home
            </button>
          </>
        ) : (
          <>
            <div className="text-center">
              <h2 className="text-lg tracking-widest mb-2 text-destructive">Error<span className="blink-cursor">_</span></h2>
              <p className="text-xs text-muted-foreground tracking-wider">{errorMsg}</p>
            </div>
            <button onClick={() => router.push('/login')} className="glass-button glass-button-ghost rounded-xl px-6 py-2.5 text-sm tracking-widest text-muted-foreground">
              Back to login
            </button>
          </>
        )}
      </div>
    </section>
  )
}

export default function QRScanPage() {
  return (
    <Suspense fallback={<QRScanFallback />}>
      <QRScanPageInner />
    </Suspense>
  )
}
