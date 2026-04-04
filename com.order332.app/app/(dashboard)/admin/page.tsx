'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart2, KeyRound, Shield, Sparkles } from 'lucide-react'
import { PageBackground } from '@/components/layout/PageBackground'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { usePermission, useAnyPermission } from '@/hooks/usePermission'
import { PERMISSIONS } from '@/lib/permissions'
import { apiPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

export default function AdminHubPage() {
  const router = useRouter()
  const canAccess = useAnyPermission([
    PERMISSIONS.ADMIN_INVITES_MANAGE,
    PERMISSIONS.ADMIN_SYSTEM_CLEANUP,
    PERMISSIONS.ADMIN_PERMISSIONS_MANAGE,
  ])
  const canInvites = usePermission(PERMISSIONS.ADMIN_INVITES_MANAGE)
  const canCleanup = usePermission(PERMISSIONS.ADMIN_SYSTEM_CLEANUP)
  const canManagePermissions = usePermission(PERMISSIONS.ADMIN_PERMISSIONS_MANAGE)

  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!canAccess) router.replace('/home')
  }, [canAccess, router])

  const runCleanup = async () => {
    setCleanupLoading(true)
    setCleanupMsg(null)
    try {
      await apiPost<{ ok?: boolean }>('/auth/cleanup', {})
      setCleanupMsg('Cleanup completed.')
      setCleanupOpen(false)
    } catch {
      setCleanupMsg('Cleanup failed. You may lack permission.')
      setCleanupOpen(false)
    } finally {
      setCleanupLoading(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="page-root relative min-h-screen flex items-center justify-center">
        <PageBackground />
        <Spinner size="md" />
      </div>
    )
  }

  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-2xl">
        <Link
          href="/home"
          className="inline-flex items-center gap-2 text-xs tracking-wider text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Back to home
        </Link>

        <p className="section-label">Administration</p>
        <h2 className="mb-10 text-3xl tracking-widest text-foreground">
          Admin<span className="blink-cursor">_</span>
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {canManagePermissions && (
            <Link
              href="/admin/permissions"
              className="glass-card rounded-2xl p-6 hover:-translate-y-0.5 transition-transform"
              style={{ background: 'oklch(1 0 0 / 5%)' }}
            >
              <Shield className="mb-3 text-muted-foreground" size={22} strokeWidth={1.5} />
              <p className="text-sm tracking-widest text-foreground mb-1">User permissions</p>
              <p className="text-xs text-muted-foreground tracking-wider">
                Assign app and admin permissions to members
              </p>
            </Link>
          )}

          {canManagePermissions && (
            <Link
              href="/admin/ai-usage"
              className="glass-card rounded-2xl p-6 hover:-translate-y-0.5 transition-transform"
              style={{ background: 'oklch(1 0 0 / 5%)' }}
            >
              <BarChart2 className="mb-3 text-muted-foreground" size={22} strokeWidth={1.5} />
              <p className="text-sm tracking-widest text-foreground mb-1">AI usage</p>
              <p className="text-xs text-muted-foreground tracking-wider">
                Monitor blog AI assist requests by user and action
              </p>
            </Link>
          )}

          {canInvites && (
            <Link
              href="/admin/invites"
              className="glass-card rounded-2xl p-6 hover:-translate-y-0.5 transition-transform"
              style={{ background: 'oklch(1 0 0 / 5%)' }}
            >
              <KeyRound className="mb-3 text-muted-foreground" size={22} strokeWidth={1.5} />
              <p className="text-sm tracking-widest text-foreground mb-1">Invite codes</p>
              <p className="text-xs text-muted-foreground tracking-wider">
                Create and revoke registration invites
              </p>
            </Link>
          )}

          {canCleanup && (
            <button
              type="button"
              onClick={() => setCleanupOpen(true)}
              className="glass-card rounded-2xl p-6 text-left hover:-translate-y-0.5 transition-transform"
              style={{ background: 'oklch(1 0 0 / 5%)' }}
            >
              <Sparkles className="mb-3 text-muted-foreground" size={22} strokeWidth={1.5} />
              <p className="text-sm tracking-widest text-foreground mb-1">System cleanup</p>
              <p className="text-xs text-muted-foreground tracking-wider">
                Remove expired sessions, challenges, and tokens
              </p>
            </button>
          )}
        </div>

        {cleanupMsg && (
          <p className="mt-6 text-xs tracking-wider text-muted-foreground">{cleanupMsg}</p>
        )}
      </div>

      <AlertDialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run database cleanup?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes expired magic tokens, WebAuthn challenges, pending registrations, and old sessions. Safe to run periodically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleanupLoading}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={cleanupLoading}
              onClick={() => void runCleanup()}
            >
              {cleanupLoading ? <Spinner size="xs" /> : 'Run cleanup'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
