import { describe, it, expect } from 'vitest'
import { parseQrLoginUrl } from '@/lib/parse-qr-login-url'

describe('parseQrLoginUrl', () => {
  it('parses full https URL with /auth/qr', () => {
    const token =
      'Ow_8Yh9mZqKxL2vN3pQ4rS5tU6wX7yZ8aB0cD1eF2gH3'
    const u = `https://app.example.com/auth/qr?session=550e8400-e29b-41d4-a716-446655440000&token=${encodeURIComponent(token)}`
    const r = parseQrLoginUrl(u)
    expect(r).toEqual({
      session: '550e8400-e29b-41d4-a716-446655440000',
      token,
    })
  })

  it('parses path-only /auth/qr', () => {
    const r = parseQrLoginUrl('/auth/qr?session=s1&token=t9')
    expect(r).toEqual({ session: 's1', token: 't9' })
  })

  it('parses rolling desktop token (hex) same as a long-lived token — camera yields same URL shape', () => {
    const rollingHex = 'a'.repeat(64)
    const r = parseQrLoginUrl(
      `/auth/qr?session=550e8400-e29b-41d4-a716-446655440000&token=${encodeURIComponent(rollingHex)}`,
    )
    expect(r).toEqual({
      session: '550e8400-e29b-41d4-a716-446655440000',
      token: rollingHex,
    })
  })

  it('returns null for unrelated URL', () => {
    expect(parseQrLoginUrl('https://example.com/foo')).toBeNull()
  })
})
