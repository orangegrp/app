import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('JWT', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-purposes'
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-for-testing'
    process.env.DISCORD_LINK_SECRET = 'test-discord-link-secret-long-enough-for-testing-ok'
    vi.resetModules()
  })

  describe('signAccessToken / verifyAccessToken', () => {
    it('signs and verifies a valid access token', async () => {
      const { signAccessToken, verifyAccessToken } = await import('../../server/lib/jwt')
      const token = await signAccessToken('user-1', 'session-abc', 'home.view', false)
      const payload = await verifyAccessToken(token)
      expect(payload.sub).toBe('user-1')
      expect(payload.permissions).toBe('home.view')
      expect(payload.isPwa).toBe(false)
    })

    it('sets browser access token lifetime (~15 min)', async () => {
      const { signAccessToken, verifyAccessToken } = await import('../../server/lib/jwt')
      const token = await signAccessToken('user-1', 'session-abc', 'home.view', false)
      const payload = await verifyAccessToken(token)
      const duration = payload.exp - payload.iat
      expect(duration).toBe(15 * 60)
    })

    it('sets PWA access token lifetime (~24 hours)', async () => {
      const { signAccessToken, verifyAccessToken } = await import('../../server/lib/jwt')
      const token = await signAccessToken('user-1', 'session-abc', 'home.view', true)
      const payload = await verifyAccessToken(token)
      const duration = payload.exp - payload.iat
      expect(duration).toBe(24 * 60 * 60)
    })

    it('includes isPwa: true in PWA token', async () => {
      const { signAccessToken, verifyAccessToken } = await import('../../server/lib/jwt')
      const token = await signAccessToken('user-1', 'session-abc', 'home.view', true)
      const payload = await verifyAccessToken(token)
      expect(payload.isPwa).toBe(true)
    })

    it('stores permissions as CSV string', async () => {
      const { signAccessToken, verifyAccessToken } = await import('../../server/lib/jwt')
      const token = await signAccessToken('user-1', 'session-abc', 'app.webpc,app.labs', false)
      const payload = await verifyAccessToken(token)
      expect(payload.permissions).toBe('app.webpc,app.labs')
    })

    it('throws on invalid secret', async () => {
      const { signAccessToken } = await import('../../server/lib/jwt')
      const token = await signAccessToken('user-1', 'session-abc', 'home.view', false)
      vi.resetModules()
      process.env.JWT_SECRET = 'completely-different-secret-that-will-fail-verification'
      const { verifyAccessToken } = await import('../../server/lib/jwt')
      await expect(verifyAccessToken(token)).rejects.toThrow()
    })

    it('throws if JWT_SECRET is too short', async () => {
      process.env.JWT_SECRET = 'short'
      const { signAccessToken } = await import('../../server/lib/jwt')
      await expect(signAccessToken('user-1', 'session-abc', 'home.view', false)).rejects.toThrow('JWT_SECRET')
    })
  })

  describe('signRefreshToken / verifyRefreshToken', () => {
    it('signs and verifies a refresh token', async () => {
      const { signRefreshToken, verifyRefreshToken } = await import('../../server/lib/jwt')
      const token = await signRefreshToken('user-1', 'session-abc', false)
      const payload = await verifyRefreshToken(token)
      expect(payload.sub).toBe('user-1')
      expect(payload.sessionId).toBe('session-abc')
      expect(payload.isPwa).toBe(false)
    })

    it('sets browser refresh token lifetime (~7 days)', async () => {
      const { signRefreshToken, verifyRefreshToken } = await import('../../server/lib/jwt')
      const token = await signRefreshToken('user-1', 'session-abc', false)
      const payload = await verifyRefreshToken(token)
      const duration = payload.exp - Math.floor(Date.now() / 1000)
      expect(duration).toBeGreaterThan(7 * 24 * 60 * 60 - 5)
      expect(duration).toBeLessThanOrEqual(7 * 24 * 60 * 60)
    })

    it('sets PWA refresh token lifetime (~30 days)', async () => {
      const { signRefreshToken, verifyRefreshToken } = await import('../../server/lib/jwt')
      const token = await signRefreshToken('user-1', 'session-abc', true)
      const payload = await verifyRefreshToken(token)
      const duration = payload.exp - Math.floor(Date.now() / 1000)
      expect(duration).toBeGreaterThan(30 * 24 * 60 * 60 - 5)
      expect(duration).toBeLessThanOrEqual(30 * 24 * 60 * 60)
    })

    it('throws on wrong refresh secret', async () => {
      const { signRefreshToken } = await import('../../server/lib/jwt')
      const token = await signRefreshToken('user-1', 'session-abc', false)
      vi.resetModules()
      process.env.JWT_REFRESH_SECRET = 'completely-different-refresh-secret-for-testing-ok'
      const { verifyRefreshToken } = await import('../../server/lib/jwt')
      await expect(verifyRefreshToken(token)).rejects.toThrow()
    })
  })

  describe('getRefreshTokenExpiry', () => {
    it('returns ~7 day expiry for browser', async () => {
      const { getRefreshTokenExpiry } = await import('../../server/lib/jwt')
      const expiry = getRefreshTokenExpiry(false)
      const diff = expiry.getTime() - Date.now()
      expect(diff).toBeGreaterThan((7 * 24 * 60 * 60 - 5) * 1000)
      expect(diff).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000)
    })

    it('returns ~30 day expiry for PWA', async () => {
      const { getRefreshTokenExpiry } = await import('../../server/lib/jwt')
      const expiry = getRefreshTokenExpiry(true)
      const diff = expiry.getTime() - Date.now()
      expect(diff).toBeGreaterThan((30 * 24 * 60 * 60 - 5) * 1000)
      expect(diff).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000)
    })
  })
})
