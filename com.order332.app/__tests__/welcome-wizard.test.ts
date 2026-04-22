import { describe, it, expect } from "vitest"
import { isWelcomeWizardCompletedForUser } from "@/lib/welcome-wizard"

describe("isWelcomeWizardCompletedForUser", () => {
  it("is true when welcomeWizardCompletedAt is set", () => {
    expect(
      isWelcomeWizardCompletedForUser({
        welcomeWizardCompletedAt: new Date(),
      })
    ).toBe(true)
  })

  it("is false when welcomeWizardCompletedAt is missing", () => {
    expect(isWelcomeWizardCompletedForUser({})).toBe(false)
  })
})
