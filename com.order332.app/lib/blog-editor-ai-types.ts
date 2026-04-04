/** Merge multiple client rects into one axis-aligned bounding box. */
export function mergeDomRects(rects: DOMRect[]): DOMRect | null {
  if (rects.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }
  return new DOMRect(left, top, right - left, bottom - top)
}

/** Intersect client rects with a clip box (e.g. CodeMirror scroller). Drops empty intersections. */
export function clipDomRectsToRect(rects: DOMRect[], clip: DOMRect): DOMRect[] {
  const out: DOMRect[] = []
  for (const r of rects) {
    const left = Math.max(r.left, clip.left)
    const top = Math.max(r.top, clip.top)
    const right = Math.min(r.right, clip.right)
    const bottom = Math.min(r.bottom, clip.bottom)
    if (right - left < 0.5 || bottom - top < 0.5) continue
    out.push(new DOMRect(left, top, right - left, bottom - top))
  }
  return out
}

/** Selection info shared by Raw (CodeMirror) and Visual (TipTap) editors for AI assist. */
export interface BlogEditorSelectionMeta {
  from: number
  to: number
  text: string
  /** True when the selection is inside a fenced/indented code block (raw) or TipTap code block. */
  inCodeBlock: boolean
}
