'use client'
import Link from 'next/link'
import { ChevronRight, Settings, Shield } from 'lucide-react'
import { PageBackground } from '@/components/layout/PageBackground'
import { UserAvatar } from '@/components/user/UserAvatar'
import { useAuth } from '@/hooks/useAuth'
import { useAnyPermission } from '@/hooks/usePermission'
import { HOME_AVAILABLE_APP_ITEMS, filterNavItemsForUser } from '@/lib/dashboard-nav'
import { PERMISSIONS } from '@/lib/permissions'
import { userDisplayName } from '@/lib/user-display'

const ACCOUNT_LINKS = [
  { icon: Settings, label: 'Settings', desc: 'App preferences and version', href: '/settings' as const },
]

export default function HomePage() {
  const { user } = useAuth()
  const displayName = user ? userDisplayName(user) : 'there'
  const showAdmin = useAnyPermission([
    PERMISSIONS.ADMIN_INVITES_MANAGE,
    PERMISSIONS.ADMIN_SYSTEM_CLEANUP,
    PERMISSIONS.ADMIN_PERMISSIONS_MANAGE,
  ])
  const visibleApps = filterNavItemsForUser(user?.permissions ?? '', HOME_AVAILABLE_APP_ITEMS)

  return (
    <div className="page-root relative min-h-screen px-6 pb-32 pt-8 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">

        {/* Greeting */}
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          {user ? <UserAvatar user={user} size={80} className="ring-2 ring-white/10" /> : null}
          <div className="min-w-0">
            <p className="section-label">Home</p>
            <h2 className="text-4xl tracking-widest text-foreground">
              Hey, {displayName}<span className="blink-cursor">_</span>
            </h2>
          </div>
        </div>

        {/* Apps — permitted mini-apps only */}
        <div className="mb-10">
          <p className="section-label mb-4">Apps</p>
          {visibleApps.length === 0 ? (
            <p className="text-sm tracking-wider text-muted-foreground">
              No apps assigned yet. You can still use Account below.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 stagger-children">
            {visibleApps.map(({ href, icon: Icon, label, desc, hardNav }) => {
              const cardClass =
                'glass-card rounded-2xl p-4 flex flex-col gap-3 hover:-translate-y-0.5 transition-transform'
              const inner = (
                <>
                  <Icon size={22} strokeWidth={1.5} className="text-muted-foreground" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm tracking-wider text-foreground">{label}</span>
                    <span className="text-[11px] tracking-wider text-muted-foreground/70">{desc}</span>
                  </div>
                </>
              )
              if (hardNav) {
                return (
                  <a key={href} href={href} className={cardClass}>
                    {inner}
                  </a>
                )
              }
              return (
                <Link key={href} href={href} className={cardClass}>
                  {inner}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Account */}
        <div>
          <p className="section-label mb-4">Account</p>
          <div className="glass-card rounded-2xl divide-y divide-white/5 overflow-hidden">
            {ACCOUNT_LINKS.map(({ icon: Icon, label, desc, href }) => (
              <Link
                key={label}
                href={href}
                className="flex w-full items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors text-left"
                style={{ minHeight: '56px' }}
              >
                <Icon size={18} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-sm tracking-wider text-foreground">{label}</span>
                  <span className="text-[11px] tracking-wider text-muted-foreground/60 truncate">{desc}</span>
                </div>
                <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground/40 shrink-0" />
              </Link>
            ))}
            {showAdmin && (
              <Link
                href="/admin"
                className="flex w-full items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors text-left"
                style={{ minHeight: '56px' }}
              >
                <Shield size={18} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-sm tracking-wider text-foreground">Admin</span>
                  <span className="text-[11px] tracking-wider text-muted-foreground/60 truncate">
                    Invites and system tools
                  </span>
                </div>
                <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground/40 shrink-0" />
              </Link>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
