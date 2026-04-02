/** Session-only: dismissed incident IDs; new IDs still surface the banner. */

const STORAGE_KEY = 'instatus-banner-dismissed-ids'

function readDismissedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function areIncidentIdsAllDismissed(incidentIds: string[]): boolean {
  if (incidentIds.length === 0) return false
  const dismissed = readDismissedIds()
  return incidentIds.every((id) => dismissed.has(id))
}

export function dismissIncidentIds(incidentIds: string[]): void {
  if (typeof window === 'undefined' || incidentIds.length === 0) return
  const dismissed = readDismissedIds()
  for (const id of incidentIds) dismissed.add(id)
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]))
}
