import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  generateTotpSecret,
  generateQrRollingToken,
  verifyQrRollingToken,
} from '../../server/lib/totp'

describe('QR rolling HMAC token (totp.ts)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('verifyQrRollingToken accepts a token from ~3s later (within tolerance)', () => {
    const t0 = 1_700_000_000_000
    vi.setSystemTime(t0)
    const secret = generateTotpSecret()
    const token = generateQrRollingToken(secret)
    vi.setSystemTime(t0 + 3000)
    expect(verifyQrRollingToken(token, secret)).toBe(true)
  })

  it('verifyQrRollingToken rejects wrong token', () => {
    vi.setSystemTime(1_700_000_000_000)
    const secret = generateTotpSecret()
    const wrongMac = Buffer.alloc(32, 0).toString('base64url')
    expect(verifyQrRollingToken(wrongMac, secret)).toBe(false)
  })

  it('verifyQrRollingToken rejects when scanned too late (>7s step drift)', () => {
    const t0 = 1_700_000_000_000
    vi.setSystemTime(t0)
    const secret = generateTotpSecret()
    const token = generateQrRollingToken(secret)
    vi.setSystemTime(t0 + 8000)
    expect(verifyQrRollingToken(token, secret)).toBe(false)
  })
})
