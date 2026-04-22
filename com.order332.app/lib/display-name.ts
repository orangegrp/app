/** Max length for `users.display_name` (app-enforced). */
export const DISPLAY_NAME_MAX_LENGTH = 32

/** Trim, empty → null, strip HTML characters, cap length (for API + DB). */
export function normalizeDisplayName(
  input: string | null | undefined
): string | null {
  if (input === null || input === undefined) return null
  const t = input.trim()
  if (!t) return null
  const stripped = t.replace(/[<>&"]/g, "")
  if (!stripped) return null
  return stripped.length > DISPLAY_NAME_MAX_LENGTH
    ? stripped.slice(0, DISPLAY_NAME_MAX_LENGTH)
    : stripped
}
