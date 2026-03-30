import { describe, expect, it } from 'vitest'
import { mapQrScanError } from '@/lib/qr-scan-errors'

describe('mapQrScanError', () => {
  it('maps API codes to user-facing text', () => {
    expect(mapQrScanError('qr_token_invalid')).toContain('fresh QR')
    expect(mapQrScanError('qr_session_invalid')).toContain('expired')
    expect(mapQrScanError('Invalid or expired QR session')).toContain('expired')
  })

  it('falls back for unknown codes', () => {
    expect(mapQrScanError(undefined)).toContain('Unable to verify')
    expect(mapQrScanError('unknown_code')).toBe('unknown_code')
  })
})
