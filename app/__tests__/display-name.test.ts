import { describe, expect, it } from 'vitest'
import { DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName } from '@/lib/display-name'

describe('normalizeDisplayName', () => {
  it('trims and returns null for empty', () => {
    expect(normalizeDisplayName('   ')).toBe(null)
    expect(normalizeDisplayName('')).toBe(null)
  })

  it('returns null for null', () => {
    expect(normalizeDisplayName(null)).toBe(null)
  })

  it('caps length', () => {
    const long = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 10)
    expect(normalizeDisplayName(long)?.length).toBe(DISPLAY_NAME_MAX_LENGTH)
  })
})
