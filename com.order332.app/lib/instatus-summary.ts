/** Shape of https://332.instatus.com/summary.json (subset used by the app). */

export type InstatusIncident = {
  id: string
  name: string
  started: string
  status: string
  impact: string
  url: string
  updatedAt: string
}

export type InstatusSummary = {
  page: {
    name: string
    url: string
    status: string
  }
  activeIncidents: InstatusIncident[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isIncident(v: unknown): v is InstatusIncident {
  if (!isRecord(v)) return false
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.started === 'string' &&
    typeof v.status === 'string' &&
    typeof v.impact === 'string' &&
    typeof v.url === 'string' &&
    typeof v.updatedAt === 'string'
  )
}

export function parseInstatusSummary(data: unknown): InstatusSummary | null {
  if (!isRecord(data)) return null
  const page = data.page
  if (!isRecord(page)) return null
  if (
    typeof page.name !== 'string' ||
    typeof page.url !== 'string' ||
    typeof page.status !== 'string'
  ) {
    return null
  }
  const raw = data.activeIncidents
  if (!Array.isArray(raw)) return null
  const activeIncidents: InstatusIncident[] = []
  for (const item of raw) {
    if (!isIncident(item)) return null
    activeIncidents.push(item)
  }
  return {
    page: { name: page.name, url: page.url, status: page.status },
    activeIncidents,
  }
}

export function shouldShowInstatusBanner(summary: InstatusSummary): boolean {
  return summary.page.status === 'HASISSUES' && summary.activeIncidents.length > 0
}
