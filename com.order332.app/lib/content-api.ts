import { apiGet, apiDelete, apiFetch } from './api-client'
import { useAuthStore } from './auth-store'

export type ContentItemType = 'image' | 'audio' | 'pdf' | 'download'

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
}

export async function fetchContentItems(type?: ContentItemType): Promise<{ items: ContentItemMeta[] }> {
  const path = type ? `/content/items?type=${encodeURIComponent(type)}` : '/content/items'
  return apiGet<{ items: ContentItemMeta[] }>(path)
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
  meta: { title: string; description?: string },
  onProgress?: (pct: number) => void,
): Promise<{ item: ContentItemMeta }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', meta.title)
    if (meta.description) formData.append('description', meta.description)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/content/items')

    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
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
          reject(new Error('Invalid response'))
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string }
          reject(new Error(err.error ?? 'Upload failed'))
        } catch {
          reject(new Error('Upload failed'))
        }
      }
    }

    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(formData)
  })
}

/** Whether a MIME type is a video (blocked from upload). */
export function isVideoMimeType(mime: string): boolean {
  return mime.startsWith('video/')
}

/** Human-readable file size (e.g. "2.4 MB"). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
