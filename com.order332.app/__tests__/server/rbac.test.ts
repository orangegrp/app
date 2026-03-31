import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import type { HonoEnv } from '../../server/lib/types'

vi.mock('server-only', () => ({}))

const ADMIN_USER_ID  = '00000000-0000-0000-0000-000000000010'
const MEMBER_USER_ID = '00000000-0000-0000-0000-000000000011'
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000002'

const mockGetSessionById = vi.fn()
const mockGetUserById = vi.fn()

vi.mock('@/server/db', () => ({
  db: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
  },
}))

function validSession(userId: string) {
  return { id: TEST_SESSION_ID, userId, expiresAt: new Date(Date.now() + 60_000) }
}

describe('requirePermission middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-purposes'
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-testing'
    process.env.DISCORD_LINK_SECRET = 'test-discord-link-secret-long-enough-for-testing-ok'
    mockGetSessionById.mockReset()
    mockGetUserById.mockReset()
    vi.resetModules()
  })

  async function makeApp() {
    const { requireAuth } = await import('../../server/middleware/auth')
    const { requirePermission } = await import('../../server/middleware/rbac')
    const app = new Hono<HonoEnv>()
    app.get('/admin', requireAuth, requirePermission('admin.users.manage'), (c) => c.json({ ok: true }))
    app.get('/home', requireAuth, requirePermission('home.view'), (c) => c.json({ ok: true }))
    app.get('/any', requireAuth, requirePermission('app.labs'), (c) => c.json({ ok: true }))
    return app
  }

  it('allows access when user has the required permission', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(ADMIN_USER_ID, TEST_SESSION_ID, 'home.view,admin.users.manage,admin.settings', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_USER_ID))
    mockGetUserById.mockResolvedValue({ id: ADMIN_USER_ID, permissions: 'home.view,admin.users.manage,admin.settings' })
    const app = await makeApp()
    const res = await app.request('/admin', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
  })

  it('returns 403 when user lacks the required permission', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(MEMBER_USER_ID, TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue(validSession(MEMBER_USER_ID))
    mockGetUserById.mockResolvedValue({ id: MEMBER_USER_ID, permissions: 'home.view' })
    const app = await makeApp()
    const res = await app.request('/admin', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Forbidden')
  })

  it('allows member to access home.view route', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(MEMBER_USER_ID, TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue(validSession(MEMBER_USER_ID))
    const app = await makeApp()
    const res = await app.request('/home', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
  })

  it('allows wildcard (*) to access any route', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(ADMIN_USER_ID, TEST_SESSION_ID, '*', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue(validSession(ADMIN_USER_ID))
    mockGetUserById.mockResolvedValue({ id: ADMIN_USER_ID, permissions: '*' })
    const app = await makeApp()
    const [r1, r2, r3] = await Promise.all([
      app.request('/admin', { headers: { Authorization: `Bearer ${token}` } }),
      app.request('/home', { headers: { Authorization: `Bearer ${token}` } }),
      app.request('/any', { headers: { Authorization: `Bearer ${token}` } }),
    ])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(r3.status).toBe(200)
  })

  it('returns 401 when no token provided', async () => {
    vi.resetModules()
    const app = await makeApp()
    const res = await app.request('/admin')
    expect(res.status).toBe(401)
  })

  it('does not allow substring/prefix match (home.view does not grant home)', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(MEMBER_USER_ID, TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue(validSession(MEMBER_USER_ID))
    mockGetUserById.mockResolvedValue({ id: MEMBER_USER_ID, permissions: 'home.view' })
    const app = await makeApp()
    const res = await app.request('/admin', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(403)
  })

  it('handles CSV permissions with spaces correctly', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(MEMBER_USER_ID, TEST_SESSION_ID, 'home.view, app.labs, admin.settings', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue(validSession(MEMBER_USER_ID))
    const app = await makeApp()
    const res = await app.request('/any', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
  })
})

describe('hasPermission helper', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns true for wildcard', async () => {
    vi.mock('server-only', () => ({}))
    const { hasPermission } = await import('../../server/lib/constants')
    expect(hasPermission('*', 'anything.at.all')).toBe(true)
  })

  it('returns true for exact CSV match', async () => {
    const { hasPermission } = await import('../../server/lib/constants')
    expect(hasPermission('home.view,app.labs', 'app.labs')).toBe(true)
  })

  it('returns false for missing permission', async () => {
    const { hasPermission } = await import('../../server/lib/constants')
    expect(hasPermission('home.view', 'admin.settings')).toBe(false)
  })

  it('returns false for empty permissions string', async () => {
    const { hasPermission } = await import('../../server/lib/constants')
    expect(hasPermission('', 'home.view')).toBe(false)
  })
})
