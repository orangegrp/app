/**
 * Mail address normalization utilities.
 *
 * Rules for email local-part normalization (used for alias candidates):
 * - Lowercase the entire input.
 * - Convert whitespace and invalid local-part characters to hyphens.
 * - Collapse consecutive hyphens to one.
 * - Strip leading/trailing hyphens.
 * - Enforce min length of 1 and max of 64 characters.
 *
 * Primary address formula: ${userId}@${domain}
 * User IDs are UUIDs (all hex + hyphens) which are already email local-part safe.
 */

/** Max byte length for an email local-part per RFC 5321. */
const LOCAL_PART_MAX = 64

/**
 * Normalize an arbitrary string into an email-safe local-part.
 * Returns null if normalization produces an empty or invalid result.
 */
export function normalizeToLocalPart(input: string | null | undefined): string | null {
  if (!input) return null
  let v = input.trim().toLowerCase()
  // Replace anything that's not alphanumeric, dot, underscore, or hyphen with a hyphen.
  v = v.replace(/[^a-z0-9._-]/g, "-")
  // Replace dots used as separators at start/end or when doubled with hyphens.
  v = v.replace(/\.{2,}/g, "-")
  // Collapse consecutive separators.
  v = v.replace(/[-_]{2,}/g, "-")
  // Strip leading/trailing separators.
  v = v.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
  // Enforce length.
  v = v.slice(0, LOCAL_PART_MAX)
  // Strip again after truncation in case truncation lands on a separator.
  v = v.replace(/[^a-z0-9]+$/, "")
  return v.length > 0 ? v : null
}

/**
 * Derive the fixed primary email address for a user.
 * Primary is always the full UUID as local-part + configured domain.
 */
export function derivePrimaryEmail(userId: string, domain: string): string {
  // UUIDs are already local-part safe (hex chars + hyphens).
  return `${userId.toLowerCase()}@${domain.toLowerCase()}`
}

/**
 * Derive a default alias email suggestion from a display name + domain.
 * Falls back to a prefix of the user id if display name is unusable.
 */
export function deriveDefaultAlias(
  displayName: string | null | undefined,
  userId: string,
  domain: string
): string | null {
  const fromName = normalizeToLocalPart(displayName)
  if (fromName) return `${fromName}@${domain.toLowerCase()}`
  // Fallback: first 12 chars of UUID local part (deterministic, short).
  const fallback = userId.replace(/-/g, "").slice(0, 12)
  return `${fallback}@${domain.toLowerCase()}`
}

/**
 * Validate an email local-part only (without domain check).
 * Returns true if it could be a valid local-part.
 */
export function isValidLocalPart(localPart: string): boolean {
  return /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart)
}

/**
 * Parse a domain from an email address string. Returns null if malformed.
 */
export function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 0) return null
  const domain = email.slice(at + 1).toLowerCase()
  return domain.length > 0 ? domain : null
}
