import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import type { HonoEnv } from '../../server/lib/types'

vi.mock('server-only', () => ({}))

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000002'

const mockGetSessionById = vi.fn()

vi.mock('@/server/db', () => ({
  db: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
  },
}))

describe('requireAuth middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-purposes'
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-testing'
    process.env.DISCORD_LINK_SECRET = 'test-discord-link-secret-long-enough-for-testing-ok'
    mockGetSessionById.mockReset()
    vi.resetModules()
  })

  async function makeApp() {
    const { requireAuth } = await import('../../server/middleware/auth')
    const app = new Hono<HonoEnv>()
    app.get('/protected', requireAuth, (c) => c.json({ user: c.get('user') }))
    return app
  }

  it('returns 401 when no Authorization header', async () => {
    const app = await makeApp()
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization header has wrong scheme', async () => {
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: 'Basic sometoken' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 with an invalid token', async () => {
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer notavalidtoken' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 with a token signed by wrong secret', async () => {
    process.env.JWT_SECRET = 'different-secret-that-will-cause-verify-failure-ok'
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(TEST_USER_ID, TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-purposes'
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when token sub is not a valid UUID', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    // 'not-a-uuid' will fail the UUID regex check
    const token = await signAccessToken('not-a-uuid', TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when session does not exist in DB', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(TEST_USER_ID, TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue(null)
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when session userId does not match token sub', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(TEST_USER_ID, TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue({
      id: TEST_SESSION_ID,
      userId: '00000000-0000-0000-0000-999999999999', // different user
      expiresAt: new Date(Date.now() + 60_000),
    })
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when session is expired', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(TEST_USER_ID, TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue({
      id: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      expiresAt: new Date(Date.now() - 1000), // expired
    })
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(401)
  })

  it('returns 200 and sets user context with valid token and session', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(TEST_USER_ID, TEST_SESSION_ID, 'home.view', false)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue({
      id: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { user: { id: string; permissions: string; isPwa: boolean } }
    expect(body.user.id).toBe(TEST_USER_ID)
    expect(body.user.permissions).toBe('home.view')
    expect(body.user.isPwa).toBe(false)
  })

  it('passes isPwa=true from token to user context', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(TEST_USER_ID, TEST_SESSION_ID, 'home.view', true)
    vi.resetModules()
    mockGetSessionById.mockResolvedValue({
      id: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { user: { isPwa: boolean } }
    expect(body.user.isPwa).toBe(true)
  })

  it('allows dev-token in development mode with DEV_LOGIN_ENABLED=true', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DEV_LOGIN_ENABLED', 'true')
    vi.resetModules()
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer dev-token' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { user: { id: string; permissions: string } }
    expect(body.user.id).toBe('dev-user-id')
    expect(body.user.permissions).toBe('*')
    vi.unstubAllEnvs()
  })

  it('rejects dev-token when DEV_LOGIN_ENABLED is not set', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.resetModules()
    const app = await makeApp()
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer dev-token' },
    })
    expect(res.status).toBe(401)
    vi.unstubAllEnvs()
  })
})
