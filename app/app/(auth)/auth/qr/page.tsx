'use client'
import { Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { fetchAndMergeUserProfile } from '@/lib/fetch-user-profile'
import { apiFetch } from '@/lib/api-client'
import { isPWAContext } from '@/lib/pwa'
import { mapQrScanError, QR_LINK_INCOMPLETE_MSG } from '@/lib/qr-scan-errors'
import { Spinner } from '@/components/ui/spinner'
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
  | 'awaiting-approval'
  | 'approval'
  | 'approved'
  | 'rejected'
  | 'error'

const APPROVAL_PROMPT_DELAY_MS = 1000
const APPROVE_BUTTON_COOLDOWN_SEC = 5

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

  useEffect(() => {
    const { session, token } = readQrParams(searchParams)

    if (!session || !token) {
      setErrorMsg(QR_LINK_INCOMPLETE_MSG)
      setPageState('error')
      return
    }

    setSessionId(session)

    let cancelled = false
    let approvalDelayTimer: ReturnType<typeof setTimeout> | null = null

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
        const data = (await res.json()) as { sessionId: string; desktop: DesktopInfo }
        if (cancelled) return
        setDesktopInfo(data.desktop)
        setPageState('awaiting-approval')
        approvalDelayTimer = setTimeout(() => {
          if (cancelled) return
          setPageState('approval')
        }, APPROVAL_PROMPT_DELAY_MS)
      } catch {
        if (!cancelled) {
          setErrorMsg('Something went wrong. Please try again.')
          setPageState('error')
        }
      }
    })()

    return () => {
      cancelled = true
      if (approvalDelayTimer) clearTimeout(approvalDelayTimer)
    }
  }, [searchParams, router])

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
        {pageState === 'checking-auth' || pageState === 'scanning' || pageState === 'awaiting-approval' ? (
          <>
            <Spinner size="md" clockwise />
            <p className="text-sm text-muted-foreground tracking-wider">
              {pageState === 'awaiting-approval'
                ? 'preparing approval'
                : pageState === 'scanning'
                  ? 'verifying code'
                  : 'checking'}
              <span className="blink-cursor">_</span>
            </p>
            {pageState === 'awaiting-approval' && (
              <p className="text-xs text-green-400/90 tracking-wider text-center">Code verified</p>
            )}
          </>
        ) : pageState === 'approval' && desktopInfo ? (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="p-3 rounded-2xl glass-card">
                <ShieldCheck className="size-8" strokeWidth={1.5} aria-hidden />
              </div>
              <h2 className="text-lg tracking-widest">
                Login request<span className="blink-cursor">_</span>
              </h2>
              <p className="text-xs text-muted-foreground tracking-wider">
                A device is trying to log in with your account
              </p>
            </div>

            <div className="w-full glass-card rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Monitor className={rowIconClass} strokeWidth={1.5} aria-hidden />
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-xs tracking-widest text-muted-foreground">DEVICE</p>
                  <p className="text-sm tracking-wider">{desktopInfo.device}</p>
                </div>
              </div>
              <div className="h-px bg-white/5" />
              <div className="flex items-center gap-3">
                <Globe className={rowIconClass} strokeWidth={1.5} aria-hidden />
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-xs tracking-widest text-muted-foreground">IP ADDRESS</p>
                  <p className="text-sm tracking-wider font-mono">{desktopInfo.ip}</p>
                </div>
              </div>
              <div className="h-px bg-white/5" />
              <div className="flex items-center gap-3">
                <MapPin className={rowIconClass} strokeWidth={1.5} aria-hidden />
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-xs tracking-widest text-muted-foreground">LOCATION</p>
                  <p className="text-sm tracking-wider">{desktopInfo.location}</p>
                </div>
              </div>
            </div>

            <p
              className="w-full rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs leading-snug tracking-wider text-amber-100/90"
              role="status"
            >
              Only approve if you are signing in on a device you can see in front of you. If you did not start this
              login, tap Reject.
            </p>

            <div className="flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={handleApprove}
                disabled={isActing || approveSecLeft > 0}
                className="glass-button glass-button-default rounded-xl px-6 py-3.5 text-sm tracking-widest w-full disabled:opacity-50"
              >
                {isActing ? (
                  <Spinner size="sm" />
                ) : approveSecLeft > 0 ? (
                  `Approve in ${approveSecLeft}s`
                ) : (
                  'Approve Login'
                )}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isActing}
                className="glass-button glass-button-destructive rounded-xl px-6 py-3 text-sm tracking-wider w-full disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </>
        ) : pageState === 'approved' ? (
          <>
            <div className="p-4 rounded-2xl glass-card text-green-400">
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
