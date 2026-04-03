"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { hardNavigateTo } from "@/lib/hard-navigation"
import { isPWAContext } from "@/lib/pwa"
import posthog from "posthog-js"
import { useAuthStore } from "@/lib/auth-store"
import { consumePostLoginRedirect } from "@/lib/qr-login-redirect"
import { Spinner } from "@/components/ui/spinner"
import Image from "next/image"

type Step = "invite" | "choose" | "passkey-pending" | "error"

function DiscordIcon() {
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

function KeyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"
      />
    </svg>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [step, setStep] = useState<Step>("invite")
  const [inviteCode, setInviteCode] = useState("")
  const [registrationToken, setRegistrationToken] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const handleClaimInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setIsLoading(true)
    setErrorMsg("")

    try {
      const res = await fetch("/api/auth/invite/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode.trim() }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (res.status >= 500) {
          setErrorMsg(
            data.error ??
              "Something went wrong on our side. Please try again in a moment."
          )
        } else {
          setErrorMsg(data.error ?? "Invalid invite code")
        }
        return
      }
      const { registrationToken: token } = (await res.json()) as {
        registrationToken: string
      }
      setRegistrationToken(token)
      posthog.capture("registration_invite_claimed")
      setStep("choose")
    } catch {
      setErrorMsg("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDiscordRegister = () => {
    const isPwa = isPWAContext()
    hardNavigateTo(
      `/api/auth/discord?registrationToken=${encodeURIComponent(registrationToken)}&isPwa=${isPwa}`
    )
  }

  const handlePasskeyRegister = async () => {
    if (!window.PublicKeyCredential) {
      setErrorMsg("Passkeys are not supported on this device/browser.")
      return
    }
    setIsLoading(true)
    setErrorMsg("")

    try {
      // Step 1: Get registration options
      const startRes = await fetch("/api/auth/register/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationToken }),
      })
      if (!startRes.ok) {
        const data = (await startRes.json().catch(() => ({}))) as {
          error?: string
        }
        setErrorMsg(data.error ?? "Failed to start passkey registration")
        return
      }
      const { options } = (await startRes.json()) as { options: unknown }

      // Step 2: Create credential with browser
      const { startRegistration } = await import("@simplewebauthn/browser")
      const credential = await startRegistration({
        optionsJSON: options as Parameters<
          typeof startRegistration
        >[0]["optionsJSON"],
      })

      // Step 3: Verify with server
      const finishRes = await fetch("/api/auth/register/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationToken,
          credential,
          isPwa: isPWAContext(),
          credentialName: "My Passkey",
        }),
        credentials: "include",
      })
      if (!finishRes.ok) {
        const data = (await finishRes.json().catch(() => ({}))) as {
          error?: string
        }
        setErrorMsg(data.error ?? "Passkey registration failed")
        return
      }
      const { accessToken } = (await finishRes.json()) as {
        accessToken: string
      }
      const [, b64] = accessToken.split(".")
      const payload = JSON.parse(
        atob(b64.replace(/-/g, "+").replace(/_/g, "/"))
      ) as {
        sub: string
        permissions: string
        isPwa: boolean
      }
      setAuth(accessToken, {
        id: payload.sub,
        permissions: payload.permissions,
        isPwa: payload.isPwa,
      })
      posthog.identify(payload.sub, { is_pwa: payload.isPwa })
      posthog.capture("registration_completed", {
        method: "passkey",
        is_pwa: payload.isPwa,
      })
      router.replace(consumePostLoginRedirect())
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setErrorMsg("Passkey setup was cancelled.")
      } else {
        setErrorMsg("Passkey registration failed. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="page-root relative flex min-h-screen items-center justify-center px-4">
      <div
        className="dot-pattern pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 overflow-clip"
        aria-hidden="true"
        style={{ contain: "layout style paint" }}
      >
        <div
          className="absolute top-[20%] left-[15%] h-[500px] w-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.9 0 0 / 5%), transparent 65%)",
            filter: "blur(80px)",
            animation: "float-orb-1 28s ease-in-out infinite",
          }}
        />
        <div
          className="absolute top-[40%] right-[10%] h-[400px] w-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.8 0 0 / 4%), transparent 65%)",
            filter: "blur(60px)",
            animation: "float-orb-2 34s ease-in-out infinite",
          }}
        />
        <div
          className="absolute bottom-[15%] left-[30%] h-[350px] w-[350px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.85 0 0 / 4%), transparent 65%)",
            filter: "blur(70px)",
            animation: "float-orb-3 24s ease-in-out infinite",
          }}
        />
      </div>

      <div className="glass-card relative z-10 w-full max-w-sm rounded-3xl px-8 py-10">
        <div className="mb-8 flex flex-col items-center gap-4">
          <Image
            src="/icons/polygon.svg"
            alt="332"
            width={56}
            height={56}
            priority
          />
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-2xl tracking-widest text-foreground">
              Members area<span className="blink-cursor">_</span>
            </h1>
            <p className="text-xs tracking-wider text-muted-foreground">
              {step === "invite"
                ? "Enter your invite code"
                : "Set up your login method"}
            </p>
          </div>
        </div>

        {step === "invite" && (
          <form onSubmit={handleClaimInvite} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="glass-card w-full rounded-xl border-0 bg-transparent px-4 py-3 text-sm tracking-widest text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-white/10"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={isLoading}
            />
            {errorMsg && (
              <p
                className="text-xs tracking-wider"
                style={{ color: "oklch(0.7 0.19 22)" }}
              >
                {errorMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={isLoading || !inviteCode.trim()}
              className="glass-button glass-button-default flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm tracking-widest disabled:opacity-50"
            >
              {isLoading ? <Spinner size="sm" /> : null}
              Continue
            </button>
          </form>
        )}

        {step === "choose" && (
          <div className="flex flex-col gap-3">
            <p className="mb-2 text-center text-xs tracking-widest text-muted-foreground">
              Choose a login method
            </p>

            <button
              onClick={handlePasskeyRegister}
              disabled={isLoading}
              className="glass-button glass-button-glass flex items-center gap-3 rounded-xl px-6 py-3.5 text-sm tracking-wider disabled:opacity-50"
            >
              <KeyIcon />
              <span className="flex-1 text-left">Set up Passkey</span>
              <span className="text-xs text-muted-foreground/60">
                Recommended
              </span>
            </button>

            <button
              onClick={handleDiscordRegister}
              disabled={isLoading}
              className="glass-button flex items-center gap-3 rounded-xl px-6 py-3.5 text-sm tracking-wider disabled:opacity-50"
              style={{
                background: "#5865F2",
                borderTopColor: "oklch(1 0 0 / 20%)",
                borderLeftColor: "oklch(1 0 0 / 12%)",
                borderRightColor: "oklch(0 0 0 / 10%)",
                borderBottomColor: "oklch(0 0 0 / 20%)",
              }}
            >
              <DiscordIcon />
              Continue with Discord
            </button>

            {errorMsg && (
              <p
                className="text-center text-xs tracking-wider"
                style={{ color: "oklch(0.7 0.19 22)" }}
              >
                {errorMsg}
              </p>
            )}

            {isLoading && (
              <div className="flex justify-center py-2">
                <Spinner size="sm" />
              </div>
            )}
          </div>
        )}

        <div className="mt-6 border-t border-white/5 pt-4 text-center">
          <button
            onClick={() => router.push("/login")}
            className="text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            Have an account? Sign in
          </button>
        </div>
      </div>
    </section>
  )
}
