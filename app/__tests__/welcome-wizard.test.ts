import { describe, it, expect } from 'vitest'
import {
  isWelcomeWizardCompletedForUser,
  WELCOME_WIZARD_LEGACY_CUTOFF_MS,
} from '@/lib/welcome-wizard'

describe('isWelcomeWizardCompletedForUser', () => {
  it('is true when welcomeWizardCompletedAt is set', () => {
    expect(
      isWelcomeWizardCompletedForUser({
        welcomeWizardCompletedAt: new Date(),
        createdAt: new Date('2026-04-01'),
      }),
    ).toBe(true)
  })

  it('is true for legacy accounts created before cutoff without timestamp', () => {
    expect(
      isWelcomeWizardCompletedForUser({
        createdAt: new Date(WELCOME_WIZARD_LEGACY_CUTOFF_MS - 86_400_000),
      }),
    ).toBe(true)
  })

  it('is false for new accounts after cutoff without timestamp', () => {
    expect(
      isWelcomeWizardCompletedForUser({
        createdAt: new Date(WELCOME_WIZARD_LEGACY_CUTOFF_MS + 86_400_000),
      }),
    ).toBe(false)
  })
})
