'use client'
import { useState, useEffect, useCallback } from 'react'
import { Copy, Trash2, Plus, Check } from 'lucide-react'
import { PageBackground } from '@/components/layout/PageBackground'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { usePermission } from '@/hooks/usePermission'
import { useRouter } from 'next/navigation'
import { ADMIN_PERMISSION_PICKLIST_ROWS } from '@/lib/admin-permission-picklist'
import { useAuthStore } from '@/lib/auth-store'
import { PERMISSIONS, SUPERUSER_PERMISSION } from '@/lib/permissions'

interface InviteCode {
  id: string
  code: string
  createdAt: string
  expiresAt: string | null
  isUsed: boolean
  usedAt: string | null
  usedBy: string | null
  permissions: string
  usedByUser: {
    id: string
    displayName: string | null
    discordUsername: string | null
  } | null
}

function shortId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function redeemerLabel(u: NonNullable<InviteCode['usedByUser']>): string {
  const d = u.displayName?.trim()
  if (d) return d
  if (u.discordUsername) return u.discordUsername
  return shortId(u.id)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

function permissionsPreview(csv: string): string {
  const t = csv.trim()
  if (t === SUPERUSER_PERMISSION) return 'Superuser (*)'
  if (!t) return '—'
  if (t.length > 48 || t.split(',').length > 3) return `${t.slice(0, 48)}…`
  return t
}

export default function AdminInvitesPage() {
  const router = useRouter()
  const isAdmin = usePermission(PERMISSIONS.ADMIN_INVITES_MANAGE)
  const accessToken = useAuthStore((s) => s.accessToken)

  const [invites, setInvites] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState<string>('7')
  const [inviteSuperuser, setInviteSuperuser] = useState(false)
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(() => new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleInvitePerm = (perm: string, on: boolean): void => {
    setSelectedPerms((prev) => {
      const next = new Set(prev)
      if (on) next.add(perm)
      else next.delete(perm)
      return next
    })
  }

  const handleInviteSuperuser = (on: boolean): void => {
    setInviteSuperuser(on)
    if (on) setSelectedPerms(new Set())
  }

  const buildPermissionsForCreate = (): string[] => {
    if (inviteSuperuser) return [SUPERUSER_PERMISSION]
    return [...selectedPerms]
  }

  const authHeader: Record<string, string> = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/invites', { headers: authHeader })
      if (!res.ok) { setError('Failed to load invites'); return }
      const data = await res.json() as { invites: InviteCode[] }
      setInvites(data.invites)
    } catch {
      setError('Failed to load invites')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  useEffect(() => {
    if (!isAdmin) { router.replace('/home'); return }
    void fetchInvites()
  }, [isAdmin, router, fetchInvites])

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      const days = parseInt(expiresInDays, 10)
      const body: { expiresInDays?: number; permissions: string[] } = {
        permissions: buildPermissionsForCreate(),
      }
      if (!isNaN(days) && days > 0) body.expiresInDays = days
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null
        setError(errJson?.error ?? 'Failed to create invite')
        return
      }
      await fetchInvites()
    } catch {
      setError('Failed to create invite')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/invites/${id}`, {
        method: 'DELETE',
        headers: authHeader,
      })
      if (!res.ok) { setError('Failed to delete invite'); return }
      setInvites((prev) => prev.filter((i) => i.id !== id))
    } catch {
      setError('Failed to delete invite')
    }
  }

  const handleCopy = (code: string, id: string) => {
    void navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const unused = invites.filter((i) => !i.isUsed && !isExpired(i.expiresAt))
  const used = invites.filter((i) => i.isUsed || isExpired(i.expiresAt))

  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-3xl">

        <p className="section-label">Admin</p>
        <h2 className="mb-10 text-3xl tracking-widest text-foreground">
          Invite Codes<span className="blink-cursor">_</span>
        </h2>

        {/* Create new invite */}
        <div className="glass-card rounded-2xl p-5 mb-8">
          <p className="section-label mb-4">New invite</p>
          <div className="flex flex-col gap-4">
            <div className="flex gap-3 items-end">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="text-xs tracking-wider text-muted-foreground">Expires in (days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder="Never"
                  className="glass-card rounded-xl px-4 py-3 text-sm tracking-wider text-foreground placeholder:text-muted-foreground/40 bg-transparent border-0 outline-none focus:ring-1 focus:ring-white/10 font-mono w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="glass-button glass-button-default rounded-xl px-5 py-3 text-sm tracking-widest flex items-center gap-2 disabled:opacity-50"
                style={{ minHeight: '44px' }}
              >
                {creating ? <Spinner size="xs" /> : <Plus size={15} />}
                Generate
              </button>
            </div>

            <div className="rounded-xl border border-white/10 px-3 py-3 space-y-2">
              <p className="text-xs tracking-widest text-muted-foreground uppercase">Preset permissions</p>
              <p className="text-[11px] text-muted-foreground tracking-wider">
                Applied when someone registers with this code (deny-by-default if none selected).
              </p>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="invite-superuser" className="text-sm tracking-wider">
                      Superuser
                    </Label>
                    <code className="text-[11px] font-mono text-muted-foreground shrink-0" title="RBAC token">
                      {SUPERUSER_PERMISSION}
                    </code>
                  </div>
                  <p className="text-xs text-muted-foreground tracking-wider">Grants every permission</p>
                </div>
                <Switch
                  id="invite-superuser"
                  checked={inviteSuperuser}
                  onCheckedChange={(v) => handleInviteSuperuser(v === true)}
                />
              </div>
              <div className={`space-y-3 pt-1 ${inviteSuperuser ? 'opacity-40 pointer-events-none' : ''}`}>
                <p className="text-xs tracking-widest text-muted-foreground uppercase">Permissions</p>
                {ADMIN_PERMISSION_PICKLIST_ROWS.map(({ perm, label }) => {
                  const permFieldId = `invite-perm-${perm.replace(/[^a-zA-Z0-9_-]/g, '_')}`
                  return (
                    <div key={perm} className="flex items-center justify-between gap-3 min-h-[44px]">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Checkbox
                          id={permFieldId}
                          checked={selectedPerms.has(perm)}
                          onCheckedChange={(c) => toggleInvitePerm(perm, c === true)}
                          disabled={inviteSuperuser}
                        />
                        <Label htmlFor={permFieldId} className="text-sm tracking-wider font-normal cursor-pointer">
                          {label}
                        </Label>
                      </div>
                      <code className="text-[10px] font-mono text-muted-foreground/80 truncate max-w-[140px] shrink-0" title={perm}>
                        {perm}
                      </code>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {error && (
            <p className="mt-3 text-xs tracking-wider" style={{ color: 'oklch(0.7 0.19 22)' }}>{error}</p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="md" clockwise />
          </div>
        ) : (
          <>
            {/* Active invites */}
            <div className="mb-8">
              <p className="section-label mb-4">Active ({unused.length})</p>
              {unused.length === 0 ? (
                <p className="text-xs tracking-wider text-muted-foreground/50 py-4">No active invite codes.</p>
              ) : (
                <div className="glass-card rounded-2xl divide-y divide-white/5 overflow-hidden">
                  {unused.map((invite) => (
                    <div key={invite.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-sm tracking-widest text-foreground">{invite.code}</span>
                        <p
                          className="text-[11px] tracking-wider text-muted-foreground/90 mt-1 truncate"
                          title={invite.permissions}
                        >
                          {permissionsPreview(invite.permissions)}
                        </p>
                      </div>
                      <span className="text-xs tracking-wider text-muted-foreground/60 shrink-0">
                        {invite.expiresAt ? `expires ${formatDate(invite.expiresAt)}` : 'no expiry'}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleCopy(invite.code, invite.id)}
                          className="glass-button glass-button-ghost rounded-lg p-2 text-muted-foreground hover:text-foreground"
                          title="Copy code"
                          style={{ minWidth: '36px', minHeight: '36px' }}
                        >
                          {copiedId === invite.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(invite.id)}
                          className="glass-button glass-button-ghost rounded-lg p-2 text-muted-foreground hover:text-foreground"
                          title="Revoke"
                          style={{ minWidth: '36px', minHeight: '36px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Used / expired invites */}
            {used.length > 0 && (
              <div>
                <p className="section-label mb-4">Used / Expired ({used.length})</p>
                <div className="glass-card rounded-2xl divide-y divide-white/5 overflow-hidden">
                  {used.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-sm tracking-widest text-muted-foreground line-through">
                          {invite.code}
                        </span>
                        {invite.isUsed && invite.usedByUser && (
                          <p className="text-[11px] tracking-wider text-muted-foreground/90 mt-1.5">
                            Used by{' '}
                            <span className="text-foreground/90">{redeemerLabel(invite.usedByUser)}</span>
                            <span className="font-mono text-muted-foreground/70 ml-1" title={invite.usedByUser.id}>
                              ({shortId(invite.usedByUser.id)})
                            </span>
                          </p>
                        )}
                        <p
                          className="text-[11px] tracking-wider text-muted-foreground/80 mt-1 truncate"
                          title={invite.permissions}
                        >
                          Preset: {permissionsPreview(invite.permissions)}
                        </p>
                      </div>
                      <span className="text-xs tracking-wider text-muted-foreground/60 shrink-0 sm:pt-0.5">
                        {invite.isUsed ? `used ${formatDate(invite.usedAt)}` : `expired ${formatDate(invite.expiresAt)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
