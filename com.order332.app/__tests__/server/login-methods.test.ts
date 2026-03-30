import { describe, expect, it } from 'vitest'
import { mergeLoginMethodFlags } from '@/server/lib/login-methods'
import type { User } from '@/server/lib/types'

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: '',
    isActive: true,
    loginPasskeyEnabled: true,
    loginDiscordEnabled: true,
    loginMagicEnabled: true,
    loginQrEnabled: true,
    ...overrides,
  }
}

describe('mergeLoginMethodFlags', () => {
  it('merges partial updates', () => {
    const u = baseUser({ loginDiscordEnabled: false })
    const next = mergeLoginMethodFlags(u, { loginPasskeyEnabled: true })
    expect(next.loginPasskeyEnabled).toBe(true)
    expect(next.loginDiscordEnabled).toBe(false)
    expect(next.loginMagicEnabled).toBe(true)
    expect(next.loginQrEnabled).toBe(true)
  })

  it('throws when all methods would be disabled', () => {
    const u = baseUser({
      loginPasskeyEnabled: false,
      loginDiscordEnabled: false,
      loginMagicEnabled: false,
      loginQrEnabled: true,
    })
    expect(() => mergeLoginMethodFlags(u, { loginQrEnabled: false })).toThrow(
      /at least one sign-in method/i
    )
  })
})
