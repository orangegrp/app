/** Split stored genre on commas and semicolons (e.g. "a; b, c"). */
const GENRE_SPLIT = /[;,]+/

export function parseGenreSegments(raw: string | null | undefined): string[] {
  if (raw == null) return []
  const s = String(raw).trim()
  if (!s) return []
  return s.split(GENRE_SPLIT).map((x) => x.trim()).filter(Boolean)
}

/** First character uppercased; rest unchanged (e.g. "drum and bass" → "Drum and bass"). */
export function formatGenreSegment(s: string): string {
  const t = s.trim()
  if (!t) return ""
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function hasRenderableGenre(raw: string | null | undefined): boolean {
  return parseGenreSegments(raw).length > 0
}

/** Single line for Media Session / plain text (comma-separated, formatted segments). */
export function formatGenrePlainList(raw: string | null | undefined): string {
  return parseGenreSegments(raw).map(formatGenreSegment).join(", ")
}
