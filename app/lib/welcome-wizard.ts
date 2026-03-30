/** Accounts created before this instant are treated as already onboarded (no welcome wizard). */
export const WELCOME_WIZARD_LEGACY_CUTOFF_MS = Date.parse('2026-03-30T00:00:00.000Z')

export function isWelcomeWizardCompletedForUser(user: {
  welcomeWizardCompletedAt?: Date
  createdAt: Date
}): boolean {
  if (user.welcomeWizardCompletedAt) return true
  return user.createdAt.getTime() < WELCOME_WIZARD_LEGACY_CUTOFF_MS
}
