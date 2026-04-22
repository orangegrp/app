import "server-only"
import type { VtScanStats } from "./types"

const VT_BASE = "https://www.virustotal.com/api/v3"
const LARGE_FILE_THRESHOLD = 32 * 1024 * 1024 // 32 MB

/** Returns true for MIME types that must be scanned (non-image, non-audio). */
export function requiresVtScan(mimeType: string): boolean {
  return !mimeType.startsWith("image/") && !mimeType.startsWith("audio/")
}

/**
 * Submit a file buffer to VirusTotal.
 * Uses the large-file upload URL for files > 32 MB.
 * Returns the VT analysis ID.
 */
export async function submitFileToVt(
  buffer: ArrayBuffer,
  filename: string,
  apiKey: string
): Promise<string> {
  const blob = new Blob([buffer])
  const form = new FormData()
  form.append("file", blob, filename)

  let uploadUrl = `${VT_BASE}/files`

  if (buffer.byteLength > LARGE_FILE_THRESHOLD) {
    const urlRes = await fetch(`${VT_BASE}/files/upload_url`, {
      headers: { "x-apikey": apiKey },
    })
    if (!urlRes.ok) {
      throw new Error(`VT upload_url fetch failed: ${urlRes.status}`)
    }
    const urlData = (await urlRes.json()) as { data: string }
    uploadUrl = urlData.data
  }

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: form,
  })

  if (!res.ok) {
    throw new Error(`VT file submit failed: ${res.status}`)
  }

  const data = (await res.json()) as { data: { id: string } }
  return data.data.id
}

export interface VtAnalysisResult {
  status: "queued" | "in-progress" | "completed"
  stats: VtScanStats
  /** Permanent file report URL (not the analysis URL). */
  vtUrl: string
}

export interface VtEngineDetection {
  engineName: string
  category: string
  result: string | null
}

export interface VtFileReport {
  stats: VtScanStats
  vtUrl: string
  meaningfulName: string | null
  typeDescription: string | null
  reputation: number | null
  lastAnalysisAt: string | null
  detections: VtEngineDetection[]
}

/**
 * Poll a VT analysis by ID.
 * Returns null if the analysis is not yet complete.
 */
export async function getVtAnalysis(
  analysisId: string,
  apiKey: string
): Promise<VtAnalysisResult | null> {
  const res = await fetch(
    `${VT_BASE}/analyses/${encodeURIComponent(analysisId)}`,
    {
      headers: { "x-apikey": apiKey },
    }
  )

  if (!res.ok) {
    throw new Error(`VT analysis fetch failed: ${res.status}`)
  }

  // VT API v3: `meta` is top-level, not inside `data`
  const json = (await res.json()) as {
    data: {
      attributes: { status: string; stats: VtScanStats }
      links: { item?: string }
    }
    meta?: { file_info?: { sha256?: string } }
  }

  const { status, stats } = json.data.attributes

  // data.links.item is the API URL: https://www.virustotal.com/api/v3/files/{sha256}
  // Extract the sha256 (last path segment) to build the public GUI URL.
  const sha256 =
    json.meta?.file_info?.sha256 ?? json.data.links.item?.split("/").pop()
  const vtUrl = sha256
    ? `https://www.virustotal.com/gui/file/${sha256}`
    : `https://www.virustotal.com/gui/file-analysis/${encodeURIComponent(analysisId)}`

  if (status === "queued" || status === "in-progress") {
    return null
  }

  return { status: "completed", stats, vtUrl }
}

/**
 * Fetches the file report from VT for richer threat details.
 */
export async function getVtFileReport(
  sha256: string,
  apiKey: string
): Promise<VtFileReport> {
  const res = await fetch(`${VT_BASE}/files/${encodeURIComponent(sha256)}`, {
    headers: { "x-apikey": apiKey },
  })

  if (!res.ok) {
    throw new Error(`VT file report fetch failed: ${res.status}`)
  }

  const json = (await res.json()) as {
    data: {
      attributes: {
        meaningful_name?: string
        type_description?: string
        reputation?: number
        last_analysis_date?: number
        last_analysis_stats?: VtScanStats
        last_analysis_results?: Record<
          string,
          {
            category?: string
            result?: string | null
            engine_name?: string
          }
        >
      }
    }
  }

  const attrs = json.data.attributes
  const stats = attrs.last_analysis_stats ?? {
    malicious: 0,
    suspicious: 0,
    undetected: 0,
    harmless: 0,
    timeout: 0,
    failure: 0,
    "type-unsupported": 0,
  }

  const detections = Object.entries(attrs.last_analysis_results ?? {})
    .map(([engineName, result]) => ({
      engineName: result.engine_name ?? engineName,
      category: result.category ?? "undetected",
      result: result.result ?? null,
    }))
    .filter(
      (entry) =>
        entry.category === "malicious" ||
        entry.category === "suspicious" ||
        (entry.result && entry.result.trim().length > 0)
    )
    .sort((a, b) => {
      const rank = (category: string) => {
        if (category === "malicious") return 0
        if (category === "suspicious") return 1
        return 2
      }
      return rank(a.category) - rank(b.category)
    })
    .slice(0, 12)

  return {
    stats,
    vtUrl: `https://www.virustotal.com/gui/file/${sha256}`,
    meaningfulName: attrs.meaningful_name ?? null,
    typeDescription: attrs.type_description ?? null,
    reputation: typeof attrs.reputation === "number" ? attrs.reputation : null,
    lastAnalysisAt:
      typeof attrs.last_analysis_date === "number"
        ? new Date(attrs.last_analysis_date * 1000).toISOString()
        : null,
    detections,
  }
}
