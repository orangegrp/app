"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Mail, ShieldAlert, CheckCircle2 } from "lucide-react"
import { capture } from "@/lib/analytics"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { useAuthStore } from "@/lib/auth-store"
import { fetchAndMergeUserProfile } from "@/lib/fetch-user-profile"
import { getMailSetupState, completeMailSetup, type MailSetupState } from "@/lib/mail-api"
import { cn } from "@/lib/utils"

const STEP_STORAGE_KEY = "332-mail-setup-step"
const SLIDE_COUNT = 4

function isPolicyValid(p: PolicyState): boolean {
  return p.storage && p.noBusiness && p.noSpam
}

interface PolicyState {
  storage: boolean
  noBusiness: boolean
  noSpam: boolean
}

export function MailSetupWizardDialog(): React.ReactNode {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const mergeAuthUser = useAuthStore((s) => s.mergeAuthUser)

  const [step, setStep] = useState(0)
  const [shouldAnimateHeight, setShouldAnimateHeight] = useState(false)
  const [slideHeight, setSlideHeight] = useState<number | null>(null)
  const slideContentRef = useRef<HTMLDivElement | null>(null)

  // Setup state from server
  const [setupState, setSetupState] = useState<MailSetupState | null>(null)
  const [setupLoading, setSetupLoading] = useState(true)
  const [setupError, setSetupError] = useState<string | null>(null)

  // Address step
  const [aliasDraft, setAliasDraft] = useState("")
  const [includeAlias, setIncludeAlias] = useState(true)
  const [aliasError, setAliasError] = useState<string | null>(null)

  // Policy step
  const [policy, setPolicy] = useState<PolicyState>({
    storage: false,
    noBusiness: false,
    noSpam: false,
  })

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // ── Load setup state ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return
    setSetupLoading(true)
    getMailSetupState()
      .then((state) => {
        setSetupState(state)
        // Pre-fill alias from suggested default
        if (state.defaultAlias) {
          const local = state.defaultAlias.split("@")[0] ?? ""
          setAliasDraft(local)
        }
      })
      .catch(() => setSetupError("Could not load setup info. Refresh and try again."))
      .finally(() => setSetupLoading(false))
  }, [accessToken])

  // ── Step persistence (sessionStorage) ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = sessionStorage.getItem(STEP_STORAGE_KEY)
    if (raw !== null) {
      const n = parseInt(raw, 10)
      if (!Number.isNaN(n) && n >= 0 && n < SLIDE_COUNT) setStep(n)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    sessionStorage.setItem(STEP_STORAGE_KEY, String(step))
  }, [step])

  // ── Height animation (same pattern as WelcomeWizardDialog) ─────────────────
  useEffect(() => {
    if (typeof navigator === "undefined") return
    const ua = navigator.userAgent
    const isIOS =
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    const isSafariDesktop =
      /Safari/i.test(ua) &&
      !/Chrome|Chromium|Edg|OPR|CriOS|FxiOS|Android/i.test(ua)
    setShouldAnimateHeight(!(isIOS || isSafariDesktop))
  }, [])

  useLayoutEffect(() => {
    if (!shouldAnimateHeight) { setSlideHeight(null); return }
    const el = slideContentRef.current
    if (!el) return
    const update = () => setSlideHeight(el.getBoundingClientRect().height)
    update()
    if (typeof ResizeObserver === "undefined") return
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [step, shouldAnimateHeight, setupLoading, done])

  const clearStepStorage = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem(STEP_STORAGE_KEY)
  }, [])

  // ── Navigation ──────────────────────────────────────────────────────────────
  function prev(): void { setStep((s) => Math.max(0, s - 1)) }

  function nextFromAddress(): void {
    setAliasError(null)
    if (includeAlias && aliasDraft.trim()) {
      // Quick local-part format check
      const local = aliasDraft.trim().toLowerCase()
      if (!/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(local)) {
        setAliasError(
          "Alias must be letters, numbers, dots, underscores, or hyphens only."
        )
        return
      }
    }
    setStep(2)
  }

  // ── Submission ──────────────────────────────────────────────────────────────
  async function handleFinish(): Promise<void> {
    if (!isPolicyValid(policy)) {
      setSubmitError("Please acknowledge all three items before continuing.")
      return
    }
    if (!accessToken) return
    setSubmitting(true)
    setSubmitError(null)

    const domain = setupState?.primaryEmail?.split("@")[1] ?? null
    const aliasEmail =
      includeAlias && aliasDraft.trim() && domain
        ? `${aliasDraft.trim().toLowerCase()}@${domain}`
        : null

    try {
      if (setupState?.demoMode) {
        // Demo mode: skip all server mutations — just close the wizard locally
        clearStepStorage()
        capture("mail_setup_wizard_completed", { demo: true })
        setDone(true)
        setStep(3)
        return
      }

      const res = await completeMailSetup(aliasEmail)
      mergeAuthUser({ mailSetupCompleted: res.mailSetupCompleted })
      clearStepStorage()
      capture("mail_setup_wizard_completed")
      await fetchAndMergeUserProfile(accessToken)
      setDone(true)
      setStep(3)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not complete setup")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Guard ────────────────────────────────────────────────────────────────────
  if (!user || user.mailSetupCompleted !== false) return null

  // ── Slides ───────────────────────────────────────────────────────────────────
  function renderSlide(): React.ReactNode {
    // Step 0: Introduction
    if (step === 0) {
      return (
        <div ref={slideContentRef}>
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              Welcome to 332 Mail!
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Let's setup your shiny new inbox in a few quick steps.
            </DialogDescription>
          </DialogHeader>

          <ul className="mb-5 space-y-3 text-sm text-muted-foreground">
            {[
              "You'll receive a permanent primary email address tied to your app account ID.",
              "You can optionally add one alias address — a friendly name you can also send/receive mail emails from.",
              "You can manage up to two aliases at any time from your settings.",
              "Read and agree to the acceptable usage policy before being given access.",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-white/10 text-center text-[10px] leading-4 text-foreground/70">
                  {i + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button onClick={() => setStep(1)} className="glass-button glass-button-default min-h-[44px] min-w-[120px] rounded-xl tracking-widest">
              Get started
            </Button>
          </DialogFooter>
        </div>
      )
    }

    // Step 1: Address setup
    if (step === 1) {
      if (setupLoading) {
        return (
          <div ref={slideContentRef} className="flex justify-center py-10">
            <Spinner size="md" />
          </div>
        )
      }
      if (setupError) {
        return (
          <div ref={slideContentRef}>
            <p className="text-sm" style={{ color: "oklch(0.7 0.19 22)" }}>{setupError}</p>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={prev} className="glass-button glass-button-secondary min-h-[44px] min-w-[120px] rounded-xl tracking-widest">Back</Button>
            </DialogFooter>
          </div>
        )
      }
      if (!setupState?.domainConfigured && !setupState?.demoMode) {
        return (
          <div ref={slideContentRef}>
            <DialogHeader className="mb-3">
              <DialogTitle>Domain not configured</DialogTitle>
              <DialogDescription>
                Mail is not fully configured for this instance. Please contact an admin.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={prev} className="glass-button glass-button-secondary min-h-[44px] min-w-[120px] rounded-xl tracking-widest">Back</Button>
            </DialogFooter>
          </div>
        )
      }

      const domain = setupState.primaryEmail?.split("@")[1] ?? ""
      const canUseAlias = domain.length > 0
      return (
        <div ref={slideContentRef}>
          <DialogHeader className="mb-4">
            <DialogTitle>Your email addresses</DialogTitle>
            <DialogDescription>
              Your email account has a unique primary address, and you can add up to 2 aliases.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4 space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your unique primary address
              </p>
              <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground/70 select-all">
                {setupState.primaryEmail ?? "—"}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                This address is derived from your account ID and cannot be changed.
              </p>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Checkbox
                  checked={includeAlias && canUseAlias}
                  disabled={!canUseAlias}
                  onCheckedChange={(v) => setIncludeAlias(Boolean(v))}
                />
                <span>Add an alias (optional)</span>
              </label>
              {includeAlias && canUseAlias && (
                <div className="flex items-center gap-1">
                  <Input
                    value={aliasDraft}
                    onChange={(e) => {
                      setAliasDraft(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))
                      setAliasError(null)
                    }}
                    placeholder="e.g. yourname"
                    className="rounded-r-none"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <div className="flex h-10 items-center rounded-r-lg border border-l-0 border-white/10 bg-black/30 px-3 text-sm text-foreground/50">
                    @{domain}
                  </div>
                </div>
              )}
              {!canUseAlias && setupState?.demoMode && (
                <p className="mt-1 text-[11px] text-amber-300">
                  Demo mode without a configured domain: alias setup is skipped in dry run.
                </p>
              )}
              {aliasError && (
                <p className="mt-1 text-xs" style={{ color: "oklch(0.7 0.19 22)" }}>
                  {aliasError}
                </p>
              )}
              {includeAlias && canUseAlias && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pre-filled from your display name. You can change or add up to 2 aliases in Settings later.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={prev} className="glass-button glass-button-secondary min-h-[44px] min-w-[120px] rounded-xl tracking-widest">
              Back
            </Button>
            <Button onClick={nextFromAddress} className="glass-button glass-button-default min-h-[44px] min-w-[120px] rounded-xl tracking-widest">
              Continue
            </Button>
          </DialogFooter>
        </div>
      )
    }

    // Step 2: Policy acknowledgement
    if (step === 2) {
      const policies: { key: keyof PolicyState; label: string; detail: string }[] = [
        {
          key: "storage",
          label: "Mail storage and delivery is not guaranteed",
          detail:
            "Messages may be lost due to service disruptions. Do not rely on 332 Mail for important communications.",
        },
        {
          key: "noBusiness",
          label: "Not for professional or business use",
          detail:
            "This service is personal and experimental. Do not use it for commercial communication, client contact, or anything requiring a service-level guarantee.",
        },
        {
          key: "noSpam",
          label: "No spam, abuse, or misuse",
          detail:
            "Sending spam, harassment, phishing, or any abusive content is strictly prohibited and will result in immediate account suspension.",
        },
      ]
      return (
        <div ref={slideContentRef}>
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2">
              Acceptable usage policy
            </DialogTitle>
            <DialogDescription>
              Please read and acknowledge all of the following before continuing.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-5 space-y-3">
            {policies.map(({ key, label, detail }) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/8 bg-white/3 p-3 transition-colors hover:bg-white/5"
              >
                <Checkbox
                  className="mt-0.5 shrink-0"
                  checked={policy[key]}
                  onCheckedChange={(v) =>
                    setPolicy((prev) => ({ ...prev, [key]: Boolean(v) }))
                  }
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                </div>
              </label>
            ))}
          </div>

          {submitError && (
            <p className="mb-3 text-xs" style={{ color: "oklch(0.7 0.19 22)" }}>
              {submitError}
            </p>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={prev} disabled={submitting} className="glass-button glass-button-secondary min-h-[44px] min-w-[120px] rounded-xl tracking-widest">
              Back
            </Button>
            <Button
              onClick={handleFinish}
              disabled={submitting || !isPolicyValid(policy)}
              className="glass-button glass-button-default min-h-[44px] min-w-[120px] rounded-xl tracking-widest"
            >
              {submitting ? <Spinner size="sm" /> : "Complete setup"}
            </Button>
          </DialogFooter>
        </div>
      )
    }

    // Step 3: Success
    return (
      <div ref={slideContentRef} className="text-center">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex flex-col items-center gap-2">
            <CheckCircle2 size={36} className="text-white-400" />
            Inbox ready
          </DialogTitle>
          <DialogDescription>
            Your mailbox is configured. You can manage aliases in Settings at any time.
          </DialogDescription>
        </DialogHeader>
        <p className="mb-6 text-sm text-muted-foreground">
          Primary: <span className="font-mono text-foreground/80">{setupState?.primaryEmail ?? "—"}</span>
        </p>
        {setupState?.demoMode && (
          <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
            Demo mode — no changes were saved to the server. Mailbox setup will repeat next session.
          </p>
        )}
        <DialogFooter>
          <Button
            onClick={() => mergeAuthUser({ mailSetupCompleted: true })}
            className="glass-button glass-button-default min-h-[44px] min-w-[120px] rounded-xl tracking-widest"
          >
            Open inbox
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={() => {
        /* non-dismissible until completed */
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "glass-card flex flex-col border-white/10 sm:max-w-lg",
          shouldAnimateHeight
            ? "overflow-hidden"
            : "max-h-[75vh] overflow-y-auto sm:max-h-[600px]",
          "gap-4 p-5 sm:p-6"
        )}
      >
        {/* Progress dots */}
        <div className="mb-0.5 flex justify-center gap-2" aria-hidden="true">
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-6 bg-foreground/80" : "w-1.5 bg-muted-foreground/35"
              )}
            />
          ))}
        </div>
        <p className="mb-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          {step + 1} / {SLIDE_COUNT}
        </p>

        {/* Animated slide container */}
        <div
          className={cn(
            shouldAnimateHeight
              ? "overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
              : ""
          )}
          style={
            shouldAnimateHeight && slideHeight ? { height: `${slideHeight}px` } : undefined
          }
        >
          {renderSlide()}
        </div>
      </DialogContent>
    </Dialog>
  )
}
