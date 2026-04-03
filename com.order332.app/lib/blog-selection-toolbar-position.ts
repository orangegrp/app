/**
 * Fixed position for a toolbar centered horizontally on the selection, with `top` as the top edge.
 * Flips above the selection when there is not enough room below; clamps to the viewport.
 *
 * Uses only `selectionRect` from the editor (e.g. CodeMirror `coordsAtPos` rects). We intentionally
 * do **not** use `window.getSelection()` for large selections: CodeMirror keeps selection on an
 * internal/hidden input, so the native range's bounding rect can jump to the wrong place (often
 * far to the right), which misplaces floating UI beside the preview panel.
 */
export function computeToolbarPosition(
  selectionRect: DOMRect,
  size: { w: number; h: number },
  options?: { margin?: number; gap?: number },
): { left: number; top: number } {
  const margin = options?.margin ?? 10
  const gap = options?.gap ?? 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  const { w, h } = size
  const half = w / 2

  const centerX = selectionRect.left + selectionRect.width / 2
  const clampedCenterX = Math.max(margin + half, Math.min(centerX, vw - margin - half))

  let top = selectionRect.bottom + gap

  if (top + h > vh - margin) {
    top = selectionRect.top - gap - h
  }

  top = Math.max(margin, Math.min(top, vh - margin - h))

  return { left: clampedCenterX, top }
}
