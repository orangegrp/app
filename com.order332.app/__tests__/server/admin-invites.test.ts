import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PERMISSIONS } from '@/lib/permissions'

vi.mock('server-only', () => ({}))

const ADMIN_ID   = '00000000-0000-0000-0000-000000000001'
const SESSION_ID = '00000000-0000-0000-0000-000000000099'

const mockGetSessionById  = vi.fn()
const mockListInviteCodes = vi.fn()
const mockGetUsersByIds   = vi.fn()
const mockCreateInviteCode = vi.fn()

vi.mock('@/server/db', () => ({
  db: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    listInviteCodes: (...args: unknown[]) => mockListInviteCodes(...args),
    getUsersByIds: (...args: unknown[]) => mockGetUsersByIds(...args),
    createInviteCode: (...args: unknown[]) => mockCreateInviteCode(...args),
  },
}))

vi.mock('@/server/lib/crypto', () => ({
  randomHex: () => 'abcdef012345',
}))

function validSession() {
  return { id: SESSION_ID, userId: ADMIN_ID, expiresAt: new Date(Date.now() + 60_000) }
}

describe('GET /admin/invites', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-purposes'
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-testing'
    process.env.DISCORD_LINK_SECRET = 'test-discord-link-secret-long-enough-for-testing-ok'
    mockGetSessionById.mockReset()
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns usedByUser when invite has usedBy', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(ADMIN_ID, SESSION_ID, PERMISSIONS.ADMIN_INVITES_MANAGE, false)
    mockGetSessionById.mockResolvedValue(validSession())

    const usedAt = new Date('2026-01-15T12:00:00Z')
    const createdAt = new Date('2026-01-01T00:00:00Z')
    mockListInviteCodes.mockResolvedValueOnce([
      {
        id: 'inv-1',
        code: 'ABCD',
        createdAt,
        expiresAt: undefined,
        usedAt,
        usedBy: 'user-uuid-1',
        isUsed: true,
        permissions: `${PERMISSIONS.APP_BLOG},${PERMISSIONS.APP_MUSIC}`,
      },
    ])
    mockGetUsersByIds.mockResolvedValueOnce([
      {
        id: 'user-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: '',
        isActive: true,
        displayName: 'Test Member',
        discordUsername: 'test_discord',
        loginPasskeyEnabled: true,
        loginDiscordEnabled: true,
        loginMagicEnabled: true,
        loginQrEnabled: true,
      },
    ])

    const { adminInviteRoutes } = await import('../../server/routes/admin/invites')
    const res = await adminInviteRoutes.request('/', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      invites: Array<{
        usedBy: string | null
        permissions: string
        usedByUser: { id: string; displayName: string | null; discordUsername: string | null } | null
      }>
    }
    expect(body.invites).toHaveLength(1)
    expect(body.invites[0].usedBy).toBe('user-uuid-1')
    expect(body.invites[0].usedByUser).toEqual({
      id: 'user-uuid-1',
      displayName: 'Test Member',
      discordUsername: 'test_discord',
    })
    expect(body.invites[0].permissions).toBe(`${PERMISSIONS.APP_BLOG},${PERMISSIONS.APP_MUSIC}`)
    expect(mockGetUsersByIds).toHaveBeenCalledWith(['user-uuid-1'])
  })

  it('passes empty ids to getUsersByIds when no usedBy', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(ADMIN_ID, SESSION_ID, PERMISSIONS.ADMIN_INVITES_MANAGE, false)
    mockGetSessionById.mockResolvedValue(validSession())

    mockListInviteCodes.mockResolvedValueOnce([
      {
        id: 'inv-2',
        code: 'WXYZ',
        createdAt: new Date(),
        expiresAt: undefined,
        usedAt: undefined,
        usedBy: undefined,
        isUsed: false,
        permissions: '',
      },
    ])
    mockGetUsersByIds.mockResolvedValueOnce([])

    const { adminInviteRoutes } = await import('../../server/routes/admin/invites')
    const res = await adminInviteRoutes.request('/', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    expect(mockGetUsersByIds).toHaveBeenCalledWith([])
  })
})

describe('POST /admin/invites', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-purposes'
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-testing'
    process.env.DISCORD_LINK_SECRET = 'test-discord-link-secret-long-enough-for-testing-ok'
    mockGetSessionById.mockReset()
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates invite with validated permissions CSV', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(ADMIN_ID, SESSION_ID, PERMISSIONS.ADMIN_INVITES_MANAGE, false)
    mockGetSessionById.mockResolvedValue(validSession())

    const createdAt = new Date('2026-01-01T00:00:00Z')
    mockCreateInviteCode.mockResolvedValueOnce({
      id: 'new-inv',
      code: 'ABCDEF012345',
      createdAt,
      isUsed: false,
      permissions: `${PERMISSIONS.APP_BLOG},${PERMISSIONS.APP_MUSIC}`,
    })

    const { adminInviteRoutes } = await import('../../server/routes/admin/invites')
    const res = await adminInviteRoutes.request('/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissions: [PERMISSIONS.APP_MUSIC, PERMISSIONS.APP_BLOG],
      }),
    })
    expect(res.status).toBe(201)
    expect(mockCreateInviteCode).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: `${PERMISSIONS.APP_BLOG},${PERMISSIONS.APP_MUSIC}`,
        createdBy: ADMIN_ID,
      }),
    )
  })

  it('returns 400 for invalid permission token', async () => {
    const { signAccessToken } = await import('../../server/lib/jwt')
    const token = await signAccessToken(ADMIN_ID, SESSION_ID, PERMISSIONS.ADMIN_INVITES_MANAGE, false)
    mockGetSessionById.mockResolvedValue(validSession())

    const { adminInviteRoutes } = await import('../../server/routes/admin/invites')
    const res = await adminInviteRoutes.request('/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissions: ['not.a.real.permission'],
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid permission')
    expect(mockCreateInviteCode).not.toHaveBeenCalled()
  })
})
