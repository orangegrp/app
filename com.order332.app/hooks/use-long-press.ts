import { useCallback, useEffect, useRef, type MouseEvent } from "react"

export interface UseLongPressOptions {
  threshold?: number
}

export function useLongPress(
  onLongPress: () => void,
  { threshold = 500 }: UseLongPressOptions = {}
) {
  const timer = useRef<NodeJS.Timeout | null>(null)
  const callbackRef = useRef(onLongPress)

  useEffect(() => {
    callbackRef.current = onLongPress
  }, [onLongPress])

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const start = useCallback(() => {
    clear()
    timer.current = setTimeout(() => {
      callbackRef.current()
      timer.current = null
    }, threshold)
  }, [clear, threshold])

  useEffect(() => clear, [clear])

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  }
}
