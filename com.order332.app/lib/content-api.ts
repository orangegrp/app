import { apiGet, apiDelete, apiPost } from "./api-client"
import { useAuthStore } from "./auth-store"

export type ContentItemType = "image" | "audio" | "pdf" | "download" | "video"

const CONTENT_ITEM_TYPES = new Set<ContentItemType>([
  "image",
  "audio",
  "pdf",
  "download",
  "video",
])

export type VideoStatus = "uploading" | "processing" | "ready" | "errored"

export type VtScanStatus =
  | "not_required"
  | "pending"
  | "scanning"
  | "clean"
  | "flagged"
  | "error"

export interface VtScanStats {
  malicious: number
  suspicious: number
  undetected: number
  harmless: number
  timeout: number
  failure: number
  "type-unsupported": number
}

export interface VtThreatDetection {
  engineName: string
  category: string
  result: string | null
}

export interface VtThreatInfo {
  status: VtScanStatus
  stats: VtScanStats | null
  vtUrl: string | null
  source: "cached" | "live"
  meaningfulName: string | null
  typeDescription: string | null
  reputation: number | null
  lastAnalysisAt: string | null
  detections: VtThreatDetection[]
}

export interface ContentFolder {
  id: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
  name: string
  parentId: string | null
}

export interface ContentItemMeta {
  id: string
  createdAt: string
  updatedAt: string
  uploadedBy: string | null
  itemType: ContentItemType
  title: string
  description?: string | null
  publicUrl: string
  mimeType: string
  fileSize: number
  durationSec?: number | null
  width?: number | null
  height?: number | null
  folderId: string | null
  vtScanStatus: VtScanStatus
  vtScanUrl: string | null
  vtScanStats: VtScanStats | null
  vtScannedAt: string | null
  muxUploadId: string | null
  muxAssetId: string | null
  muxPlaybackId: string | null
  videoStatus: VideoStatus | null
  videoError: string | null
}

export function normalizeContentItemType(
  itemType: string | null | undefined,
  mimeType?: string | null
): ContentItemType {
  if (itemType && CONTENT_ITEM_TYPES.has(itemType as ContentItemType)) {
    return itemType as ContentItemType
  }

  if (mimeType === "application/pdf") return "pdf"
  if (mimeType?.startsWith("image/")) return "image"
  if (mimeType?.startsWith("audio/")) return "audio"
  if (mimeType?.startsWith("video/")) return "video"
  return "download"
}

export async function fetchContentItems(
  type?: ContentItemType,
  folderId?: string | null
): Promise<{ items: ContentItemMeta[] }> {
  const params = new URLSearchParams()
  if (type) params.set("type", type)
  if (folderId) params.set("folderId", folderId)
  const qs = params.toString()
  return apiGet<{ items: ContentItemMeta[] }>(
    `/content/items${qs ? `?${qs}` : ""}`
  )
}

export async function deleteContentItem(id: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/content/items/${encodeURIComponent(id)}`)
}

/**
 * Uploads a content item with progress tracking.
 * Uses XMLHttpRequest so upload progress events are available.
 * @param onProgress — called with 0–100 as bytes are sent
 */
export async function uploadContentItem(
  file: File,
  meta: { title: string; description?: string; folderId?: string | null },
  onProgress?: (pct: number) => void
): Promise<{ item: ContentItemMeta }> {
  if (isVideoMimeType(file.type)) {
    return uploadVideoItem(file, meta, onProgress)
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("title", meta.title)
    if (meta.description) formData.append("description", meta.description)
    if (meta.folderId) formData.append("folderId", meta.folderId)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/content/items")

    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`)
    }

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText) as { item: ContentItemMeta })
        } catch {
          reject(new Error("Invalid response"))
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string }
          reject(new Error(err.error ?? "Upload failed"))
        } catch {
          reject(new Error("Upload failed"))
        }
      }
    }

    xhr.onerror = () => reject(new Error("Network error"))
    xhr.send(formData)
  })
}

async function uploadVideoItem(
  file: File,
  meta: { title: string; description?: string; folderId?: string | null },
  onProgress?: (pct: number) => void
): Promise<{ item: ContentItemMeta }> {
  const { uploadId, uploadUrl } = await apiPost<{
    uploadId: string
    uploadUrl: string
  }>("/content/items/video/upload-url", {
    filename: file.name,
    mimeType: file.type,
    fileSize: file.size,
    title: meta.title,
    description: meta.description,
    folderId: meta.folderId ?? null,
  })

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.setRequestHeader("Content-Type", file.type)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error("Video upload failed"))
      }
    }
    xhr.onerror = () => reject(new Error("Video upload failed"))
    xhr.send(file)
  })

  return apiPost<{ item: ContentItemMeta }>("/content/items/video/complete", {
    uploadId,
    title: meta.title,
    description: meta.description,
    folderId: meta.folderId ?? null,
    mimeType: file.type,
    fileSize: file.size,
  })
}

export async function pollVideoProcessing(): Promise<{
  updated: number
  stillPending: number
}> {
  return apiPost<{ updated: number; stillPending: number }>(
    "/content/items/video/refresh",
    {}
  )
}

export async function fetchVideoSource(
  id: string
): Promise<{ url: string; expiresAt: string }> {
  return apiPost<{ url: string; expiresAt: string }>(
    "/content/items/video/source",
    {
      id,
    }
  )
}

export async function fetchVideoDownloadUrl(
  id: string
): Promise<{ url: string }> {
  return apiPost<{ url: string }>("/content/items/video/download-url", { id })
}

// ── Folder CRUD ───────────────────────────────────────────────────────────────

export async function fetchContentFolders(): Promise<{
  folders: ContentFolder[]
}> {
  return apiGet<{ folders: ContentFolder[] }>("/content/folders")
}

export async function createContentFolder(
  name: string,
  parentId?: string | null
): Promise<{ folder: ContentFolder }> {
  return apiPost<{ folder: ContentFolder }>("/content/folders", {
    name,
    parentId: parentId ?? null,
  })
}

export async function renameContentFolder(
  id: string,
  name: string
): Promise<{ folder: ContentFolder }> {
  const accessToken = useAuthStore.getState().accessToken
  const res = await fetch(`/api/content/folders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? "Failed to rename folder")
  }
  return res.json() as Promise<{ folder: ContentFolder }>
}

export async function deleteContentFolder(
  id: string
): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(
    `/content/folders/${encodeURIComponent(id)}`
  )
}

// ── VT polling + retry ────────────────────────────────────────────────────────

export async function pollVtScans(): Promise<{
  updated: number
  stillPending: number
}> {
  return apiPost<{ updated: number; stillPending: number }>(
    "/content/scans/check",
    {}
  )
}

export async function moveContentItem(
  id: string,
  folderId: string | null
): Promise<{ item: ContentItemMeta }> {
  const accessToken = useAuthStore.getState().accessToken
  const res = await fetch(`/api/content/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ folderId }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? "Failed to move item")
  }
  return res.json() as Promise<{ item: ContentItemMeta }>
}

export async function retryVtScan(
  id: string
): Promise<{ item: ContentItemMeta }> {
  return apiPost<{ item: ContentItemMeta }>(
    `/content/items/${encodeURIComponent(id)}/retry-scan`,
    {}
  )
}

export async function fetchContentThreatInfo(
  id: string
): Promise<{ threat: VtThreatInfo }> {
  return apiGet<{ threat: VtThreatInfo }>(
    `/content/items/${encodeURIComponent(id)}/threat-info`
  )
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Whether a MIME type is a video. */
export function isVideoMimeType(mime: string): boolean {
  return mime.startsWith("video/")
}

/** Human-readable file size (e.g. "2.4 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
