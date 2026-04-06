import { getPostHogBrowserInitOptions } from "./posthog-browser-init"
import {
  isProductImprovementConsentAllowedSync,
  setProductImprovementConsent as persistProductImprovementConsent,
} from "./product-improvement-consent"

type PostHogClient = (typeof import("posthog-js"))["default"]

let initCalled = false
let clientReady = false
let posthogClient: PostHogClient | null = null
let loadingPromise: Promise<PostHogClient> | null = null

async function loadPostHogClient(): Promise<PostHogClient> {
  if (posthogClient) return posthogClient
  if (loadingPromise) return loadingPromise

  loadingPromise = import("posthog-js").then((mod) => {
    posthogClient = mod.default
    return mod.default
  })

  try {
    return await loadingPromise
  } finally {
    loadingPromise = null
  }
}

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

  void loadPostHogClient()
    .then((posthog) => {
      posthog.init(key, {
        ...getPostHogBrowserInitOptions(),
        loaded: () => {
          clientReady = true
        },
      })
    })
    .catch(() => {
      initCalled = false
    })
}

/** Entry point for `instrumentation-client.ts` (same behavior as `initPostHogFromConsent`). */
export function initPostHogIfConsented(): void {
  initPostHogFromConsent()
}

function canSend(): boolean {
  if (!clientReady || !posthogClient) return false
  try {
    return !posthogClient.has_opted_out_capturing()
  } catch {
    return false
  }
}

export function capture(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (!canSend()) return
  posthogClient?.capture(event, properties)
}

export function identify(
  distinctId: string,
  properties?: Record<string, unknown>
): void {
  if (!canSend()) return
  posthogClient?.identify(distinctId, properties)
}

export function captureException(
  error: unknown,
  props?: Record<string, unknown>
): void {
  if (!canSend()) return
  posthogClient?.captureException(error, props)
}

export function reset(): void {
  if (!clientReady || !posthogClient) return
  posthogClient.reset()
}

/**
 * Persists consent and updates the PostHog client. Used from Settings when the user toggles analytics.
 */
export function applyProductImprovementConsent(allowed: boolean): void {
  persistProductImprovementConsent(allowed)
  if (typeof window === "undefined") return
  if (!allowed) {
    if (clientReady && posthogClient) {
      posthogClient.opt_out_capturing()
      posthogClient.reset()
    }
    return
  }
  if (clientReady && posthogClient) {
    posthogClient.opt_in_capturing()
    return
  }
  initPostHogFromConsent()
}
