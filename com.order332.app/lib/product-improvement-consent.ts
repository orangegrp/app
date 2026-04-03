/** localStorage key: when false or "no", PostHog browser SDK must not run. */
export const CONSENT_PRODUCT_IMPROVEMENT_KEY = "consent-product-improvement"

/** Once-per-device flag: user has seen the dashboard analytics notice toast. */
export const PRODUCT_IMPROVEMENT_NOTICE_SEEN_KEY =
  "product-improvement-analytics-notice-seen"

function parseConsentValue(raw: string | null): boolean | null {
  if (raw === null) return null
  const t = raw.trim()
  if (t === "") return null
  const lower = t.toLowerCase()
  if (lower === "no" || lower === "false") return false
  if (lower === "yes" || lower === "true") return true
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed === false) return false
    if (parsed === true) return true
  } catch {
    // non-JSON string: treat unknown as allow (default allow)
  }
  return null
}

/** Default: allowed when key missing or unrecognized. */
export function isProductImprovementConsentAllowedSync(): boolean {
  if (typeof window === "undefined") return true
  try {
    const raw = localStorage.getItem(CONSENT_PRODUCT_IMPROVEMENT_KEY)
    const v = parseConsentValue(raw)
    if (v === false) return false
    return true
  } catch {
    return true
  }
}

export function setProductImprovementConsent(allowed: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (allowed) {
      localStorage.setItem(CONSENT_PRODUCT_IMPROVEMENT_KEY, JSON.stringify(true))
    } else {
      localStorage.setItem(CONSENT_PRODUCT_IMPROVEMENT_KEY, JSON.stringify(false))
    }
  } catch {
    // ignore quota / private mode
  }
}

export function hasSeenProductImprovementNoticeSync(): boolean {
  if (typeof window === "undefined") return true
  try {
    return localStorage.getItem(PRODUCT_IMPROVEMENT_NOTICE_SEEN_KEY) === "1"
  } catch {
    return true
  }
}

export function markProductImprovementNoticeSeen(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(PRODUCT_IMPROVEMENT_NOTICE_SEEN_KEY, "1")
  } catch {
    // ignore
  }
}
