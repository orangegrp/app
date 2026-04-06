export function getUpcomingAutoQueue(
  queue: string[],
  shuffledQueue: string[],
  shuffle: boolean,
  currentTrackId: string | null
): string[] {
  const effective = shuffle ? shuffledQueue : queue
  if (!effective.length) return []
  if (!currentTrackId) return effective
  const currentIndex = effective.findIndex((id) => id === currentTrackId)
  if (currentIndex === -1) return effective
  return effective.slice(currentIndex + 1)
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return [...arr]
  const length = arr.length
  if (from < 0 || from >= length || to < 0 || to >= length) return [...arr]
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
