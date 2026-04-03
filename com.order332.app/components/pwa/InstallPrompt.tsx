"use client"
import { useEffect, useId, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  getSuppressInstallPromptSync,
  useSettingsStore,
} from "@/lib/settings-store"
import { capture } from "@/lib/analytics"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type Mode = "android" | "ios" | "ios26" | null

function getSafariMajorVersion(ua: string): number | null {
  // iOS UA keeps "CPU iPhone OS 18_x" frozen even on iOS 26.
  // The Version/ token is what actually reflects the Safari/iOS release.
  const match = ua.match(/Version\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

function detectMode(): Mode {
  if (typeof window === "undefined") return null
  const ua = navigator.userAgent
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as { standalone?: boolean }).standalone === true)
  if (isStandalone) return null

  const isIOS =
    /iPad|iPhone|iPod/.test(ua) &&
    !(ua.includes("Chrome") || ua.includes("CriOS"))
  const isSafari = isIOS && /Safari/.test(ua)
  if (!isSafari) return null // android/chrome handled via beforeinstallprompt event

  const version = getSafariMajorVersion(ua)
  return version !== null && version >= 26 ? "ios26" : "ios"
}

export function InstallPrompt() {
  const [mounted, setMounted] = useState(false)
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [dismissed, setDismissed] = useState(false)
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const setSuppressInstallPrompt = useSettingsStore(
    (s) => s.setSuppressInstallPrompt
  )
  const dontAskId = useId()

  useEffect(() => {
    queueMicrotask(() => setMounted(true))
  }, [])

  useEffect(() => {
    if (!mounted || getSuppressInstallPromptSync()) return
    // iOS/iOS26: show instructions immediately (no event available)
    const detected = detectMode()
    if (detected === "ios" || detected === "ios26") {
      setTimeout(() => setMode(detected), 0)
      return
    }

    // Android/Chrome: wait for the browser prompt event
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
      setMode("android")
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [mounted])

  if (!mounted || getSuppressInstallPromptSync()) return null
  if (!mode || dismissed) return null

  const commitSuppressIfChecked = () => {
    if (dontAskAgain) setSuppressInstallPrompt(true)
  }

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      if (outcome === "accepted") {
        setInstallEvent(null)
        capture("pwa_install_accepted", { platform: mode })
      }
    }
    commitSuppressIfChecked()
    setDismissed(true)
  }

  const handleDismiss = () => {
    commitSuppressIfChecked()
    setDismissed(true)
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center px-4 pb-6 sm:items-center sm:pb-0"
      style={{ background: "oklch(0 0 0 / 60%)", backdropFilter: "blur(4px)" }}
      onClick={handleDismiss}
    >
      <div
        className="glass-card flex w-full max-w-sm flex-col gap-5 rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <p className="section-label">Install app</p>
          <h2 className="text-2xl tracking-widest text-foreground">
            Add to home screen<span className="blink-cursor">_</span>
          </h2>
          <p className="mt-1 text-sm tracking-wider text-muted-foreground">
            Install 332 for a faster, native-app experience with offline access.
          </p>
        </div>

        {mode === "ios" || mode === "ios26" ? (
          <>
            <ol className="flex flex-col gap-3">
              {mode === "ios26" ? (
                <>
                  <li className="flex items-start gap-3 text-sm tracking-wider text-muted-foreground">
                    <StepNum>1</StepNum>
                    <span>
                      Tap the{" "}
                      <ShareIcon className="mx-1 inline-block align-text-top" />{" "}
                      Share button in the{" "}
                      <strong className="font-normal text-foreground">
                        bottom toolbar
                      </strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm tracking-wider text-muted-foreground">
                    <StepNum>2</StepNum>
                    <span>
                      Tap{" "}
                      <strong className="font-normal text-foreground">
                        Add to Home Screen
                      </strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm tracking-wider text-muted-foreground">
                    <StepNum>3</StepNum>
                    <span>
                      Tap{" "}
                      <strong className="font-normal text-foreground">
                        Add
                      </strong>{" "}
                      to confirm
                    </span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-3 text-sm tracking-wider text-muted-foreground">
                    <StepNum>1</StepNum>
                    <span>
                      Tap the{" "}
                      <ShareIcon className="mx-1 inline-block align-text-top" />{" "}
                      Share button in Safari&apos;s toolbar
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm tracking-wider text-muted-foreground">
                    <StepNum>2</StepNum>
                    <span>
                      Scroll down and tap{" "}
                      <strong className="font-normal text-foreground">
                        Add to Home Screen
                      </strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-3 text-sm tracking-wider text-muted-foreground">
                    <StepNum>3</StepNum>
                    <span>
                      Tap{" "}
                      <strong className="font-normal text-foreground">
                        Add
                      </strong>{" "}
                      to confirm
                    </span>
                  </li>
                </>
              )}
            </ol>
            <DontAskAgainRow
              id={dontAskId}
              checked={dontAskAgain}
              onCheckedChange={setDontAskAgain}
            />
            <button
              type="button"
              onClick={handleDismiss}
              className="glass-button glass-button-ghost w-full rounded-xl px-4 py-3 text-sm tracking-widest text-muted-foreground"
              style={{ minHeight: "44px" }}
            >
              Got it
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <DontAskAgainRow
              id={dontAskId}
              checked={dontAskAgain}
              onCheckedChange={setDontAskAgain}
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleInstall}
                className="glass-button glass-button-glass w-full rounded-xl px-4 py-3 text-sm tracking-widest"
                style={{ minHeight: "44px" }}
              >
                Install
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="glass-button glass-button-ghost w-full rounded-xl px-4 py-3 text-sm tracking-widest text-muted-foreground"
                style={{ minHeight: "44px" }}
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DontAskAgainRow({
  id,
  checked,
  onCheckedChange,
}: {
  id: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl px-1 py-0.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c === true)}
        className="mt-0.5"
      />
      <Label
        htmlFor={id}
        className="cursor-pointer text-sm leading-snug font-normal tracking-wider text-muted-foreground"
      >
        Don&apos;t ask again
      </Label>
    </div>
  )
}

function StepNum({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
      style={{ background: "oklch(1 0 0 / 10%)", color: "oklch(1 0 0 / 60%)" }}
    >
      {children}
    </span>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}
