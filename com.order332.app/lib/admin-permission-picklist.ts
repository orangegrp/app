import { PERMISSIONS } from '@/lib/permissions'

/** Legacy DB / JWT strings that map to current `PERMISSIONS` keys. */
export const LEGACY_PERMISSION_ALIASES: Record<string, string> = {
  'home.view': PERMISSIONS.APP_HOME,
}

/** Ordered rows for admin pickers (every canonical permission). */
export const ADMIN_PERMISSION_PICKLIST_ROWS: { perm: string; label: string }[] = [
  { perm: PERMISSIONS.APP_BLOG, label: 'Blog Admin' },
  { perm: PERMISSIONS.APP_BLOG_AI, label: 'Blog: AI assist' },
  { perm: PERMISSIONS.APP_CONTENT, label: 'Content Hub' },
  { perm: PERMISSIONS.APP_HOME, label: 'App home (legacy)' },
  { perm: PERMISSIONS.APP_LABS, label: '332 Labs' },
  { perm: PERMISSIONS.APP_MUSIC, label: 'Music' },
  { perm: PERMISSIONS.APP_ROOM, label: 'Virtual Room' },
  { perm: PERMISSIONS.APP_WEBPC, label: 'Web PC' },
  { perm: PERMISSIONS.ADMIN_INVITES_MANAGE, label: 'Admin: invite codes' },
  { perm: PERMISSIONS.ADMIN_SYSTEM_CLEANUP, label: 'Admin: system cleanup' },
  { perm: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE, label: 'Admin: manage user permissions' },
]

export const ADMIN_PICKLIST_PERM_KEYS = new Set(
  ADMIN_PERMISSION_PICKLIST_ROWS.map((r) => r.perm),
)
