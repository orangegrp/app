import type { LucideIcon } from 'lucide-react'
import {
  House,
  Newspaper,
  Library,
  Music2,
  Tv,
  FlaskConical,
  Terminal,
} from 'lucide-react'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'

export type DashboardNavItem = {
  href: string
  icon: LucideIcon
  label: string
  soon: boolean
  hardNav: boolean
  /** Home app cards only */
  desc: string
  /** `null` = shell entry (/home) only; mini-apps require explicit permission. */
  permission: string | null
}

/** Sidebar + home Apps. Settings / Admin are profile-only. */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { href: '/home', icon: House, label: 'Home', soon: false, hardNav: false, desc: 'Dashboard', permission: null },
  {
    href: '/blog',
    icon: Newspaper,
    label: 'Blog Admin',
    soon: false,
    hardNav: false,
    desc: 'Posts and publishing',
    permission: PERMISSIONS.APP_BLOG,
  },
  {
    href: '/content',
    icon: Library,
    label: 'Library',
    soon: true,
    hardNav: false,
    desc: 'Media and assets',
    permission: PERMISSIONS.APP_CONTENT,
  },
  {
    href: '/music',
    icon: Music2,
    label: 'Music',
    soon: false,
    hardNav: false,
    desc: 'Playlists and audio',
    permission: PERMISSIONS.APP_MUSIC,
  },
  {
    href: '/room',
    icon: Tv,
    label: 'Virtual Room',
    soon: true,
    hardNav: false,
    desc: 'Shared presence',
    permission: PERMISSIONS.APP_ROOM,
  },
  {
    href: '/labs',
    icon: FlaskConical,
    label: '332 Labs',
    soon: true,
    hardNav: false,
    desc: 'Experiments and courses',
    permission: PERMISSIONS.APP_LABS,
  },
  {
    href: '/webpc',
    icon: Terminal,
    label: 'Web PC',
    soon: false,
    // hardNav: never use Next Link to /webpc/:id/console — full document load is required for COEP/COOP.
    hardNav: true,
    desc: 'Virtual Linux in the browser',
    permission: PERMISSIONS.APP_WEBPC,
  },
]

export const HOME_APP_ITEMS = DASHBOARD_NAV_ITEMS.filter((i) => i.href !== '/home')

/** Home Apps grid: only routes that are not marked coming soon */
export const HOME_AVAILABLE_APP_ITEMS = HOME_APP_ITEMS.filter((i) => !i.soon)

/** Nav items the user may see (deny-by-default for mini-apps). */
export function filterNavItemsForUser(userPermissions: string, items: DashboardNavItem[]): DashboardNavItem[] {
  return items.filter((item) => {
    if (item.permission === null) return true
    return hasPermission(userPermissions, item.permission)
  })
}
