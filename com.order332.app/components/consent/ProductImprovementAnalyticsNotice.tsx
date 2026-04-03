"use client"

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useAuthStore } from "@/lib/auth-store"
import {
  hasSeenProductImprovementNoticeSync,
  isProductImprovementConsentAllowedSync,
  markProductImprovementNoticeSeen,
} from "@/lib/product-improvement-consent"

const DESKTOP_MQ = "(min-width: 640px)"

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_MQ)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_MQ).matches
}

function getServerSnapshot() {
  return false
}

const NOTICE_TITLE = "Analytics & crash reports"
const NOTICE_BODY =
  "We collect usage analytics and crash reports so we can fix bugs and improve the app. You can turn this off anytime."

export function ProductImprovementAnalyticsNotice() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const firedRef = useRef(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    getDesktopSnapshot,
    getServerSnapshot
  )

  useEffect(() => {
    if (!user) return
    if (hasSeenProductImprovementNoticeSync()) return
    if (!isProductImprovementConsentAllowedSync()) return
    if (firedRef.current) return
    firedRef.current = true
    markProductImprovementNoticeSeen()

    if (isDesktop) {
      toast(NOTICE_TITLE, {
        description: NOTICE_BODY,
        duration: 60_000,
        action: {
          label: "Manage",
          onClick: () => {
            router.push("/settings#product-improvement-analytics")
          },
        },
      })
    } else {
      setMobileOpen(true)
    }
  }, [user, router, isDesktop])

  useEffect(() => {
    if (isDesktop) setMobileOpen(false)
  }, [isDesktop])

  const goManage = () => {
    setMobileOpen(false)
    router.push("/settings#product-improvement-analytics")
  }

  if (!mobileOpen || isDesktop) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center px-4 pb-6"
      style={{
        background: "oklch(0 0 0 / 60%)",
        backdropFilter: "blur(4px)",
      }}
      onClick={() => setMobileOpen(false)}
      role="presentation"
    >
      <div
        className="glass-card flex w-full max-w-sm flex-col gap-5 rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-notice-title"
      >
        <div className="flex flex-col gap-1">
          <p className="section-label">Privacy</p>
          <h2
            id="analytics-notice-title"
            className="text-2xl tracking-widest text-foreground"
          >
            {NOTICE_TITLE}
            <span className="blink-cursor">_</span>
          </h2>
          <p className="mt-1 text-sm tracking-wider text-muted-foreground">
            {NOTICE_BODY}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={goManage}
            className="glass-button glass-button-glass w-full rounded-xl px-4 py-3 text-sm tracking-widest"
            style={{ minHeight: "44px" }}
          >
            Manage
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="glass-button glass-button-ghost w-full rounded-xl px-4 py-3 text-sm tracking-widest text-muted-foreground"
            style={{ minHeight: "44px" }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
