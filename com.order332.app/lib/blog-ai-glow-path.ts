/** SVG path `d` for a rounded rectangle from (0,0) with size `width` × `height`. */
export function roundedRectPathD(width: number, height: number, r: number): string {
  const w = width
  const h = height
  const rr = Math.min(r, w / 2, h / 2)
  if (rr <= 0) {
    return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`
  }
  return [
    `M ${rr} 0`,
    `L ${w - rr} 0`,
    `A ${rr} ${rr} 0 0 1 ${w} ${rr}`,
    `L ${w} ${h - rr}`,
    `A ${rr} ${rr} 0 0 1 ${w - rr} ${h}`,
    `L ${rr} ${h}`,
    `A ${rr} ${rr} 0 0 1 0 ${h - rr}`,
    `L 0 ${rr}`,
    `A ${rr} ${rr} 0 0 1 ${rr} 0`,
    'Z',
  ].join(' ')
}

/** Perimeter length of the same rounded rect (for stroke-dash marquee). */
export function roundedRectPerimeter(width: number, height: number, r: number): number {
  const rr = Math.min(r, width / 2, height / 2)
  if (rr <= 0) return 2 * (width + height)
  return 2 * (width - 2 * rr) + 2 * (height - 2 * rr) + 2 * Math.PI * rr
}
