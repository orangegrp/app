"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  applyProductImprovementConsent,
  capture,
  reset,
} from "@/lib/analytics"
import { isProductImprovementConsentAllowedSync } from "@/lib/product-improvement-consent"
import { Key, Trash2, ArrowLeft } from "lucide-react"
import { PageBackground } from "@/components/layout/PageBackground"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAuth } from "@/hooks/useAuth"
import { useAuthStore } from "@/lib/auth-store"
import { Switch } from "@/components/ui/switch"
import {
  apiDelete,
  apiFetch,
  apiGet,
  apiPatch,
  apiPost,
} from "@/lib/api-client"
import { useSettingsStore } from "@/lib/settings-store"
import { hardNavigateTo } from "@/lib/hard-navigation"
import { isPWAContext } from "@/lib/pwa"
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/display-name"
import { userDisplayName } from "@/lib/user-display"

interface PasskeyRow {
  id: string
  name: string | null
  createdAt: string
  lastUsedAt: string | null
  deviceType: string
  backedUp: boolean
}

interface MeProfile {
  id: string
  permissions: string
  isPwa: boolean
  discordId: string | null
  discordUsername?: string
  discordAvatar?: string
  displayName?: string | null
  loginPasskeyEnabled: boolean
  loginDiscordEnabled: boolean
  loginMagicEnabled: boolean
  loginQrEnabled: boolean
  passkeyCount: number
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

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, logout } = useAuth()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const knownAppVersion = useSettingsStore((s) => s.knownAppVersion)

  const [serverVersion, setServerVersion] = useState<string | null>(null)
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [pkLoading, setPkLoading] = useState(true)
  const [addingPk, setAddingPk] = useState(false)
  const [newPkName, setNewPkName] = useState("")
  const [pkError, setPkError] = useState<string | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteDialogAccountId, setDeleteDialogAccountId] = useState("")
  const [deleteDialogPhrase, setDeleteDialogPhrase] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [passkeyToRemove, setPasskeyToRemove] = useState<PasskeyRow | null>(
    null
  )

  const [me, setMe] = useState<MeProfile | null>(null)
  const [meLoading, setMeLoading] = useState(true)
  const [discordBusy, setDiscordBusy] = useState(false)
  const [methodsError, setMethodsError] = useState<string | null>(null)
  const [methodsSaving, setMethodsSaving] = useState(false)
  const [discordNotice, setDiscordNotice] = useState<string | null>(null)
  const [unlinkDiscordOpen, setUnlinkDiscordOpen] = useState(false)
  const [displayNameDraft, setDisplayNameDraft] = useState("")
  const [displayNameSaving, setDisplayNameSaving] = useState(false)
  const [displayNameError, setDisplayNameError] = useState<string | null>(null)
  const [productImprovementAllowed, setProductImprovementAllowed] =
    useState(true)

  const loadMe = useCallback(async () => {
    try {
      const data = await apiGet<MeProfile>("/me")
      setMe(data)
      setDisplayNameDraft(data.displayName ?? "")
    } catch {
      setMe(null)
    } finally {
      setMeLoading(false)
    }
  }, [])

  const loadPasskeys = useCallback(async () => {
    setPkError(null)
    try {
      const data = await apiGet<{ passkeys: PasskeyRow[] }>("/auth/passkeys")
      setPasskeys(data.passkeys)
    } catch {
      setPkError("Could not load passkeys")
      setPasskeys([])
    } finally {
      setPkLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetch("/api/version")
      .then((r) => r.json())
      .then((j: { version?: string }) => setServerVersion(j.version ?? null))
      .catch(() => setServerVersion(null))
  }, [])

  useEffect(() => {
    void loadPasskeys()
  }, [loadPasskeys])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  useEffect(() => {
    setProductImprovementAllowed(isProductImprovementConsentAllowedSync())
  }, [])

  useEffect(() => {
    const d = searchParams.get("discord")
    if (!d) return
    const map: Record<string, string> = {
      linked: "Discord connected.",
      taken: "That Discord account is already linked to another user.",
      already_linked:
        "This account already has a different Discord linked — disconnect it first.",
      error: "Could not connect Discord.",
      denied: "Discord connection was cancelled.",
    }
    if (map[d]) setDiscordNotice(map[d])
    router.replace("/settings", { scroll: false })
    void loadMe()
  }, [searchParams, router, loadMe])

  const saveDisplayName = async () => {
    setDisplayNameSaving(true)
    setDisplayNameError(null)
    try {
      const next = await apiPatch<MeProfile>("/me/profile", {
        displayName:
          displayNameDraft.trim() === "" ? null : displayNameDraft.trim(),
      })
      setMe(next)
      useAuthStore
        .getState()
        .mergeAuthUser({ displayName: next.displayName ?? null })
      capture("settings_display_name_saved", {
        has_display_name: next.displayName !== null,
      })
    } catch (e) {
      setDisplayNameError(
        e instanceof Error ? e.message : "Could not save display name"
      )
    } finally {
      setDisplayNameSaving(false)
    }
  }

  const patchLoginMethods = async (
    partial: Partial<
      Pick<
        MeProfile,
        | "loginPasskeyEnabled"
        | "loginDiscordEnabled"
        | "loginMagicEnabled"
        | "loginQrEnabled"
      >
    >
  ) => {
    setMethodsSaving(true)
    setMethodsError(null)
    try {
      const next = await apiPatch<MeProfile>("/me/login-methods", partial)
      setMe(next)
    } catch (e) {
      setMethodsError(
        e instanceof Error ? e.message : "Could not update sign-in methods"
      )
    } finally {
      setMethodsSaving(false)
    }
  }

  const handleConnectDiscord = async () => {
    setDiscordBusy(true)
    setDiscordNotice(null)
    try {
      const { url } = await apiPost<{ url: string }>(
        "/auth/discord/link-start",
        {
          isPwa: isPWAContext(),
        }
      )
      hardNavigateTo(url)
    } catch {
      setDiscordNotice("Could not start Discord connection.")
      setDiscordBusy(false)
    }
  }

  const handleUnlinkDiscord = async () => {
    try {
      await apiPost<{ ok: boolean }>("/auth/discord/unlink", {})
      setUnlinkDiscordOpen(false)
      setDiscordNotice("Discord disconnected.")
      await loadMe()
      await loadPasskeys()
    } catch (e) {
      setDiscordNotice(
        e instanceof Error ? e.message : "Could not disconnect Discord"
      )
    }
  }

  const resetDeleteDialog = () => {
    setDeleteDialogAccountId("")
    setDeleteDialogPhrase("")
    setDeleteError(null)
  }

  const handleAddPasskey = async () => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setPkError("Passkeys are not supported in this browser.")
      return
    }
    setAddingPk(true)
    setPkError(null)
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
      const credentialName = newPkName.trim() || undefined
      await apiPost("/auth/add/finish", { credential, credentialName })
      setNewPkName("")
      capture("settings_passkey_added")
      await loadPasskeys()
    } catch (e) {
      setPkError(e instanceof Error ? e.message : "Could not add passkey")
    } finally {
      setAddingPk(false)
    }
  }

  const handleRemovePasskey = async () => {
    if (!passkeyToRemove) return
    try {
      await apiFetch(`/auth/passkeys/${passkeyToRemove.id}`, {
        method: "DELETE",
      })
      setPasskeyToRemove(null)
      await loadPasskeys()
    } catch {
      setPkError("Could not remove passkey")
      setPasskeyToRemove(null)
    }
  }

  const canConfirmDelete =
    !!user &&
    deleteDialogAccountId === user.id &&
    deleteDialogPhrase === "delete my account"

  const handleConfirmDeleteAccount = async () => {
    if (!user || !canConfirmDelete) return
    setDeleteError(null)
    setDeleting(true)
    try {
      await apiDelete("/auth/account", {
        accountId: user.id,
        confirmation: "delete my account",
      })
      capture("settings_account_deleted")
      reset()
      clearAuth()
      setDeleteDialogOpen(false)
      resetDeleteDialog()
      router.replace("/login")
    } catch {
      setDeleteError(
        "Could not delete account. Check the fields and try again."
      )
    } finally {
      setDeleting(false)
    }
  }

  const displayName = userDisplayName(user)

  return (
    <div className="page-root relative min-h-screen px-6 pt-8 pb-32 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-2xl">
        <Link
          href="/home"
          className="mb-8 inline-flex items-center gap-2 text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Back to home
        </Link>

        <p className="section-label">Account</p>
        <h2 className="mb-10 text-3xl tracking-widest text-foreground">
          Settings<span className="blink-cursor">_</span>
        </h2>

        {/* Profile */}
        <div className="glass-card mb-6 rounded-2xl p-6">
          <p className="card-label mb-4">Profile</p>
          <p className="mb-4 text-sm tracking-wider text-foreground">
            {displayName}
          </p>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="settings-display-name"
              className="text-xs tracking-wider text-muted-foreground"
            >
              Display name
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Input
                id="settings-display-name"
                type="text"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                placeholder="Optional — shown across the app"
                disabled={meLoading}
                className="min-h-[44px] w-full sm:min-w-0 sm:flex-1"
              />
              <Button
                type="button"
                disabled={meLoading || displayNameSaving}
                onClick={() => void saveDisplayName()}
                className="min-h-[44px] w-full shrink-0 sm:w-auto"
              >
                {displayNameSaving ? <Spinner size="xs" /> : "Save"}
              </Button>
            </div>
            <p className="text-[11px] tracking-wider text-muted-foreground">
              Separate from Discord. Max {DISPLAY_NAME_MAX_LENGTH} characters.
              Clear to use Discord or ID.
            </p>
          </div>
          {displayNameError && (
            <p
              className="mt-2 text-xs tracking-wider"
              style={{ color: "oklch(0.7 0.19 22)" }}
            >
              {displayNameError}
            </p>
          )}
          {user?.id && (
            <p className="mt-4 font-mono text-xs tracking-wider break-all text-muted-foreground/80">
              ID: {user.id}
            </p>
          )}
        </div>

        {/* App version */}
        <div className="glass-card mb-6 rounded-2xl p-6">
          <p className="card-label mb-4">App</p>
          <p className="text-xs tracking-wider text-muted-foreground">
            Build:{" "}
            <span className="font-mono text-foreground/90">
              {serverVersion ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}
            </span>
          </p>
          {knownAppVersion && (
            <p className="mt-1 text-xs tracking-wider text-muted-foreground">
              Last known: <span className="font-mono">{knownAppVersion}</span>
            </p>
          )}
        </div>

        {/* Product improvement analytics (PostHog) */}
        <div
          id="product-improvement-analytics"
          className="glass-card mb-6 scroll-mt-24 rounded-2xl p-6"
        >
          <p className="card-label mb-4">Privacy</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm tracking-wider text-foreground">
                Help us improve the app
              </p>
              <p className="mt-1 text-xs tracking-wider text-muted-foreground">
                When this is on, we receive basic usage info and automatic crash
                reports so we can fix bugs and spot problems. Turn it off anytime.
              </p>
            </div>
            <Switch
              checked={productImprovementAllowed}
              onCheckedChange={(checked) => {
                setProductImprovementAllowed(checked)
                applyProductImprovementConsent(checked)
              }}
              className="mt-1 shrink-0 data-[state=checked]:bg-foreground/30"
              aria-label="Send usage and crash data to help improve the app"
            />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed tracking-wider text-muted-foreground/90">
            No personal data is collected. All information is anonymised and
            stored securely in the EU.
          </p>
        </div>

        {/* Discord */}
        <div className="glass-card mb-6 rounded-2xl p-6">
          <p className="card-label mb-4">Discord</p>
          {discordNotice && (
            <p className="mb-3 text-xs tracking-wider text-muted-foreground">
              {discordNotice}
            </p>
          )}
          {meLoading ? (
            <div className="flex justify-center py-4">
              <Spinner size="md" clockwise />
            </div>
          ) : me?.discordId ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="shrink-0 text-muted-foreground">
                  <DiscordGlyph />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm tracking-wider text-foreground">
                    {me.discordUsername ?? "Connected"}
                  </p>
                  <p className="text-[11px] tracking-wider text-muted-foreground/80">
                    Linked for sign-in and profile
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={(me.passkeyCount ?? 0) < 1}
                onClick={() => setUnlinkDiscordOpen(true)}
                className="glass-button glass-button-secondary shrink-0 rounded-xl px-4 py-2.5 text-xs tracking-widest disabled:opacity-40"
                style={{ minHeight: "44px" }}
                title={
                  (me.passkeyCount ?? 0) < 1
                    ? "Add a passkey before disconnecting Discord"
                    : undefined
                }
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs tracking-wider text-muted-foreground">
                Connect your Discord account for sign-in and avatar.
              </p>
              <button
                type="button"
                onClick={() => void handleConnectDiscord()}
                disabled={discordBusy}
                className="glass-button glass-button-glass inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs tracking-widest"
                style={{ minHeight: "44px" }}
              >
                {discordBusy ? <Spinner size="xs" /> : <DiscordGlyph />}
                {discordBusy ? "Redirecting…" : "Connect Discord"}
              </button>
            </div>
          )}
        </div>

        {/* Sign-in method toggles */}
        <div className="glass-card mb-6 rounded-2xl p-6">
          <p className="card-label mb-2">Sign-in methods</p>
          <p className="mb-4 text-xs tracking-wider text-muted-foreground">
            Turn off methods you do not want to allow (like freezing a card). At
            least one must stay on.
          </p>
          {methodsError && (
            <p
              className="mb-3 text-xs tracking-wider"
              style={{ color: "oklch(0.7 0.19 22)" }}
            >
              {methodsError}
            </p>
          )}
          {meLoading || !me ? (
            <div className="flex justify-center py-4">
              <Spinner size="md" clockwise />
            </div>
          ) : (
            <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5">
              {(
                [
                  {
                    key: "loginPasskeyEnabled" as const,
                    label: "Passkey",
                    desc: "Security keys and platform authenticators",
                  },
                  {
                    key: "loginDiscordEnabled" as const,
                    label: "Discord",
                    desc: "Sign in with Discord OAuth",
                  },
                  {
                    key: "loginMagicEnabled" as const,
                    label: "Magic link",
                    desc: "Links sent by the community bot",
                  },
                  {
                    key: "loginQrEnabled" as const,
                    label: "QR code",
                    desc: "Approve desktop login from your phone",
                  },
                ] as const
              ).map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm tracking-wider text-foreground">
                      {label}
                    </p>
                    <p className="text-[11px] tracking-wider text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                  <Switch
                    checked={me[key]}
                    onCheckedChange={(v) =>
                      void patchLoginMethods({ [key]: v })
                    }
                    disabled={methodsSaving}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Passkeys */}
        <div className="glass-card mb-6 rounded-2xl p-6">
          <p className="card-label mb-4">Passkeys</p>
          <p className="mb-4 text-xs tracking-wider text-muted-foreground">
            Sign in without a password. You can add multiple devices.
          </p>

          {pkLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="md" clockwise />
            </div>
          ) : (
            <>
              {passkeys.length === 0 ? (
                <p className="py-2 text-xs tracking-wider text-muted-foreground/70">
                  No passkeys yet.
                </p>
              ) : (
                <ul className="mb-4 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5">
                  {passkeys.map((pk) => (
                    <li
                      key={pk.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <Key
                        size={16}
                        className="shrink-0 text-muted-foreground"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm tracking-wider">
                          {pk.name ?? pk.deviceType ?? "Passkey"}
                        </p>
                        <p className="text-[10px] tracking-widest text-muted-foreground/70">
                          Added {new Date(pk.createdAt).toLocaleDateString()}
                          {pk.lastUsedAt
                            ? ` · Used ${new Date(pk.lastUsedAt).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPasskeyToRemove(pk)}
                        className="glass-button glass-button-ghost shrink-0 rounded-lg p-2 text-muted-foreground hover:text-foreground"
                        aria-label="Remove passkey"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
                <div className="min-w-0 flex-1">
                  <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                    Label (optional)
                  </label>
                  <Input
                    value={newPkName}
                    onChange={(e) => setNewPkName(e.target.value)}
                    placeholder="e.g. Bitwarden Keychain"
                    className="glass-card h-9 border-white/10 bg-transparent text-sm tracking-wider"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddPasskey()}
                  disabled={addingPk}
                  className="glass-button glass-button-glass inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-5 text-sm tracking-widest disabled:opacity-50"
                >
                  {addingPk ? <Spinner size="xs" /> : "Add passkey"}
                </button>
              </div>
              {pkError && (
                <p
                  className="mt-3 text-xs tracking-wider"
                  style={{ color: "oklch(0.7 0.19 22)" }}
                >
                  {pkError}
                </p>
              )}
            </>
          )}
        </div>

        {/* Danger zone */}
        <div
          className="glass-card rounded-2xl border border-white/10 p-6"
          style={{ background: "oklch(0.12 0.05 22 / 15%)" }}
        >
          <p
            className="card-label mb-2"
            style={{ color: "oklch(0.75 0.12 22)" }}
          >
            Danger zone
          </p>
          <p className="mb-4 text-xs tracking-wider text-muted-foreground">
            Permanently delete your account and passkeys. This cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => {
              resetDeleteDialog()
              setDeleteDialogOpen(true)
            }}
            className="glass-button glass-button-destructive rounded-xl px-5 py-3 text-sm tracking-widest"
            style={{ minHeight: "44px" }}
          >
            Delete account
          </button>
        </div>

        <div className="mt-10 pb-8">
          <button
            type="button"
            onClick={() => void logout()}
            className="text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            Log out
          </button>
        </div>
      </div>

      <AlertDialog open={unlinkDiscordOpen} onOpenChange={setUnlinkDiscordOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Discord?</AlertDialogTitle>
            <AlertDialogDescription>
              You can reconnect later. You need at least one passkey so you can
              still sign in without Discord.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleUnlinkDiscord()}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!passkeyToRemove}
        onOpenChange={(open) => !open && setPasskeyToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer be able to sign in with this device until you
              add a new passkey.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemovePasskey()}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) resetDeleteDialog()
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your account and passkeys. You will need
              a new invite to register again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Type{" "}
                <span className="font-mono text-foreground">
                  delete my account
                </span>
              </label>
              <Input
                value={deleteDialogPhrase}
                onChange={(e) => setDeleteDialogPhrase(e.target.value)}
                className="glass-card border-white/10 bg-transparent text-sm tracking-wider"
                autoComplete="off"
                aria-invalid={
                  deleteDialogPhrase.length > 0 &&
                  deleteDialogPhrase !== "delete my account"
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Confirm your account ID
              </label>
              <Input
                value={deleteDialogAccountId}
                onChange={(e) => setDeleteDialogAccountId(e.target.value)}
                placeholder={user?.id ?? ""}
                className="glass-card border-white/10 bg-transparent font-mono text-xs tracking-wider"
                autoComplete="off"
              />
            </div>
            {deleteError && (
              <p
                className="text-xs tracking-wider"
                style={{ color: "oklch(0.7 0.19 22)" }}
              >
                {deleteError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!canConfirmDelete || deleting}
              onClick={() => void handleConfirmDeleteAccount()}
            >
              {deleting ? <Spinner size="xs" /> : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
