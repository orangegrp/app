export interface EditableLrcLine {
  timeMs: number
  text: string
}

const METADATA_TAGS = new Set([
  "ar",
  "ti",
  "al",
  "by",
  "offset",
  "length",
  "re",
  "ve",
])

function toMs(min: number, sec: number, frac: string): number {
  const fracMs =
    frac.length === 3
      ? Number.parseInt(frac, 10)
      : Number.parseInt(frac, 10) * 10
  return min * 60_000 + sec * 1_000 + fracMs
}

function normalizeLineText(text: string): string {
  return text.replace(/\s+([,.;:!?])/g, "$1").trim()
}

function ts(ms: number): string {
  const safe = Math.max(0, Math.round(ms))
  const mm = Math.floor(safe / 60_000)
  const ss = Math.floor((safe % 60_000) / 1_000)
  const cs = Math.floor((safe % 1_000) / 10)
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
}

export function parseEditableLrc(content: string): EditableLrcLine[] {
  const lines: EditableLrcLine[] = []
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd()
    if (!line) continue

    const metaMatch = /^\[([a-zA-Z]+):[^\]]*\]/.exec(line)
    if (metaMatch && METADATA_TAGS.has(metaMatch[1].toLowerCase())) continue

    const tagRegex = /\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/g
    const times: number[] = []
    let lastTagEnd = 0
    let match: RegExpExecArray | null
    while ((match = tagRegex.exec(line)) !== null) {
      times.push(
        toMs(
          Number.parseInt(match[1], 10),
          Number.parseInt(match[2], 10),
          match[3]
        )
      )
      lastTagEnd = match.index + match[0].length
    }

    if (times.length === 0) continue
    const text = normalizeLineText(line.slice(lastTagEnd))
    for (const timeMs of times) {
      lines.push({ timeMs, text })
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

export function seedTimedLinesFromText(content: string): EditableLrcLine[] {
  const raw = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  return raw.map((text, idx) => ({
    timeMs: idx * 2_500,
    text,
  }))
}

export function toLrcText(lines: EditableLrcLine[]): string {
  return lines
    .map((line) => `[${ts(line.timeMs)}]${normalizeLineText(line.text)}`)
    .join("\n")
}

export function offsetLineOnly(
  lines: EditableLrcLine[],
  index: number,
  deltaMs: number
): EditableLrcLine[] {
  if (index < 0 || index >= lines.length || deltaMs === 0) return [...lines]
  return lines.map((line, idx) => {
    if (idx !== index) return line
    return { ...line, timeMs: Math.max(0, line.timeMs + deltaMs) }
  })
}

export function offsetFromLine(
  lines: EditableLrcLine[],
  index: number,
  deltaMs: number
): EditableLrcLine[] {
  if (index < 0 || index >= lines.length || deltaMs === 0) return [...lines]
  return lines.map((line, idx) => {
    if (idx < index) return line
    return { ...line, timeMs: Math.max(0, line.timeMs + deltaMs) }
  })
}

export function offsetAll(
  lines: EditableLrcLine[],
  deltaMs: number
): EditableLrcLine[] {
  if (deltaMs === 0) return [...lines]
  return lines.map((line) => ({
    ...line,
    timeMs: Math.max(0, line.timeMs + deltaMs),
  }))
}

export function isLikelyLrc(content: string): boolean {
  return /\[\d{1,2}:\d{2}[.:]\d{2,3}\]/.test(content)
}
