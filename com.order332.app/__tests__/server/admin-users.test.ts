import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { User } from '@/server/lib/types'
import { PERMISSIONS, SUPERUSER_PERMISSION } from '@/lib/permissions'

vi.mock('server-only', () => ({}))

const ADMIN_ID     = '00000000-0000-0000-0000-000000000001'
const ADMIN_2_ID   = '00000000-0000-0000-0000-000000000002'
const SU_ID        = '00000000-0000-0000-0000-000000000003'
const SELF_ID      = '00000000-0000-0000-0000-000000000010'
const SESSION_ID   = '00000000-0000-0000-0000-000000000099'

const mockGetSessionById       = vi.fn()
const mockGetUserById          = vi.fn()
const mockUpdateUser           = vi.fn()
const mockDeleteUser           = vi.fn()
const mockDeleteUserSessions   = vi.fn()
const mockListUserIdAndPerms   = vi.fn()

vi.mock('@/server/db', () => ({
  db: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
    updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
    deleteUserSessions: (...args: unknown[]) => mockDeleteUserSessions(...args),
    listUserIdAndPermissions: (...args: unknown[]) => mockListUserIdAndPerms(...args),
  },
}))

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 'target-user',
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: PERMISSIONS.APP_LABS,
    isActive: true,
    loginPasskeyEnabled: true,
    loginDiscordEnabled: true,
    loginMagicEnabled: true,
    loginQrEnabled: true,
    ...overrides,
  }
}

describe('admin users routes', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-purposes'
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-testing'
    process.env.DISCORD_LINK_SECRET = 'test-discord-link-secret-long-enough-for-testing-ok'
    mockGetSessionById.mockReset()
    vi.clearAllMocks()
    vi.resetModules()
  })

  function validSession(userId: string) {
    return { id: SESSION_ID, userId, expiresAt: new Date(Date.now() + 60_000) }
  }

  async function adminToken(sub: string): Promise<string> {
    const { signAccessToken } = await import('../../server/lib/jwt')
    return signAccessToken(sub, SESSION_ID, PERMISSIONS.ADMIN_PERMISSIONS_MANAGE, false)
  }

  async function superuserToken(sub: string): Promise<string> {
    const { signAccessToken } = await import('../../server/lib/jwt')
    return signAccessToken(sub, SESSION_ID, SUPERUSER_PERMISSION, false)
  }

  it('GET returns 403 without admin.permissions.manage', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(ADMIN_ID, SESSION_ID, PERMISSIONS.ADMIN_INVITES_MANAGE, false)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
  })

  it('PATCH returns 403 when changing own permissions', async () => {
    const token = await adminToken(SELF_ID)
    mockGetSessionById.mockResolvedValue(validSession(SELF_ID))
    // RBAC re-fetch for admin.permissions.manage check
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: SELF_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch of target user
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: SELF_ID, permissions: PERMISSIONS.ADMIN_INVITES_MANAGE }),
    )
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request(`/${SELF_ID}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ permissions: [PERMISSIONS.APP_LABS] }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('own permissions')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('PATCH returns 403 when non-superuser changes a superuser target permissions', async () => {
    const token = await adminToken(ADMIN_ID)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: ADMIN_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: 'su', permissions: SUPERUSER_PERMISSION }),
    )
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/su', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ permissions: [PERMISSIONS.APP_LABS] }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('superuser')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('PATCH allows superuser caller to change another superuser permissions', async () => {
    const token = await superuserToken(SU_ID)
    mockGetSessionById.mockResolvedValue(validSession(SU_ID))
    const newCsv = `${PERMISSIONS.ADMIN_PERMISSIONS_MANAGE},${PERMISSIONS.APP_LABS}`
    const updated = baseUser({ id: 'other-su', permissions: newCsv })
    // RBAC re-fetch for * permission check
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: SU_ID, permissions: SUPERUSER_PERMISSION }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: 'other-su', permissions: SUPERUSER_PERMISSION }),
    )
    mockUpdateUser.mockResolvedValueOnce(updated)
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/other-su', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        permissions: [PERMISSIONS.ADMIN_PERMISSIONS_MANAGE, PERMISSIONS.APP_LABS],
      }),
    })
    expect(res.status).toBe(200)
    expect(mockUpdateUser).toHaveBeenCalledWith('other-su', { permissions: newCsv })
  })

  it('PATCH returns 403 when demoting another admin', async () => {
    const token = await adminToken(ADMIN_ID)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: ADMIN_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: 'other-admin', permissions: PERMISSIONS.ADMIN_INVITES_MANAGE }),
    )
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/other-admin', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ permissions: [PERMISSIONS.APP_LABS] }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('another administrator')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('PATCH allows updating another admin who remains admin', async () => {
    const token = await adminToken(ADMIN_ID)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    const updated = baseUser({ id: 'other-admin', permissions: PERMISSIONS.ADMIN_SYSTEM_CLEANUP })
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: ADMIN_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: 'other-admin', permissions: PERMISSIONS.ADMIN_INVITES_MANAGE }),
    )
    mockUpdateUser.mockResolvedValueOnce(updated)
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/other-admin', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ permissions: [PERMISSIONS.ADMIN_SYSTEM_CLEANUP] }),
    })
    expect(res.status).toBe(200)
    expect(mockUpdateUser).toHaveBeenCalled()
  })

  it('PATCH returns 403 when freezing own account', async () => {
    const token = await adminToken(SELF_ID)
    mockGetSessionById.mockResolvedValue(validSession(SELF_ID))
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: SELF_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: SELF_ID }))
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request(`/${SELF_ID}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive: false }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('own account')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('PATCH freezes user, updates DB, and revokes sessions', async () => {
    const token = await adminToken(ADMIN_ID)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    const frozen = baseUser({ id: 'victim', permissions: PERMISSIONS.APP_LABS, isActive: false })
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: ADMIN_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: 'victim' }))
    mockUpdateUser.mockResolvedValueOnce(frozen)
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/victim', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive: false }),
    })
    expect(res.status).toBe(200)
    expect(mockUpdateUser).toHaveBeenCalledWith('victim', { isActive: false })
    expect(mockDeleteUserSessions).toHaveBeenCalledWith('victim')
  })

  it('PATCH returns 403 when disabling login for the only admin', async () => {
    const token = await adminToken(ADMIN_ID)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: ADMIN_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: 'sole-admin', permissions: PERMISSIONS.ADMIN_INVITES_MANAGE }),
    )
    mockListUserIdAndPerms.mockResolvedValueOnce([
      { id: 'sole-admin', permissions: PERMISSIONS.ADMIN_INVITES_MANAGE },
    ])
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/sole-admin', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive: false }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('last admin')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('DELETE returns 403 for self', async () => {
    const token = await adminToken(SELF_ID)
    mockGetSessionById.mockResolvedValue(validSession(SELF_ID))
    // RBAC re-fetch (admin permission DB check)
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: SELF_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request(`/${SELF_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('DELETE returns 403 when target is the last admin', async () => {
    const token = await adminToken(ADMIN_ID)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: ADMIN_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: 'sole-admin', permissions: PERMISSIONS.ADMIN_SYSTEM_CLEANUP }),
    )
    mockListUserIdAndPerms.mockResolvedValueOnce([
      { id: 'sole-admin', permissions: PERMISSIONS.ADMIN_SYSTEM_CLEANUP },
    ])
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/sole-admin', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('last admin')
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('DELETE removes a non-admin user', async () => {
    const token = await adminToken(ADMIN_ID)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: ADMIN_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: 'member', permissions: PERMISSIONS.APP_LABS }),
    )
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/member', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    expect(mockDeleteUser).toHaveBeenCalledWith('member')
  })

  it('DELETE removes an admin when another admin exists', async () => {
    const token = await adminToken(ADMIN_ID)
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_ID))
    // RBAC re-fetch
    mockGetUserById.mockResolvedValueOnce(baseUser({ id: ADMIN_ID, permissions: PERMISSIONS.ADMIN_PERMISSIONS_MANAGE }))
    // Route handler fetch
    mockGetUserById.mockResolvedValueOnce(
      baseUser({ id: 'admin-a', permissions: PERMISSIONS.ADMIN_INVITES_MANAGE }),
    )
    mockListUserIdAndPerms.mockResolvedValueOnce([
      { id: 'admin-a', permissions: PERMISSIONS.ADMIN_INVITES_MANAGE },
      { id: ADMIN_2_ID, permissions: PERMISSIONS.ADMIN_INVITES_MANAGE },
    ])
    const { adminUserRoutes } = await import('../../server/routes/admin/users')
    const res = await adminUserRoutes.request('/admin-a', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    expect(mockDeleteUser).toHaveBeenCalledWith('admin-a')
  })
})
