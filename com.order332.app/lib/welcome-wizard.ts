export function isWelcomeWizardCompletedForUser(user: {
  welcomeWizardCompletedAt?: Date
}): boolean {
  return Boolean(user.welcomeWizardCompletedAt)
}
