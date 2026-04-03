import posthog from "posthog-js"
import { getPostHogBrowserInitOptions } from "./posthog-browser-init"
import {
  isProductImprovementConsentAllowedSync,
  setProductImprovementConsent as persistProductImprovementConsent,
} from "./product-improvement-consent"

let initCalled = false
let clientReady = false

export function isPostHogClientInitialized(): boolean {
  return clientReady
}

export function initPostHogFromConsent(): void {
  if (typeof window === "undefined") return
  if (initCalled) return
  if (!isProductImprovementConsentAllowedSync()) return
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return
  initCalled = true
  posthog.init(key, {
    ...getPostHogBrowserInitOptions(),
    loaded: () => {
      clientReady = true
    },
  })
}

/** Entry point for `instrumentation-client.ts` (same behavior as `initPostHogFromConsent`). */
export function initPostHogIfConsented(): void {
  initPostHogFromConsent()
}

function canSend(): boolean {
  if (!clientReady) return false
  try {
    return !posthog.has_opted_out_capturing()
  } catch {
    return false
  }
}

export function capture(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (!canSend()) return
  posthog.capture(event, properties)
}

export function identify(
  distinctId: string,
  properties?: Record<string, unknown>
): void {
  if (!canSend()) return
  posthog.identify(distinctId, properties)
}

export function captureException(
  error: unknown,
  props?: Record<string, unknown>
): void {
  if (!canSend()) return
  posthog.captureException(error, props)
}

export function reset(): void {
  if (!clientReady) return
  posthog.reset()
}

/**
 * Persists consent and updates the PostHog client. Used from Settings when the user toggles analytics.
 */
export function applyProductImprovementConsent(allowed: boolean): void {
  persistProductImprovementConsent(allowed)
  if (typeof window === "undefined") return
  if (!allowed) {
    if (clientReady) {
      posthog.opt_out_capturing()
      posthog.reset()
    }
    return
  }
  if (clientReady) {
    posthog.opt_in_capturing()
    return
  }
  initPostHogFromConsent()
}
