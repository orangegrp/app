"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"
import { PageBackground } from "@/components/layout/PageBackground"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/user/UserAvatar"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAnyPermission } from "@/hooks/usePermission"
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/display-name"
import {
  ADMIN_PERMISSION_PICKLIST_ROWS,
  ADMIN_PICKLIST_PERM_KEYS,
  LEGACY_PERMISSION_ALIASES,
} from "@/lib/admin-permission-picklist"
import {
  isSuperuserPermissionsCsv,
  PERMISSIONS,
  SUPERUSER_PERMISSION,
} from "@/lib/permissions"
import { apiDelete, apiGet, apiPatch } from "@/lib/api-client"
import { useAuthStore } from "@/lib/auth-store"
import { cn } from "@/lib/utils"

const ADMIN_ACCESS = [PERMISSIONS.ADMIN_PERMISSIONS_MANAGE]

type AdminUserRow = {
  id: string
  displayName: string | null
  discordUsername: string | null
  discordAvatar: string | null
  permissions: string
  isActive: boolean
  createdAt: string
}

type ListResponse = {
  users: AdminUserRow[]
  total: number
  page: number
  pageSize: number
}

function shortId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function permissionsPreview(csv: string): string {
  const t = csv.trim()
  if (t === SUPERUSER_PERMISSION) return "Superuser (*)"
  if (!t) return "—"
  if (t.length > 48 || t.split(",").length > 3) return `${t.slice(0, 48)}…`
  return t
}

/** Map CSV from DB into checkbox state (canonical keys only). */
function selectionFromPermissionsCsv(csv: string): {
  superuser: boolean
  selected: Set<string>
} {
  if (isSuperuserPermissionsCsv(csv)) {
    return { superuser: true, selected: new Set() }
  }
  const selected = new Set<string>()
  for (const raw of csv.split(",")) {
    const t = raw.trim()
    if (!t || t === SUPERUSER_PERMISSION) continue
    const canon = LEGACY_PERMISSION_ALIASES[t] ?? t
    if (ADMIN_PICKLIST_PERM_KEYS.has(canon)) selected.add(canon)
  }
  return { superuser: false, selected }
}

export default function AdminPermissionsPage(): ReactNode {
  const router = useRouter()
  const canAccess = useAnyPermission(ADMIN_ACCESS)
  const myId = useAuthStore((s) => s.user?.id)
  const myPermissionsCsv = useAuthStore((s) => s.user?.permissions ?? "")
  const iamSuperuser = isSuperuserPermissionsCsv(myPermissionsCsv)

  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUserRow | null>(null)
  const [superuser, setSuperuser] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState("")
  /** When false, login is frozen (`is_active` false). */
  const [editLoginAllowed, setEditLoginAllowed] = useState(true)
  /** Preserves checkbox Set when turning Superuser on so toggling off restores the UI. */
  const selectedBeforeSuperRef = useRef<Set<string>>(new Set())

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const editingSelf = editing !== null && myId === editing.id
  /** Target row is superuser and caller is not — cannot change roles via API or UI. */
  const cannotEditTargetSuperuserPermissions =
    editing !== null &&
    !editingSelf &&
    isSuperuserPermissionsCsv(editing.permissions) &&
    !iamSuperuser

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedSearch(searchInput.trim()),
      350
    )
    return () => window.clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const load = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (debouncedSearch) params.set("search", debouncedSearch)
      const data = await apiGet<ListResponse>(
        `/admin/users?${params.toString()}`
      )
      setUsers(data.users)
      setTotal(data.total)
    } catch {
      setListError("Failed to load users")
      setUsers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch])

  useEffect(() => {
    if (!canAccess) return
    void load()
  }, [canAccess, load])

  useEffect(() => {
    if (!canAccess) router.replace("/home")
  }, [canAccess, router])

  const openEdit = (u: AdminUserRow): void => {
    setEditing(u)
    setSaveError(null)
    const { superuser: su, selected: sel } = selectionFromPermissionsCsv(
      u.permissions
    )
    setSuperuser(su)
    setSelected(sel)
    setEditDisplayName(u.displayName ?? "")
    setEditLoginAllowed(u.isActive)
    setEditOpen(true)
  }

  const togglePerm = (perm: string, checked: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(perm)
      else next.delete(perm)
      return next
    })
  }

  const handleSuperuser = (on: boolean): void => {
    if (on) {
      selectedBeforeSuperRef.current = new Set(selected)
      setSelected(new Set())
      setSuperuser(true)
    } else {
      setSuperuser(false)
      setSelected(new Set(selectedBeforeSuperRef.current))
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!editing) return
    setSaveLoading(true)
    setSaveError(null)
    const displayName =
      editDisplayName.trim() === "" ? null : editDisplayName.trim()
    try {
      const body = editingSelf
        ? { displayName }
        : cannotEditTargetSuperuserPermissions
          ? { displayName, isActive: editLoginAllowed }
          : {
              permissions: superuser ? [SUPERUSER_PERMISSION] : [...selected],
              displayName,
              isActive: editLoginAllowed,
            }
      const res = await apiPatch<{ user: AdminUserRow }>(
        `/admin/users/${editing.id}`,
        body
      )
      setUsers((prev) =>
        prev.map((row) => (row.id === res.user.id ? res.user : row))
      )
      setEditOpen(false)
      setEditing(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaveLoading(false)
    }
  }

  const handleConfirmDeleteUser = async (): Promise<void> => {
    if (!editing) return
    if (deleteConfirmId.trim() !== editing.id) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await apiDelete<{ ok: boolean }>(`/admin/users/${editing.id}`)
      setUsers((prev) => prev.filter((row) => row.id !== editing.id))
      setTotal((t) => Math.max(0, t - 1))
      setDeleteOpen(false)
      setDeleteConfirmId("")
      setEditOpen(false)
      setEditing(null)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete")
    } finally {
      setDeleteLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (!canAccess) {
    return (
      <div className="page-root relative flex min-h-screen items-center justify-center">
        <PageBackground />
        <Spinner size="md" />
      </div>
    )
  }

  return (
    <div className="page-root relative min-h-screen px-6 pt-8 pb-32 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-3xl">
        <Link
          href="/admin"
          className="mb-8 inline-flex items-center gap-2 text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Back to admin
        </Link>

        <p className="section-label">Admin</p>
        <h2 className="mb-6 text-3xl tracking-widest text-foreground">
          Permissions<span className="blink-cursor">_</span>
        </h2>
        <p className="mb-8 max-w-xl text-xs tracking-wider text-muted-foreground">
          Assign permissions from the canonical set. Changes apply after the
          user&apos;s next token refresh.
        </p>

        <div className="glass-card mb-6 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label
              className="text-xs tracking-wider text-muted-foreground"
              htmlFor="user-search"
            >
              Search display name or Discord username
            </label>
            <input
              id="user-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter…"
              className="glass-card min-h-[44px] w-full rounded-xl border-0 bg-transparent px-4 py-3 text-sm tracking-wider text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-white/10"
            />
          </div>
        </div>

        {listError && (
          <p
            className="mb-4 text-xs tracking-wider"
            style={{ color: "oklch(0.7 0.19 22)" }}
          >
            {listError}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="md" clockwise />
          </div>
        ) : (
          <>
            <div className="glass-card divide-y divide-white/5 overflow-hidden rounded-2xl">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 text-xs tracking-widest text-muted-foreground uppercase">
                <span>User</span>
                <span className="hidden sm:block">Permissions</span>
                <span className="text-right"> </span>
              </div>
              {users.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs tracking-wider text-muted-foreground">
                  No users match.
                </div>
              ) : (
                users.map((u) => (
                  <div
                    key={u.id}
                    className="grid grid-cols-1 items-start gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <UserAvatar
                        user={{
                          id: u.id,
                          displayName: u.displayName ?? undefined,
                          discordUsername: u.discordUsername ?? undefined,
                          discordAvatar: u.discordAvatar ?? undefined,
                        }}
                        size={32}
                        className="mt-0.5"
                        textClassName="border border-white/10"
                      />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm tracking-wider text-foreground">
                          <span>
                            {u.displayName?.trim() || u.discordUsername || "—"}
                            {myId === u.id && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </span>
                          {!u.isActive && (
                            <span className="glass-button glass-button-secondary rounded-full px-2.5 py-0.5 text-xs tracking-wider">
                              Login disabled
                            </span>
                          )}
                        </p>
                        {u.displayName?.trim() && u.discordUsername && (
                          <p
                            className="mt-0.5 truncate text-[11px] tracking-wider text-muted-foreground/80"
                            title={u.discordUsername}
                          >
                            Discord: {u.discordUsername}
                          </p>
                        )}
                        <p className="mt-0.5 font-mono text-[11px] tracking-wider text-muted-foreground/80">
                          {shortId(u.id)}
                        </p>
                        <p
                          className="mt-1 text-[11px] tracking-wider break-all text-muted-foreground sm:hidden"
                          title={u.permissions}
                        >
                          {permissionsPreview(u.permissions)}
                        </p>
                      </div>
                    </div>
                    <p
                      className="hidden max-w-[220px] truncate text-xs tracking-wider text-muted-foreground sm:block"
                      title={u.permissions}
                    >
                      {permissionsPreview(u.permissions)}
                    </p>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openEdit(u)}
                        className="glass-button glass-button-ghost inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg px-3 py-2 text-xs tracking-widest"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between text-xs tracking-wider text-muted-foreground">
                <span>
                  Page {page} of {totalPages} ({total} users)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="glass-button glass-button-secondary min-h-[44px] rounded-lg px-3 py-2 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="glass-button glass-button-secondary min-h-[44px] rounded-lg px-3 py-2 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle className="tracking-widest">Edit user</DialogTitle>
            <DialogDescription>
              {editing?.displayName?.trim() ||
                editing?.discordUsername ||
                shortId(editing?.id ?? "")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="admin-edit-display-name"
                className="text-xs tracking-widest text-muted-foreground"
              >
                Display name
              </Label>
              <input
                id="admin-edit-display-name"
                type="text"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Optional — shown instead of Discord in the app"
                className="glass-card min-h-[44px] w-full rounded-xl border-0 bg-transparent px-4 py-3 text-sm tracking-wider text-foreground outline-none placeholder:text-muted-foreground/40 focus:ring-1 focus:ring-white/10"
              />
              <p className="text-[11px] tracking-wider text-muted-foreground">
                Does not change Discord; max {DISPLAY_NAME_MAX_LENGTH}{" "}
                characters.
              </p>
            </div>

            <div
              className={cn(
                "space-y-2 rounded-xl border border-white/10 px-3 py-3",
                (editingSelf || cannotEditTargetSuperuserPermissions) &&
                  "pointer-events-none opacity-60"
              )}
            >
              <p className="text-xs tracking-widest text-muted-foreground uppercase">
                Roles and access
              </p>
              {editingSelf && (
                <p className="text-[11px] tracking-wider text-muted-foreground">
                  You cannot change your own permissions or superuser status
                  here.
                </p>
              )}
              {cannotEditTargetSuperuserPermissions && (
                <p className="text-[11px] tracking-wider text-muted-foreground">
                  Only a superuser can change this account&apos;s permissions.
                </p>
              )}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label
                      htmlFor="superuser"
                      className="text-sm tracking-wider"
                    >
                      Superuser
                    </Label>
                    <code
                      className="shrink-0 font-mono text-[11px] text-muted-foreground"
                      title="RBAC token"
                    >
                      {SUPERUSER_PERMISSION}
                    </code>
                  </div>
                  <p className="text-xs tracking-wider text-muted-foreground">
                    Grants every permission
                  </p>
                </div>
                <Switch
                  id="superuser"
                  checked={superuser}
                  onCheckedChange={(v) => handleSuperuser(v === true)}
                  disabled={editingSelf || cannotEditTargetSuperuserPermissions}
                />
              </div>

              <div
                className={cn(
                  "space-y-3 pt-1",
                  superuser &&
                    !editingSelf &&
                    !cannotEditTargetSuperuserPermissions &&
                    "pointer-events-none opacity-40"
                )}
              >
                <p className="text-xs tracking-widest text-muted-foreground uppercase">
                  Permissions
                </p>
                {ADMIN_PERMISSION_PICKLIST_ROWS.map(({ perm, label }) => {
                  const permFieldId = `admin-perm-${perm.replace(/[^a-zA-Z0-9_-]/g, "_")}`
                  return (
                    <div
                      key={perm}
                      className="flex min-h-[44px] items-center justify-between gap-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Checkbox
                          id={permFieldId}
                          checked={Boolean(selected.has(perm))}
                          onCheckedChange={(c) => togglePerm(perm, c === true)}
                          disabled={
                            superuser ||
                            editingSelf ||
                            cannotEditTargetSuperuserPermissions
                          }
                        />
                        <Label
                          htmlFor={permFieldId}
                          className="cursor-pointer text-sm font-normal tracking-wider"
                        >
                          {label}
                        </Label>
                      </div>
                      <code
                        className="max-w-[50%] shrink-0 truncate text-right font-mono text-[11px] text-muted-foreground"
                        title={perm}
                      >
                        {perm}
                      </code>
                    </div>
                  )
                })}
              </div>
            </div>

            <div
              className={cn(
                "space-y-2 rounded-xl border border-white/10 px-3 py-3",
                editingSelf && "opacity-60"
              )}
            >
              <p className="text-xs tracking-widest text-muted-foreground uppercase">
                Security
              </p>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <Label
                    htmlFor="admin-login-allowed"
                    className="text-sm tracking-wider"
                  >
                    Login allowed
                  </Label>
                  <p className="text-xs tracking-wider text-muted-foreground">
                    Turn off to security-freeze the account (blocks sign-in and
                    refresh).
                  </p>
                </div>
                <Switch
                  id="admin-login-allowed"
                  checked={editLoginAllowed}
                  onCheckedChange={(v) => setEditLoginAllowed(v === true)}
                  disabled={editingSelf}
                />
              </div>
            </div>

            {!editingSelf && (
              <div className="space-y-2 rounded-xl border border-red-500/25 px-3 py-3">
                <p className="text-xs tracking-widest text-muted-foreground uppercase">
                  Danger zone
                </p>
                <p className="text-xs tracking-wider text-muted-foreground">
                  Permanently delete this user and revoke access. Invite codes
                  they created remain; sessions end immediately.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmId("")
                    setDeleteError(null)
                    setDeleteOpen(true)
                  }}
                  className="glass-button glass-button-destructive min-h-[44px] rounded-lg px-4 py-2.5 text-xs tracking-widest"
                >
                  Delete user
                </button>
              </div>
            )}
          </div>

          {saveError && (
            <p
              className="text-xs tracking-wider"
              style={{ color: "oklch(0.7 0.19 22)" }}
            >
              {saveError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveLoading}
              onClick={() => void handleSave()}
            >
              {saveLoading ? <Spinner size="xs" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) {
            setDeleteConfirmId("")
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="tracking-widest">
              Delete user?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Type the user&apos;s full account ID to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="mb-1.5 block text-xs tracking-wider text-muted-foreground">
                Account ID
              </label>
              <Input
                value={deleteConfirmId}
                onChange={(e) => setDeleteConfirmId(e.target.value)}
                placeholder={editing?.id ?? ""}
                className="glass-card border-white/10 bg-transparent font-mono text-xs tracking-wider"
                autoComplete="off"
                aria-invalid={
                  deleteConfirmId.length > 0 &&
                  deleteConfirmId.trim() !== editing?.id
                }
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
              disabled={deleteConfirmId.trim() !== editing?.id || deleteLoading}
              onClick={() => void handleConfirmDeleteUser()}
            >
              {deleteLoading ? <Spinner size="xs" /> : "Delete permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
