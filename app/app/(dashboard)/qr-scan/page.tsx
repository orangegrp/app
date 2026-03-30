'use client'

import { useEffect, useId, useRef, useState, startTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { toast } from 'sonner'
import { PageBackground } from '@/components/layout/PageBackground'
import { Spinner } from '@/components/ui/spinner'
import { apiFetch } from '@/lib/api-client'
import { mapQrScanError } from '@/lib/qr-scan-errors'
import { parseQrLoginUrl } from '@/lib/parse-qr-login-url'
import type { CSSProperties } from 'react'

const MQL_POINTER_COARSE = '(pointer: coarse)'
const MQL_SCANNER_MAX_WIDTH = '(max-width: 1024px)'

const SUCCESS_NAV_DELAY_MS = 400
const ERROR_RESET_MS = 2600
const INVALID_PULSE_MS = 550

/** Fraction of the viewport's shorter dimension used as the scan area. */
const SCAN_BOX_FRACTION = 0.75

/** Slightly above default to help rolling desktop login QR at 1s steps on slower decode paths. */
const SCAN_FPS = 15

type FrameState = 'idle' | 'invalid_pulse' | 'verifying' | 'success' | 'error'


function computeAllowScanner(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia(MQL_POINTER_COARSE).matches &&
    window.matchMedia(MQL_SCANNER_MAX_WIDTH).matches
  )
}

function scanBoxOutlineStyle(state: FrameState): CSSProperties {
  switch (state) {
    case 'success':
      return { outline: '3px solid rgba(74, 222, 128, 0.9)', outlineOffset: '-3px' }
    case 'error':
    case 'invalid_pulse':
      return { outline: '3px solid rgba(239, 68, 68, 0.85)', outlineOffset: '-3px' }
    case 'verifying':
      return { outline: '2px solid rgba(251, 191, 36, 0.75)', outlineOffset: '-2px' }
    default:
      return { outline: '1px solid rgba(255, 255, 255, 0.18)', outlineOffset: '-1px' }
  }
}

function cornerColorClass(state: FrameState): string {
  switch (state) {
    case 'success':       return 'border-green-400/90'
    case 'error':
    case 'invalid_pulse': return 'border-red-500/85'
    case 'verifying':     return 'border-amber-400/75'
    default:              return 'border-white/55'
  }
}

export default function QrScanPage() {
  const router = useRouter()
  const reactId = useId()
  const readerDomId = `qr-reader-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const processingRef = useRef(false)
  const lastInvalidToastAtRef = useRef(0)
  const invalidPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Holds the promise for the in-progress stop+clear so the next startCamera can await it.
  const cleanupPromiseRef = useRef<Promise<void>>(Promise.resolve())

  const [viewport, setViewport] = useState<'unknown' | 'mobile' | 'desktop'>('unknown')
  const [portalReady, setPortalReady] = useState(false)
  const [cameraKey, setCameraKey] = useState(0)
  const [frameState, setFrameState] = useState<FrameState>('idle')
  const [statusLine, setStatusLine] = useState('')
useEffect(() => {
    startTransition(() => setPortalReady(true))
  }, [])

  useEffect(() => {
    const sync = () => {
      setViewport(computeAllowScanner() ? 'mobile' : 'desktop')
    }
    sync()
    const mqlPointer = window.matchMedia(MQL_POINTER_COARSE)
    const mqlWidth = window.matchMedia(MQL_SCANNER_MAX_WIDTH)
    const onMedia = () => sync()
    mqlPointer.addEventListener('change', onMedia)
    mqlWidth.addEventListener('change', onMedia)
    window.addEventListener('resize', sync)
    return () => {
      mqlPointer.removeEventListener('change', onMedia)
      mqlWidth.removeEventListener('change', onMedia)
      window.removeEventListener('resize', sync)
    }
  }, [])

  useEffect(() => {
    if (viewport !== 'mobile') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [viewport])

  useEffect(() => {
    if (viewport !== 'mobile' || !portalReady) return

    let cancelled = false
    // Guard so stop is only initiated once per scanner instance, preventing a
    // race between onDecoded's stop() and the effect cleanup's stop().
    let stopInitiated = false

    const html5 = new Html5Qrcode(readerDomId, {
      verbose: process.env.NODE_ENV === 'development',
      // iOS standalone PWA: native BarcodeDetector + ZXing alternation can fail to decode
      // while the camera preview looks fine; ZXing-only matches Safari tab behaviour.
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: false,
      },
    })

    const doStop = (): Promise<void> => {
      if (stopInitiated) return cleanupPromiseRef.current
      stopInitiated = true
      const p = html5.stop().then(() => html5.clear()).catch(() => {})
      cleanupPromiseRef.current = p
      return p
    }

    // When `videoConstraints` is set, html5-qrcode passes it straight to getUserMedia's `video`
    // field — it must be MediaTrackConstraints, NOT `{ video: { ... } }` (that double-wraps and
    // breaks facing mode / picks the wrong camera).
    // Moderate ideals help WebKit report non-zero videoWidth without over-constraining device choice.
    const makeScanConfig = (facing: 'environment' | 'user') =>
      ({
        fps: SCAN_FPS,
        videoConstraints: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const size = Math.max(1, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * SCAN_BOX_FRACTION))
          return { width: size, height: size }
        },
      }) as Parameters<Html5Qrcode['start']>[1]

    const onDecoded = (decodedText: string) => {
      if (processingRef.current) return

      const parsed = parseQrLoginUrl(decodedText)
      if (!parsed) {
        if (invalidPulseTimerRef.current) return
        setFrameState('invalid_pulse')
        setStatusLine('Not a login QR')
        const now = Date.now()
        if (now - lastInvalidToastAtRef.current > 4000) {
          lastInvalidToastAtRef.current = now
          toast.error('Not a 332 login QR. Use the code from the desktop sign-in screen.', { id: 'qr-scan-wrong' })
        }
        invalidPulseTimerRef.current = setTimeout(() => {
          invalidPulseTimerRef.current = null
          setFrameState('idle')
          setStatusLine('')
        }, INVALID_PULSE_MS)
        return
      }

      processingRef.current = true
      setFrameState('verifying')
      setStatusLine('Verifying with server…')

      void (async () => {
        // Stop the scanner before making the network request. doStop() is
        // idempotent so the cleanup won't try to double-stop.
        await doStop()
        if (cancelled) return

        try {
          const res = await apiFetch('/auth/qr/scan', {
            method: 'POST',
            body: JSON.stringify({ sessionId: parsed.session, token: parsed.token }),
          })

          if (res.status === 401) {
            sessionStorage.setItem(
              'qr_redirect',
              `/auth/qr?session=${encodeURIComponent(parsed.session)}&token=${encodeURIComponent(parsed.token)}`,
            )
            router.replace('/login?qr=1')
            return
          }

          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string }
            setFrameState('error')
            setStatusLine(mapQrScanError(data.error))
            setTimeout(() => {
              processingRef.current = false
              setFrameState('idle')
              setStatusLine('')
              setCameraKey((k) => k + 1)
            }, ERROR_RESET_MS)
            return
          }

          setFrameState('success')
          setStatusLine('Verified. Opening approval…')
          setTimeout(() => {
            router.push(
              `/auth/qr?session=${encodeURIComponent(parsed.session)}&token=${encodeURIComponent(parsed.token)}`,
            )
          }, SUCCESS_NAV_DELAY_MS)
        } catch {
          setFrameState('error')
          setStatusLine('Network error. Try again.')
          setTimeout(() => {
            processingRef.current = false
            setFrameState('idle')
            setStatusLine('')
            setCameraKey((k) => k + 1)
          }, ERROR_RESET_MS)
        }
      })()
    }

    const startCamera = async (): Promise<void> => {
      // Wait for any in-progress stop from a previous effect run before starting.
      await cleanupPromiseRef.current
      // Two RAF frames so the portal DOM is fully painted.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
      if (cancelled) return
      try {
        await html5.start({ facingMode: 'environment' }, makeScanConfig('environment'), onDecoded, () => {})
        return
      } catch {
        if (cancelled) return
        try {
          await html5.start({ facingMode: 'user' }, makeScanConfig('user'), onDecoded, () => {})
        } catch {
          toast.error('Could not start camera. Check permissions and try again.', { id: 'qr-camera' })
        }
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      processingRef.current = false
      if (invalidPulseTimerRef.current) {
        clearTimeout(invalidPulseTimerRef.current)
        invalidPulseTimerRef.current = null
      }
      // doStop() is idempotent — safe to call even if onDecoded already stopped it.
      void doStop()
    }
  }, [viewport, portalReady, router, readerDomId, cameraKey])

  const corners = cornerColorClass(frameState)

  const scannerModal =
    viewport === 'mobile' && portalReady ? (
      <div
        className="fixed inset-0 z-[160] flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-black"
        role="dialog"
        aria-modal="true"
        aria-label="Scan QR code"
      >
        {/* Camera feed — full screen */}
        <div className="absolute inset-0 min-h-0 min-w-0 overflow-hidden">
          <div
            id={readerDomId}
            className="h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover [&_video]:h-full [&_video]:w-full [&_video]:object-cover [&_div]:!border-0"
          />
        </div>

        {/* Dark overlay outside the scan area (box-shadow fills everything beyond the scan box) */}
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div
            className="rounded-2xl"
            style={{
              width: `min(${SCAN_BOX_FRACTION * 100}vmin, 300px)`,
              height: `min(${SCAN_BOX_FRACTION * 100}vmin, 300px)`,
              boxShadow: '0 0 0 max(100vw, 100vh) rgba(0, 0, 0, 0.55)',
            }}
          />
        </div>

        {/* Corner markers + status outline — sits above gradients */}
        <div className="pointer-events-none absolute inset-0 z-[15] flex items-center justify-center">
          <div
            className="relative rounded-2xl transition-all duration-200"
            style={{
              width: `min(${SCAN_BOX_FRACTION * 100}vmin, 300px)`,
              height: `min(${SCAN_BOX_FRACTION * 100}vmin, 300px)`,
              ...scanBoxOutlineStyle(frameState),
            }}
          >
            <div className={`absolute top-0 left-0 h-8 w-8 rounded-tl-xl border-l-2 border-t-2 ${corners}`} />
            <div className={`absolute top-0 right-0 h-8 w-8 rounded-tr-xl border-r-2 border-t-2 ${corners}`} />
            <div className={`absolute bottom-0 left-0 h-8 w-8 rounded-bl-xl border-b-2 border-l-2 ${corners}`} />
            <div className={`absolute bottom-0 right-0 h-8 w-8 rounded-br-xl border-b-2 border-r-2 ${corners}`} />
          </div>
        </div>

        {/* Top gradient */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-black/75 via-black/20 to-transparent"
          aria-hidden="true"
        />
        {/* Bottom gradient — kept narrow so it doesn't overlap the scan area */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 min-h-[28%] bg-gradient-to-t from-black/85 via-black/35 to-transparent"
          aria-hidden="true"
        />

        <header className="absolute left-0 right-0 top-0 z-20 flex items-center gap-3 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
          <Link
            href="/home"
            className="glass-button glass-button-ghost flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl"
            aria-label="Back to home"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </Link>
          <div className="min-w-0">
            <p className="section-label text-white/45">Login</p>
            <h2 className="text-lg tracking-widest text-white drop-shadow-md sm:text-xl">
              Scan QR<span className="blink-cursor">_</span>
            </h2>
          </div>
        </header>

        <div className="absolute bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] left-0 right-0 z-20 px-4">
          {(frameState === 'verifying' || frameState === 'success' || frameState === 'error') && (
            <p
              className={`mx-auto max-w-md text-center text-sm font-medium tracking-wider drop-shadow-md ${
                frameState === 'error'
                  ? 'text-red-300'
                  : frameState === 'success'
                    ? 'text-green-300'
                    : 'text-amber-100'
              }`}
              role="status"
              aria-live="polite"
            >
              {frameState === 'verifying' && (
                <span className="inline-flex flex-col items-center gap-2">
                  <Spinner size="sm" className="text-amber-100" />
                  <span>{statusLine}</span>
                </span>
              )}
              {frameState === 'success' && statusLine}
              {frameState === 'error' && statusLine}
            </p>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-center">
          <p className="mx-auto max-w-md text-balance text-sm leading-snug tracking-wider text-white/90 drop-shadow-md">
            Point camera at the QR code on your desktop login screen.
          </p>
          {frameState === 'invalid_pulse' && (
            <p className="mt-2 text-xs font-medium tracking-wider text-red-300 drop-shadow-md">Unrecognized code</p>
          )}
        </div>
      </div>
    ) : null

  return (
    <>
      {scannerModal && createPortal(scannerModal, document.body)}

      {viewport !== 'mobile' && (
        <div className="page-root relative min-h-screen px-4 pb-32 pt-24 sm:pt-28">
          <PageBackground />
          <div className="relative z-10 mx-auto max-w-lg">
            <div className="mb-8 flex items-center gap-4">
              <Link
                href="/home"
                className="glass-button glass-button-ghost flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                aria-label="Back to home"
              >
                <ArrowLeft size={18} strokeWidth={1.5} />
              </Link>
              <div>
                <p className="section-label">Login</p>
                <h2 className="text-xl tracking-widest">
                  Scan QR<span className="blink-cursor">_</span>
                </h2>
              </div>
            </div>

            <div className="space-y-6">
              {viewport === 'unknown' && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Spinner size="md" clockwise />
                  <p className="text-xs text-muted-foreground tracking-wider">
                    loading<span className="blink-cursor">_</span>
                  </p>
                </div>
              )}

              {viewport === 'desktop' && (
                <div className="space-y-4 py-6 text-center">
                  <p className="text-sm tracking-wider text-muted-foreground">
                    QR scanning is only available on mobile. Use your phone: open the profile tab, then Scan QR.
                  </p>
                  <Link
                    href="/home"
                    className="glass-button glass-button-glass inline-flex rounded-xl px-5 py-2.5 text-sm tracking-widest"
                  >
                    Back to home
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
