/** Perimeter of a rounded rectangle (stroke length for dash animation). */
export function roundedRectPerimeter(width: number, height: number, radius: number): number {
  const r = Math.min(Math.max(0, radius), width / 2, height / 2)
  const straight = 2 * (width - 2 * r) + 2 * (height - 2 * r)
  const arcs = 2 * Math.PI * r
  return straight + arcs
}

/** Inner dimensions after inset — must match `roundedRectPathD(..., inset)`. */
export function roundedRectInnerMetrics(
  width: number,
  height: number,
  radius: number,
  inset: number,
): { w: number; h: number; r: number } {
  const w = Math.max(0, width - 2 * inset)
  const h = Math.max(0, height - 2 * inset)
  const r = Math.min(Math.max(0, radius - inset), w / 2, h / 2)
  return { w, h, r }
}

/**
 * Clockwise path along the rounded-rect border (top-left start).
 * Coordinates in the same space as viewBox (typically 0,0 to width,height).
 */
export function roundedRectPathD(
  width: number,
  height: number,
  radius: number,
  inset = 0,
): string {
  const x = inset
  const y = inset
  const w = Math.max(0, width - 2 * inset)
  const h = Math.max(0, height - 2 * inset)
  const r = Math.min(Math.max(0, radius - inset), w / 2, h / 2)
  if (w < 1 || h < 1) return ''

  const x1 = x + r
  const y1 = y
  const x2 = x + w - r
  const y2 = y + h - r

  return [
    `M ${x1} ${y1}`,
    `L ${x2} ${y1}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `L ${x + w} ${y2}`,
    `A ${r} ${r} 0 0 1 ${x2} ${y + h}`,
    `L ${x1} ${y + h}`,
    `A ${r} ${r} 0 0 1 ${x} ${y2}`,
    `L ${x} ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x1} ${y1}`,
  ].join(' ')
}
