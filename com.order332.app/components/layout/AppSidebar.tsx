'use client'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LogOut, ChevronUp, PanelLeftClose, PanelLeftOpen, Settings, Shield } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAnyPermission } from '@/hooks/usePermission'
import { userDisplayName } from '@/lib/user-display'
import { DASHBOARD_NAV_ITEMS, filterNavItemsForUser } from '@/lib/dashboard-nav'
import { isAdminish, PERMISSIONS } from '@/lib/permissions'
import { UserAvatar } from '@/components/user/UserAvatar'

// Publish collapsed state so the layout can adjust content offset
export const SIDEBAR_EXPANDED_WIDTH = 'w-56'  // 224px
export const SIDEBAR_COLLAPSED_WIDTH = 'w-[60px]'

interface AppSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

type NavItem = {
  href: string
  icon: LucideIcon
  label: string
  soon: boolean
  hardNav: boolean
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [popoverBottom, setPopoverBottom] = useState(0)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const showAdmin = useAnyPermission([
    PERMISSIONS.ADMIN_INVITES_MANAGE,
    PERMISSIONS.ADMIN_SYSTEM_CLEANUP,
    PERMISSIONS.ADMIN_PERMISSIONS_MANAGE,
  ])

  const navItems: NavItem[] = useMemo(() => {
    const csv = user?.permissions ?? ''
    return filterNavItemsForUser(csv, DASHBOARD_NAV_ITEMS).map(({ href, icon, label, soon, hardNav }) => ({
      href,
      icon,
      label,
      soon,
      hardNav,
    }))
  }, [user?.permissions])

  const displayName = user ? userDisplayName(user) : ''
  const role = user && isAdminish(user.permissions) ? 'Admin' : 'Member'

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return
      setPopoverOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverOpen])

  // Close popover when collapsing
  useEffect(() => {
    if (collapsed) setTimeout(() => setPopoverOpen(false), 0)
  }, [collapsed])

  return (
    <aside
      style={{ top: 'var(--instatus-banner-height, 0px)' }}
      className={[
        'hidden sm:flex fixed bottom-0 left-0 z-50 flex-col border-r border-white/5',
        'bg-[oklch(0.08_0_0_/_80%)] backdrop-blur-xl transition-[width] duration-200 ease-in-out',
        collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      ].join(' ')}
    >
      {/* Brand + collapse toggle */}
      <div className="flex h-16 shrink-0 items-center border-b border-white/5 px-3 justify-between">
        <div className={['flex items-center', collapsed ? 'justify-center w-full' : 'pl-1'].join(' ')}>
          <Image
            src="/icons/polygon.svg"
            alt="332"
            width={28}
            height={28}
            className="select-none shrink-0"
            priority
          />
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors shrink-0"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={15} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 flex flex-col gap-0.5">
        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={onToggle}
            className="flex items-center justify-center rounded-xl p-2.5 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors mb-1"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={17} strokeWidth={1.5} />
          </button>
        )}

        {navItems.map(({ href, icon: Icon, label, soon, hardNav }) => {
          const active =
            pathname === href ||
            (href !== '/home' && pathname.startsWith(href))
          const itemClass = [
            'flex items-center rounded-xl transition-colors',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
            active
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
          ].join(' ')
          const inner = (
            <>
              <Icon size={17} strokeWidth={1.5} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-sm tracking-wider whitespace-nowrap">{label}</span>
                  {soon && (
                    <span
                      className="text-[9px] tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: 'oklch(1 0 0 / 8%)', color: 'oklch(1 0 0 / 35%)' }}
                    >
                      Coming Soon
                    </span>
                  )}
                </>
              )}
            </>
          )
          // Hard-nav items use <a> for a full document load (Web PC hub; VM console
          // uses COEP/COOP only on /webpc/:id/console — opened via location.assign from hub).
          if (hardNav && !soon) {
            return (
              <a key={href} href={href} title={collapsed ? label : undefined} className={itemClass}>
                {inner}
              </a>
            )
          }
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={itemClass}
            >
              {inner}
            </Link>
          )
        })}
      </nav>

      {/* Profile trigger */}
      <div className="relative border-t border-white/5 p-2">
        {/* Popover — fixed so it escapes the sidebar's backdrop-filter stacking context */}
        {popoverOpen && (
          <div
            ref={popoverRef}
            className="glass-card rounded-2xl overflow-hidden"
            style={{
              position: 'fixed',
              bottom: `${popoverBottom}px`,
              left: '8px',
              width: '220px',
              boxShadow: '0 8px 40px oklch(0 0 0 / 50%)',
              zIndex: 200,
            }}
          >
            <div className="px-4 py-4 border-b border-white/5 flex items-center gap-3">
              {user ? (
                <UserAvatar user={user} size={36} className="ring-1 ring-white/10" />
              ) : (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                  style={{ background: 'oklch(1 0 0 / 12%)', color: 'oklch(1 0 0 / 80%)' }}
                >
                  ?
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm tracking-wider text-foreground truncate">{displayName}</span>
                <span className="text-[10px] tracking-widest" style={{ color: 'oklch(1 0 0 / 35%)' }}>
                  {role}
                </span>
              </div>
            </div>
            <div className="p-1.5 flex flex-col gap-0.5">
              <Link
                href="/settings"
                onClick={() => setPopoverOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm tracking-wider text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
              >
                <Settings size={15} strokeWidth={1.5} className="shrink-0" />
                <span>Settings</span>
              </Link>
              {showAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setPopoverOpen(false)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm tracking-wider text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                >
                  <Shield size={15} strokeWidth={1.5} className="shrink-0" />
                  <span>Admin</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => { setPopoverOpen(false); logout() }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm tracking-wider text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
              >
                <LogOut size={15} strokeWidth={1.5} className="shrink-0" />
                <span>Log out</span>
              </button>
            </div>
          </div>
        )}

        {/* Trigger */}
        <button
          ref={triggerRef}
          onClick={() => {
            if (triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect()
              setPopoverBottom(window.innerHeight - rect.top + 8)
            }
            setPopoverOpen((v) => !v)
          }}
          title={displayName || undefined}
          className={[
            'flex w-full items-center rounded-xl transition-colors',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
            popoverOpen
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
          ].join(' ')}
        >
          {user ? (
            <UserAvatar user={user} size={28} className="ring-1 ring-white/10" />
          ) : (
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
              style={{ background: 'oklch(1 0 0 / 12%)', color: 'oklch(1 0 0 / 70%)' }}
            >
              ?
            </div>
          )}
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left text-sm tracking-wider">{displayName}</span>
              <ChevronUp
                size={14}
                strokeWidth={1.5}
                className={['shrink-0 transition-transform duration-200', popoverOpen ? 'rotate-180' : ''].join(' ')}
              />
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
