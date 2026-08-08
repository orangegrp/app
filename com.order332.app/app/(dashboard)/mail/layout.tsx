"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { ArrowLeft, Settings } from "lucide-react"
import { useAuthStore } from "@/lib/auth-store"
import { useIsMobile } from "@/hooks/use-mobile"
import { RequireAppPermission } from "@/components/auth/RequireAppPermission"
import { MailSetupWizardDialog } from "@/components/onboarding/MailSetupWizardDialog"
import { MailSidebar } from "@/components/mail/MailSidebar"
import { MailListPanel } from "@/components/mail/MailListPanel"
import { PERMISSIONS } from "@/lib/permissions"

const LIST_MIN = 320
const LIST_MAX = 600
const LIST_DEFAULT = 340

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export default function MailLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const pathname = usePathname()
  const isMobile = useIsMobile()

  const isDetailView = useMemo(() => {
    if (/^\/mail\/sent\/[^/]+$/.test(pathname)) return true
    if (/^\/mail\/[^/]+$/.test(pathname) && pathname !== "/mail/compose" && pathname !== "/mail/sent") return true
    return false
  }, [pathname])

  const backUrl = pathname.startsWith("/mail/sent/") ? "/mail/sent" : "/mail"

  // ── column resize (desktop only) ─────────────────────────────────────────────
  const [listWidth, setListWidth] = useState(LIST_DEFAULT)
  const resizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    resizing.current = true
    startX.current = e.clientX
    startWidth.current = listWidth
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizing.current) return
    setListWidth(clamp(startWidth.current + (e.clientX - startX.current), LIST_MIN, LIST_MAX))
  }

  function onHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    resizing.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <RequireAppPermission permission={PERMISSIONS.APP_MAIL}>
      {user?.mailSetupCompleted === false ? <MailSetupWizardDialog /> : null}
      <div className="flex h-screen overflow-hidden">

        {/* Left sidebar — desktop only */}
        <div className="hidden md:flex">
          <MailSidebar />
        </div>

        {/* Middle: email list */}
        <div
          className={[
            "flex flex-col overflow-hidden",
            isDetailView ? "hidden md:flex" : "flex",
            // On mobile: full width. On desktop: fixed resizable width.
            isMobile ? "w-full" : "shrink-0",
          ].join(" ")}
          style={isMobile ? undefined : { width: listWidth }}
        >
          <MailListPanel />
        </div>

        {/* Resize handle — desktop only */}
        <div
          className="group hidden shrink-0 cursor-col-resize select-none md:flex md:items-stretch"
          style={{ width: 5 }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
        >
          <div
            className="self-stretch bg-white/8 transition-colors group-hover:bg-white/20 group-active:bg-white/30"
            style={{ width: 1, margin: "0 2px" }}
          />
        </div>

        {/* Right: detail panel */}
        <div className={[
          "min-w-0 flex-1 flex-col overflow-hidden",
          isDetailView ? "flex" : "hidden md:flex",
        ].join(" ")}>
          {/* Top bar — h-[46px] matches list panel header for border alignment */}
          <div className="flex h-[46px] shrink-0 items-center border-b border-white/8 px-4">
            {isDetailView && (
              <Link
                href={backUrl}
                className="mr-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden"
              >
                <ArrowLeft size={16} />
                Back
              </Link>
            )}
            <Link
              href="/settings#mail"
              className="ml-auto rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-white/8 hover:text-foreground"
              title="Mail settings"
            >
              <Settings size={16} />
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>

      </div>
    </RequireAppPermission>
  )
}
