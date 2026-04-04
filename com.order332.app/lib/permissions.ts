/** Canonical permission strings (JWT + DB CSV). `*` alone grants all checks. */
export const PERMISSIONS = {
  /** @deprecated Legacy DB value; not granted on signup. Does not imply mini-app access. */
  APP_HOME: 'app.home',
  APP_BLOG: 'app.blog',
  /** AI-assisted editing in the blog CMS (proofread, rephrase, etc.). Requires `app.blog`. */
  APP_BLOG_AI: 'app.blog.ai',
  APP_CONTENT: 'app.content',
  /** Upload content to the Content Library (images, audio, PDFs, downloads). Requires app.content. */
  APP_CONTENT_UPLOAD: 'app.content.upload',
  APP_MUSIC: 'app.music',
  /** Upload tracks to the Music mini-app. Requires app.music. */
  APP_MUSIC_UPLOAD: 'app.music.upload',
  APP_ROOM: 'app.room',
  APP_LABS: 'app.labs',
  APP_WEBPC: 'app.webpc',
  ADMIN_INVITES_MANAGE: 'admin.invites.manage',
  ADMIN_SYSTEM_CLEANUP: 'admin.system.cleanup',
  /** Assign app and admin permissions to users (user list + edit). */
  ADMIN_PERMISSIONS_MANAGE: 'admin.permissions.manage',
  /** Hard-delete blog posts from GitHub (superuser-only in practice; constant kept for UI display). */
  ADMIN_BLOG_MANAGE: 'admin.blog.manage',
} as const

/** All mini-app route permissions (for deny-by-default checks). */
export const MINI_APP_PERMISSIONS: string[] = [
  PERMISSIONS.APP_BLOG,
  PERMISSIONS.APP_CONTENT,
  PERMISSIONS.APP_MUSIC,
  PERMISSIONS.APP_ROOM,
  PERMISSIONS.APP_LABS,
  PERMISSIONS.APP_WEBPC,
]

export type PermissionId = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** Superuser token — stored alone when selected; grants every permission check. */
export const SUPERUSER_PERMISSION = '*' as const

/** True when stored CSV is exactly superuser (trimmed, single `*` token). */
export function isSuperuserPermissionsCsv(csv: string): boolean {
  const tokens = csv
    .trim()
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  return tokens.length === 1 && tokens[0] === SUPERUSER_PERMISSION
}

/** Every canonical `PERMISSIONS.*` string (for admin UI + server allowlist). */
export const ALL_KNOWN_PERMISSION_STRINGS: readonly string[] = Object.values(
  PERMISSIONS,
) as unknown as string[]

const ASSIGNABLE_TOKENS = new Set<string>([...ALL_KNOWN_PERMISSION_STRINGS, SUPERUSER_PERMISSION])

export function isAssignablePermissionToken(token: string): boolean {
  return ASSIGNABLE_TOKENS.has(token.trim())
}

/**
 * Validates permission tokens against known strings + `*`, normalizes to CSV.
 * If `*` is present, result is exactly `*`.
 */
export function parseAndValidatePermissionsInput(
  input: string[],
): { ok: true; csv: string } | { ok: false; error: string } {
  const trimmed = input.map((s) => s.trim()).filter((s) => s.length > 0)
  for (const p of trimmed) {
    if (!ASSIGNABLE_TOKENS.has(p)) {
      return { ok: false, error: 'Invalid permission' }
    }
  }
  if (trimmed.includes(SUPERUSER_PERMISSION)) {
    return { ok: true, csv: SUPERUSER_PERMISSION }
  }
  const unique = [...new Set(trimmed)].sort((a, b) => a.localeCompare(b))
  return { ok: true, csv: unique.join(',') }
}

/**
 * Prevents removing your own last admin capability when editing your own user.
 * @deprecated Prefer blocking all self permission edits via admin API; kept for callers that still use it.
 */
export function assertSelfAdminAccessMaintained(
  targetUserId: string,
  callerUserId: string,
  newCsv: string,
): { ok: true } | { ok: false; error: string } {
  if (targetUserId !== callerUserId) return { ok: true }
  if (!isAdminish(newCsv)) {
    return { ok: false, error: 'You cannot remove your own admin access' }
  }
  return { ok: true }
}

/**
 * Prevents stripping admin/superuser from another user who currently has admin access.
 */
export function assertCannotDemoteOtherAdmin(
  targetUserId: string,
  callerUserId: string,
  previousCsv: string,
  newCsv: string,
): { ok: true } | { ok: false; error: string } {
  if (targetUserId === callerUserId) return { ok: true }
  if (!isAdminish(previousCsv)) return { ok: true }
  if (isAdminish(newCsv)) return { ok: true }
  return { ok: false, error: 'Cannot remove admin access from another administrator' }
}

export function hasPermission(userPermissions: string, required: string): boolean {
  if (userPermissions === '*') return true
  return userPermissions.split(',').map((p) => p.trim()).includes(required)
}

export function hasAnyPermission(userPermissions: string, required: string[]): boolean {
  return required.some((perm) => hasPermission(userPermissions, perm))
}

/** True if user has any `admin.*` permission or superuser `*`. */
export function isAdminish(userPermissions: string): boolean {
  if (userPermissions === '*') return true
  return userPermissions
    .split(',')
    .map((p) => p.trim())
    .some((p) => p.startsWith('admin.'))
}
