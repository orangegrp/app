"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { PageBackground } from "@/components/layout/PageBackground"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePermission } from "@/hooks/usePermission"
import { PERMISSIONS } from "@/lib/permissions"
import { apiGet, apiPut } from "@/lib/api-client"

type AdminUserLite = {
  id: string
  displayName: string | null
  discordUsername: string | null
}

type UsersListResponse = {
  users: AdminUserLite[]
  total: number
  page: number
  pageSize: number
}

type MailSetupResponse = {
  mailbox: {
    id: string
    ownerUserId: string
    primaryEmail: string
    displayName: string | null
    isActive: boolean
  } | null
  aliases: Array<{ id: string; aliasEmail: string }>
}

export default function AdminMailPage() {
  const router = useRouter()
  const canAccess = usePermission(PERMISSIONS.ADMIN_MAIL_MANAGE)

  const [users, setUsers] = useState<AdminUserLite[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedUserId, setSelectedUserId] = useState<string>("")

  const [loadingSetup, setLoadingSetup] = useState(false)
  const [primaryEmail, setPrimaryEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [isActive, setIsActive] = useState(false)
  const [aliasesText, setAliasesText] = useState("")
  const [saveLoading, setSaveLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!canAccess) {
      router.replace("/admin")
      return
    }

    setLoadingUsers(true)
    void apiGet<UsersListResponse>(`/admin/mail/users?page=1&pageSize=100&search=${encodeURIComponent(search.trim())}`)
      .then((res) => {
        setUsers(res.users)
        if (!selectedUserId && res.users.length > 0) {
          setSelectedUserId(res.users[0].id)
        }
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "Failed to load users")
      })
      .finally(() => setLoadingUsers(false))
  }, [canAccess, router, search, selectedUserId])

  useEffect(() => {
    if (!selectedUserId) return
    setLoadingSetup(true)
    setErr(null)
    setMsg(null)
    void apiGet<MailSetupResponse>(`/admin/mail/setup/${encodeURIComponent(selectedUserId)}`)
      .then((res) => {
        setPrimaryEmail(res.mailbox?.primaryEmail ?? "")
        setDisplayName(res.mailbox?.displayName ?? "")
        setIsActive(res.mailbox?.isActive ?? false)
        setAliasesText(res.aliases.map((a) => a.aliasEmail).join(", "))
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "Failed to load setup")
      })
      .finally(() => setLoadingSetup(false))
  }, [selectedUserId])

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  )

  async function handleSave() {
    if (!selectedUserId) return
    setSaveLoading(true)
    setErr(null)
    setMsg(null)

    const aliases = aliasesText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    try {
      await apiPut<{ ok: true }>(`/admin/mail/setup/${encodeURIComponent(selectedUserId)}`, {
        primaryEmail,
        displayName: displayName.trim() || null,
        isActive,
        aliases,
      })
      setMsg("Mailbox setup saved")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaveLoading(false)
    }
  }

  function applyDefaultPrimaryFromUserId(): void {
    if (!selectedUserId) return
    const localPart = selectedUserId.toLowerCase()
    const configuredDomain =
      process.env.NEXT_PUBLIC_MAIL_DEFAULT_DOMAIN?.trim().toLowerCase() ?? ""

    const existingDomain = primaryEmail.includes("@")
      ? primaryEmail.split("@").pop()?.trim().toLowerCase() ?? ""
      : ""

    const domain = existingDomain || configuredDomain
    if (!domain) {
      setErr("Set NEXT_PUBLIC_MAIL_DEFAULT_DOMAIN to use default email generation.")
      return
    }

    setErr(null)
    setPrimaryEmail(`${localPart}@${domain}`)
  }

  if (!canAccess) {
    return (
      <div className="page-root relative flex min-h-screen items-center justify-center">
        <PageBackground />
        <Spinner size="md" clockwise />
      </div>
    )
  }

  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-5xl">
        <Link
          href="/admin"
          className="mb-8 inline-flex items-center gap-2 text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Back to admin
        </Link>

        <p className="section-label">Admin</p>
        <h2 className="mb-6 text-3xl tracking-widest text-foreground">Mail setup<span className="blink-cursor">_</span></h2>

        <div className="mb-4 max-w-sm">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <aside className="glass-card max-h-[60vh] overflow-auto rounded-2xl p-2">
            {loadingUsers ? (
              <div className="flex justify-center py-8"><Spinner size="sm" clockwise /></div>
            ) : users.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No users found.</p>
            ) : (
              users.map((u) => {
                const active = u.id === selectedUserId
                const label = u.displayName ?? u.discordUsername ?? u.id
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={[
                      "w-full rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                    ].join(" ")}
                  >
                    <div className="truncate">{label}</div>
                    <div className="truncate text-[11px] opacity-70">{u.id}</div>
                  </button>
                )
              })
            )}
          </aside>

          <section className="glass-card rounded-2xl p-5">
            {!selectedUser ? (
              <p className="text-sm text-muted-foreground">Select a user to configure mailbox setup.</p>
            ) : loadingSetup ? (
              <div className="flex justify-center py-12"><Spinner size="md" clockwise /></div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Configuring: <span className="text-foreground">{selectedUser.displayName ?? selectedUser.discordUsername ?? selectedUser.id}</span>
                </p>

                <label className="block text-sm text-muted-foreground">
                  Primary email
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={primaryEmail}
                      onChange={(e) => setPrimaryEmail(e.target.value)}
                      placeholder="user@example.com"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={applyDefaultPrimaryFromUserId}
                    >
                      Default from user ID
                    </Button>
                  </div>
                </label>

                <label className="block text-sm text-muted-foreground">
                  Mailbox display name (optional)
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display name"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Mailbox active
                </label>

                <label className="block text-sm text-muted-foreground">
                  Aliases (comma separated)
                  <Input
                    value={aliasesText}
                    onChange={(e) => setAliasesText(e.target.value)}
                    placeholder="alias1@example.com, alias2@example.com"
                  />
                </label>

                {err ? <p className="text-sm text-destructive">{err}</p> : null}
                {msg ? <p className="text-sm text-emerald-400">{msg}</p> : null}

                <Button type="button" disabled={saveLoading || !primaryEmail.trim()} onClick={() => void handleSave()}>
                  {saveLoading ? "Saving..." : "Save mailbox setup"}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
