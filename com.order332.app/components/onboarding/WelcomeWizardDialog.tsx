"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import {
  DISPLAY_NAME_MAX_LENGTH,
  normalizeDisplayName,
} from "@/lib/display-name"
import { apiPatch, apiPost } from "@/lib/api-client"
import { useAuthStore } from "@/lib/auth-store"
import { fetchAndMergeUserProfile } from "@/lib/fetch-user-profile"
import { hardNavigateTo } from "@/lib/hard-navigation"
import { isPWAContext } from "@/lib/pwa"
import { cn } from "@/lib/utils"

const STEP_STORAGE_KEY = "332-welcome-wizard-step"
const TERMS_URL = "https://www.order332.com/app-legal/terms"
const PRIVACY_URL = "https://www.order332.com/app-legal/privacy"
const BACK_BUTTON_CLASS =
  "glass-button glass-button-secondary min-h-[44px] min-w-[120px] rounded-xl tracking-widest"
const PRIMARY_BUTTON_CLASS =
  "glass-button glass-button-default min-h-[44px] min-w-[120px] rounded-xl tracking-widest"

const SLIDE_COUNT = 6

const DISCORD_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  taken: "That Discord account is already linked to another user.",
  already_linked:
    "This account already has a different Discord linked — disconnect it first.",
  error: "Could not connect Discord.",
  denied: "Discord connection was cancelled.",
}

function DiscordGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

export function WelcomeWizardDialog(): React.ReactNode {
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const mergeAuthUser = useAuthStore((s) => s.mergeAuthUser)

  const [step, setStep] = useState(0)
  const [displayNameDraft, setDisplayNameDraft] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [finishLoading, setFinishLoading] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [discordBusy, setDiscordBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [shouldAnimateHeight, setShouldAnimateHeight] = useState(false)
  const [slideHeight, setSlideHeight] = useState<number | null>(null)
  const slideContentRef = useRef<HTMLDivElement | null>(null)

  const signedInWithDiscord = Boolean(user?.discordId)
  const passkeyCount = user?.passkeyCount ?? 0

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const discord = params.get("discord")
    const token = useAuthStore.getState().accessToken

    if (discord === "linked") {
      setStep(3)
      sessionStorage.setItem(STEP_STORAGE_KEY, "3")
      setDiscordBusy(false)
      setProfileError(null)
      if (token) void fetchAndMergeUserProfile(token)
      router.replace("/home", { scroll: false })
      return
    }

    if (
      discord &&
      (discord === "taken" ||
        discord === "already_linked" ||
        discord === "error" ||
        discord === "denied")
    ) {
      setStep(2)
      sessionStorage.setItem(STEP_STORAGE_KEY, "2")
      setProfileError(
        DISCORD_OAUTH_ERROR_MESSAGES[discord] ?? "Could not connect Discord."
      )
      setDiscordBusy(false)
      router.replace("/home", { scroll: false })
      return
    }

    const raw = sessionStorage.getItem(STEP_STORAGE_KEY)
    if (raw !== null) {
      const n = parseInt(raw, 10)
      if (!Number.isNaN(n) && n >= 0 && n < SLIDE_COUNT) {
        setStep(n)
      }
    }
  }, [router])

  useEffect(() => {
    if (typeof window === "undefined") return
    sessionStorage.setItem(STEP_STORAGE_KEY, String(step))
  }, [step])

  useEffect(() => {
    if (user?.displayName) setDisplayNameDraft(user.displayName)
  }, [user?.displayName])

  useEffect(() => {
    if (typeof navigator === "undefined") return
    const ua = navigator.userAgent
    const isWebKitEngine = /AppleWebKit/i.test(ua)
    setShouldAnimateHeight(!isWebKitEngine)
  }, [])

  useLayoutEffect(() => {
    if (!shouldAnimateHeight) {
      setSlideHeight(null)
      return
    }

    const el = slideContentRef.current
    if (!el) return

    const updateHeight = () => {
      setSlideHeight(el.getBoundingClientRect().height)
    }

    updateHeight()
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(updateHeight)
    observer.observe(el)
    return () => observer.disconnect()
  }, [step, shouldAnimateHeight])

  const clearStepStorage = useCallback(() => {
    if (typeof window !== "undefined")
      sessionStorage.removeItem(STEP_STORAGE_KEY)
  }, [])

  const handleNextFromWelcome = (): void => {
    setStep(1)
  }

  const handleNextFromDisplayName = async (): Promise<void> => {
    if (!accessToken) return
    setProfileSaving(true)
    setProfileError(null)
    const normalized = normalizeDisplayName(displayNameDraft)
    try {
      await apiPatch("/me/profile", { displayName: normalized })
      await fetchAndMergeUserProfile(accessToken)
      setStep(2)
    } catch (e) {
      setProfileError(
        e instanceof Error ? e.message : "Could not save display name"
      )
    } finally {
      setProfileSaving(false)
    }
  }

  const handleAddPasskey = async (): Promise<void> => {
    if (!accessToken) return
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setProfileError("Passkeys are not supported in this browser.")
      return
    }
    setPasskeyBusy(true)
    setProfileError(null)
    try {
      const { options } = await apiPost<{ options: unknown }>(
        "/auth/add/start",
        {}
      )
      const { startRegistration } = await import("@simplewebauthn/browser")
      const credential = await startRegistration({
        optionsJSON: options as Parameters<
          typeof startRegistration
        >[0]["optionsJSON"],
      })
      await apiPost("/auth/add/finish", {
        credential,
        credentialName: "This device",
      })
      await fetchAndMergeUserProfile(accessToken)
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Could not add passkey")
    } finally {
      setPasskeyBusy(false)
    }
  }

  const handleConnectDiscord = async (): Promise<void> => {
    setDiscordBusy(true)
    try {
      const { url } = await apiPost<{ url: string }>(
        "/auth/discord/link-start",
        {
          isPwa: isPWAContext(),
          returnTo: "home",
        }
      )
      hardNavigateTo(url)
    } catch {
      setProfileError("Could not start Discord connection.")
      setDiscordBusy(false)
    }
  }

  const handleFinish = async (): Promise<void> => {
    if (!accessToken) return
    if (!legalAccepted) {
      setFinishError(
        "Please agree to the Terms and Privacy Policy to continue."
      )
      return
    }
    setFinishLoading(true)
    setFinishError(null)
    try {
      const data = await apiPost<{
        welcomeWizardCompleted: boolean
      }>("/me/welcome-wizard/complete", {})
      mergeAuthUser({ welcomeWizardCompleted: data.welcomeWizardCompleted })
      clearStepStorage()
      capture("welcome_wizard_completed")
      await fetchAndMergeUserProfile(accessToken)
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setFinishLoading(false)
    }
  }

  if (!user || user.welcomeWizardCompleted !== false) return null

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
            : "max-h-[75vh] overflow-y-auto sm:max-h-[620px]",
          "gap-4 p-5 sm:p-6"
        )}
      >
        <div className="mb-0.5 flex justify-center gap-2" aria-hidden="true">
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step
                  ? "w-6 bg-foreground/80"
                  : "w-1.5 bg-muted-foreground/35"
              )}
            />
          ))}
        </div>
        <p className="mb-2 text-center text-[10px] tracking-widest text-muted-foreground uppercase">
          {step + 1} / {SLIDE_COUNT}
        </p>

        <div
          className={cn(
            shouldAnimateHeight
              ? "overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
              : ""
          )}
          style={
            shouldAnimateHeight && slideHeight
              ? { height: `${slideHeight}px` }
              : undefined
          }
        >
          <div ref={slideContentRef}>
            {step === 0 && (
              <div className="flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-xl tracking-widest text-foreground">
                    Welcome to 332 app<span className="blink-cursor">_</span>
                  </DialogTitle>
                  <DialogDescription className="space-y-2 pt-1 text-sm tracking-wider text-muted-foreground">
                    <span className="block">
                      332 app is your invite-only hub for community tools:
                      content uploads, music, blog workflows, AI features, and
                      browser-based WebPC.
                    </span>
                    <span className="block">
                      {signedInWithDiscord
                        ? "Take a minute to set up how you appear, lock in account security, and review the key rules."
                        : "Take a minute to set up how you appear, optionally link Discord, and review how the app works."}
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-3 gap-2 pt-3 sm:justify-between">
                  <div className="hidden sm:block" aria-hidden="true" />
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    onClick={handleNextFromWelcome}
                  >
                    Next
                  </Button>
                </DialogFooter>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-xl tracking-widest text-foreground">
                    Display name
                  </DialogTitle>
                  <DialogDescription className="pt-1 text-sm tracking-wider text-muted-foreground">
                    Choose a nickname shown across the app (you can change it
                    later in Settings).
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 grid gap-2">
                  <label
                    className="text-xs tracking-wider text-muted-foreground"
                    htmlFor="wizard-display-name"
                  >
                    Nickname
                  </label>
                  <input
                    id="wizard-display-name"
                    type="text"
                    maxLength={DISPLAY_NAME_MAX_LENGTH}
                    value={displayNameDraft}
                    onChange={(e) => setDisplayNameDraft(e.target.value)}
                    placeholder="e.g. alexei bogodanov"
                    className="glass-card min-h-[44px] rounded-xl border-0 bg-transparent px-4 py-3 text-sm tracking-wider text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-white/10"
                    autoComplete="nickname"
                  />
                  <p className="text-[11px] tracking-wider text-muted-foreground">
                    Optional — max {DISPLAY_NAME_MAX_LENGTH} characters.
                  </p>
                  {profileError && (
                    <p
                      className="text-xs tracking-wider"
                      style={{ color: "oklch(0.7 0.19 22)" }}
                    >
                      {profileError}
                    </p>
                  )}
                </div>
                <DialogFooter className="mt-3 gap-2 pt-3 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className={BACK_BUTTON_CLASS}
                    onClick={() => setStep(0)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    disabled={profileSaving}
                    onClick={() => void handleNextFromDisplayName()}
                  >
                    {profileSaving ? <Spinner size="xs" /> : "Next"}
                  </Button>
                </DialogFooter>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-xl tracking-widest text-foreground">
                    {signedInWithDiscord ? "Add a passkey" : "Connect Discord"}
                  </DialogTitle>
                  <DialogDescription className="pt-1 text-sm tracking-wider text-muted-foreground">
                    {signedInWithDiscord
                      ? "You signed in with Discord. You can add a passkey on this device for quick sign-in and as a backup if Discord is unavailable — or skip and add one later in Settings."
                      : "Link Discord for quick sign-in and to use your avatar in the app."}
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-2.5">
                  <p className="rounded-xl border border-white/10 px-3 py-2 text-xs tracking-wider text-muted-foreground">
                    Keep your account secure and do not share your sign-in
                    methods (Discord session, passkeys, or magic links).
                  </p>
                  {signedInWithDiscord ? (
                    <>
                      {passkeyCount > 0 ? (
                        <div className="rounded-xl border border-white/10 px-3 py-2">
                          <p className="text-sm tracking-wider text-foreground">
                            Passkey added on this account
                          </p>
                          <p className="mt-1 text-xs tracking-wider text-muted-foreground">
                            You can add more passkeys anytime in Settings.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            type="button"
                            disabled={passkeyBusy}
                            onClick={() => void handleAddPasskey()}
                            className="glass-button glass-button-glass flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm tracking-widest disabled:opacity-50"
                          >
                            {passkeyBusy ? (
                              <Spinner size="xs" />
                            ) : (
                              <span>Add passkey on this device</span>
                            )}
                          </button>
                          <p className="text-center text-[11px] tracking-wider text-muted-foreground">
                            Optional — continue without one if you prefer to
                            sign in with Discord only.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={discordBusy}
                      onClick={() => void handleConnectDiscord()}
                      className="glass-button glass-button-glass flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm tracking-widest disabled:opacity-50"
                    >
                      {discordBusy ? (
                        <Spinner size="xs" />
                      ) : (
                        <>
                          <DiscordGlyph />
                          <span>Connect Discord</span>
                        </>
                      )}
                    </button>
                  )}
                  {profileError && (
                    <p
                      className="text-xs tracking-wider"
                      style={{ color: "oklch(0.7 0.19 22)" }}
                    >
                      {profileError}
                    </p>
                  )}
                </div>
                <DialogFooter className="mt-3 gap-2 pt-3 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className={BACK_BUTTON_CLASS}
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    onClick={() => setStep(3)}
                  >
                    Next
                  </Button>
                </DialogFooter>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-xl tracking-widest text-foreground">
                    Use 332 app responsibly
                  </DialogTitle>
                  <DialogDescription className="space-y-2 pt-1 text-sm tracking-wider text-muted-foreground">
                    <span className="block">
                      Quick Terms highlights that matter for everyday use.
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-2 text-xs leading-snug tracking-normal text-muted-foreground sm:text-sm">
                  {[
                    {
                      title: "Age and access",
                      body: "13+ only, with some areas marked 16+.",
                    },
                    {
                      title: "Safety and legality",
                      body: "No illegal content, harassment, abuse, or explicit sexual content.",
                    },
                    {
                      title: "Security and abuse",
                      body: "No hacking, account bypasses, or abusive automation.",
                    },
                    {
                      title: "Admin enforcement",
                      body: "Admins can suspend or remove access for misuse or security concerns.",
                    },
                  ].map((rule, idx) => (
                    <div
                      key={rule.title}
                      className="rounded-xl border border-white/10 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-white/20 text-[11px] font-medium text-foreground/90">
                          {idx + 1}
                        </span>
                        <p>
                          <span className="text-foreground">{rule.title}:</span>{" "}
                          {rule.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter className="mt-3 gap-2 pt-3 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className={BACK_BUTTON_CLASS}
                    onClick={() => setStep(2)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    onClick={() => setStep(4)}
                  >
                    Next
                  </Button>
                </DialogFooter>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-xl tracking-widest text-foreground">
                    Your content and AI tools
                  </DialogTitle>
                  <DialogDescription className="space-y-2 pt-1 text-sm tracking-wider text-muted-foreground">
                    <span className="block">
                      You keep ownership of your content; these are the
                      practical tradeoffs to know.
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-2 text-xs leading-snug tracking-normal text-muted-foreground sm:text-sm">
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    You keep copyright for what you upload and create.
                  </p>
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    You grant 332 app a licence to host and serve content while
                    it is on the platform.
                  </p>
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    Storage is best-effort only, so keep backups of anything
                    important.
                  </p>
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    AI output can be wrong; review it before publishing or
                    acting on it.
                  </p>
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    Uploads may be scanned by VirusTotal, and AI audio features
                    use ElevenLabs processing.
                  </p>
                </div>
                <DialogFooter className="mt-3 gap-2 pt-3 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className={BACK_BUTTON_CLASS}
                    onClick={() => setStep(3)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    onClick={() => setStep(5)}
                  >
                    Next
                  </Button>
                </DialogFooter>
              </div>
            )}

            {step === 5 && (
              <div className="flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-xl tracking-widest text-foreground">
                    Privacy and agreement
                  </DialogTitle>
                  <DialogDescription className="space-y-2 pt-1 text-sm tracking-wider text-muted-foreground">
                    <span className="block">
                      We collect only what is needed to run and secure 332 app.
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-2 text-xs leading-snug tracking-normal text-muted-foreground sm:text-sm">
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    Account and security data includes login methods, sessions,
                    and abuse-prevention logs.
                  </p>
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    We do not sell your data or share it for advertising.
                  </p>
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    Product analytics can be turned off anytime in Settings.
                  </p>
                  <p className="rounded-xl border border-white/10 px-3 py-2.5">
                    You can request access, correction, deletion, export, or
                    object to processing.
                  </p>
                  <p className="px-1 pt-1">
                    Read the full documents:{" "}
                    <a
                      href={TERMS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href={PRIVACY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Privacy Policy
                    </a>
                    .
                  </p>
                  <label
                    htmlFor="welcome-legal-agree"
                    className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-xs leading-snug tracking-normal text-foreground sm:text-sm"
                  >
                    <Checkbox
                      id="welcome-legal-agree"
                      checked={legalAccepted}
                      onCheckedChange={(checked) => {
                        setLegalAccepted(checked === true)
                        if (checked === true) setFinishError(null)
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      I have read and agree to the Terms of Service and Privacy
                      Policy, and I confirm I meet the age requirement.
                    </span>
                  </label>
                </div>
                {finishError && (
                  <p
                    className="mt-2 text-xs tracking-normal"
                    style={{ color: "oklch(0.7 0.19 22)" }}
                  >
                    {finishError}
                  </p>
                )}
                <DialogFooter className="mt-3 gap-2 pt-3 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className={BACK_BUTTON_CLASS}
                    onClick={() => setStep(4)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    disabled={finishLoading || !legalAccepted}
                    onClick={() => void handleFinish()}
                  >
                    {finishLoading ? <Spinner size="xs" /> : "Get started"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
