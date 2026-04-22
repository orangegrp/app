import "server-only"
import { Hono } from "hono"
import { requireAuth } from "@/server/middleware/auth"
import { requirePermission } from "@/server/middleware/rbac"
import { rateLimitByUser } from "@/server/middleware/rate-limit"
import { PERMISSIONS } from "@/lib/permissions"
import {
  inferItemType,
  CONTENT_SIZE_LIMITS,
  VIDEO_MIME_TYPES,
  uploadContentItemBuffer,
  CONTENT_LIBRARY_BUCKET,
} from "@/server/lib/content-upload"
import { signUrl, signUrls } from "@/server/lib/signed-url"
import {
  createMuxDirectUpload,
  deleteMuxAsset,
  enableMuxMasterAccess,
  getMuxAsset,
  getMuxDirectUpload,
  getMuxWhoAmI,
  type MuxAsset,
} from "@/server/lib/mux"
import { buildSignedMuxHlsUrl } from "@/server/lib/mux-playback"
import {
  getVtFileReport,
  requiresVtScan,
  submitFileToVt,
} from "@/server/lib/virustotal"
import { supabase } from "@/server/db/supabase/client"
import type {
  HonoEnv,
  ContentItem,
  ContentItemType,
  VideoStatus,
} from "@/server/lib/types"

export const contentItemRoutes = new Hono<HonoEnv>()
contentItemRoutes.use(
  "*",
  requireAuth,
  requirePermission(PERMISSIONS.APP_CONTENT)
)

const VALID_CONTENT_TYPES: ContentItemType[] = [
  "image",
  "audio",
  "pdf",
  "download",
  "video",
]

const VIDEO_PROCESSING_STATUSES: VideoStatus[] = ["uploading", "processing"]

function parseAspectRatio(aspectRatio: string | null): {
  width: number | null
  height: number | null
} {
  if (!aspectRatio) return { width: null, height: null }
  const [w, h] = aspectRatio.split(":")
  const width = Number.parseInt(w ?? "", 10)
  const height = Number.parseInt(h ?? "", 10)
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: null, height: null }
  }
  return { width, height }
}

function pickSignedPlaybackId(asset: MuxAsset): string | null {
  return asset.playbackIds.find((id) => id.policy === "signed")?.id ?? null
}

interface ResolvedVideoState {
  muxAssetId: string | null
  muxPlaybackId: string | null
  durationSec: number | null
  width: number | null
  height: number | null
  videoStatus: VideoStatus
  videoError: string | null
}

async function resolveVideoState(
  row: Record<string, unknown>
): Promise<ResolvedVideoState> {
  const currentUploadId = row.mux_upload_id as string | null
  const currentAssetId = row.mux_asset_id as string | null
  const existingPlaybackId = row.mux_playback_id as string | null
  let assetId = currentAssetId

  if (!assetId && currentUploadId) {
    const upload = await getMuxDirectUpload(currentUploadId)
    assetId = upload.assetId
  }

  if (!assetId) {
    return {
      muxAssetId: null,
      muxPlaybackId: existingPlaybackId,
      durationSec: (row.duration_sec as number | null) ?? null,
      width: (row.width as number | null) ?? null,
      height: (row.height as number | null) ?? null,
      videoStatus: "processing",
      videoError: null,
    }
  }

  const asset = await getMuxAsset(assetId)
  const playbackId = pickSignedPlaybackId(asset)
  const { width, height } = parseAspectRatio(asset.aspectRatio)

  if (asset.status === "ready" && playbackId) {
    return {
      muxAssetId: assetId,
      muxPlaybackId: playbackId,
      durationSec:
        typeof asset.duration === "number"
          ? Math.round(asset.duration)
          : ((row.duration_sec as number | null) ?? null),
      width: width ?? (row.width as number | null) ?? null,
      height: height ?? (row.height as number | null) ?? null,
      videoStatus: "ready",
      videoError: null,
    }
  }

  if (asset.status === "errored") {
    const errorMessage =
      asset.errors?.messages?.join("; ") ??
      asset.errors?.type ??
      "Mux processing failed"
    return {
      muxAssetId: assetId,
      muxPlaybackId: playbackId,
      durationSec: (row.duration_sec as number | null) ?? null,
      width: (row.width as number | null) ?? null,
      height: (row.height as number | null) ?? null,
      videoStatus: "errored",
      videoError: errorMessage,
    }
  }

  return {
    muxAssetId: assetId,
    muxPlaybackId: playbackId,
    durationSec: (row.duration_sec as number | null) ?? null,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    videoStatus: "processing",
    videoError: null,
  }
}

// GET /content/items — list content items, optional ?type= and ?folderId= filters
contentItemRoutes.get("/", async (c) => {
  const type = c.req.query("type")
  const folderId = c.req.query("folderId") ?? null

  let query = supabase
    .from("content_items")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)

  if (type && VALID_CONTENT_TYPES.includes(type as ContentItemType)) {
    query = query.eq("item_type", type)
  }

  // null folderId → root items; non-null → items in that folder
  if (folderId) {
    query = query.eq("folder_id", folderId)
  } else {
    query = query.is("folder_id", null)
  }

  const { data, error } = await query

  if (error) {
    console.error("[content/items] list error:", error)
    return c.json({ error: "Failed to fetch items" }, 500)
  }

  const items: ContentItem[] = (data ?? []).map(rowToContentItem)

  const storageKeys = items
    .filter((i) => i.itemType !== "video")
    .map((i) => i.storageKey)
  const signed = await signUrls(CONTENT_LIBRARY_BUCKET, storageKeys)
  const result = items.map((i) => ({
    ...i,
    publicUrl: signed.get(i.storageKey) ?? i.publicUrl,
  }))
  return c.json({ items: result })
})

// GET /content/items/:id/threat-info — fetch richer VT details for dialog
contentItemRoutes.get(
  "/:id/threat-info",
  rateLimitByUser(20, 60_000),
  async (c) => {
    const id = c.req.param("id")
    const { data, error } = await supabase
      .from("content_items")
      .select("id, vt_scan_status, vt_scan_stats, vt_scan_url")
      .eq("id", id)
      .single()

    if (error || !data) {
      return c.json({ error: "Item not found" }, 404)
    }

    const base = {
      status: data.vt_scan_status as ContentItem["vtScanStatus"],
      stats: data.vt_scan_stats as ContentItem["vtScanStats"],
      vtUrl: (data.vt_scan_url as string | null) ?? null,
      source: "cached" as const,
      meaningfulName: null as string | null,
      typeDescription: null as string | null,
      reputation: null as number | null,
      lastAnalysisAt: null as string | null,
      detections: [] as Array<{
        engineName: string
        category: string
        result: string | null
      }>,
    }

    if (!base.vtUrl || !process.env.VIRUSTOTAL_API_KEY) {
      return c.json({ threat: base })
    }

    const match = base.vtUrl.match(/\/file\/([a-f0-9]{64})/i)
    const sha256 = match?.[1]
    if (!sha256) {
      return c.json({ threat: base })
    }

    try {
      const live = await getVtFileReport(sha256, process.env.VIRUSTOTAL_API_KEY)
      return c.json({
        threat: {
          ...base,
          source: "live" as const,
          stats: live.stats,
          vtUrl: live.vtUrl,
          meaningfulName: live.meaningfulName,
          typeDescription: live.typeDescription,
          reputation: live.reputation,
          lastAnalysisAt: live.lastAnalysisAt,
          detections: live.detections,
        },
      })
    } catch (err) {
      console.error("[content/items] threat-info fetch error:", err)
      return c.json({ threat: base })
    }
  }
)

// GET /content/items/video/mux-auth-check — debug helper for Mux token wiring
contentItemRoutes.get(
  "/video/mux-auth-check",
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  rateLimitByUser(10, 60_000),
  async (c) => {
    try {
      const tokenId = process.env.MUX_TOKEN_ID ?? null
      const whoami = await getMuxWhoAmI()
      return c.json({
        ok: true,
        tokenHint: tokenId ? `${tokenId.slice(0, 8)}...` : null,
        whoami,
      })
    } catch (err) {
      return c.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Mux auth check failed",
        },
        500
      )
    }
  }
)

// POST /content/items/video/upload-url — create direct browser upload URL at Mux
contentItemRoutes.post(
  "/video/upload-url",
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  rateLimitByUser(20, 60_000),
  async (c) => {
    let body: {
      filename?: string
      mimeType?: string
      fileSize?: number
      title?: string
      description?: string
      folderId?: string | null
    }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Expected JSON body" }, 400)
    }

    const mimeType = body.mimeType?.trim() ?? ""
    if (!mimeType.startsWith("video/")) {
      return c.json({ error: "Unsupported video type" }, 400)
    }

    if (typeof body.fileSize !== "number" || body.fileSize <= 0) {
      return c.json({ error: "Missing file size" }, 400)
    }

    const title = body.title?.trim().slice(0, 200)
    if (!title) {
      return c.json({ error: "Missing title" }, 400)
    }

    const folderId = body.folderId ?? null

    if (folderId !== null) {
      const { data: folder, error: folderErr } = await supabase
        .from("content_folders")
        .select("id")
        .eq("id", folderId)
        .single()
      if (folderErr || !folder) {
        return c.json({ error: "Folder not found" }, 404)
      }
    }

    try {
      const upload = await createMuxDirectUpload({
        corsOrigin: c.req.header("origin") ?? undefined,
      })

      return c.json({
        uploadId: upload.id,
        uploadUrl: upload.url,
      })
    } catch (err) {
      console.error("[content/items] mux upload-url error:", err)
      return c.json({ error: "Failed to create video upload URL" }, 500)
    }
  }
)

// POST /content/items/video/complete — register uploaded video in library
contentItemRoutes.post(
  "/video/complete",
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  rateLimitByUser(20, 60_000),
  async (c) => {
    let body: {
      uploadId?: string
      title?: string
      description?: string
      folderId?: string | null
      mimeType?: string
      fileSize?: number
    }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Expected JSON body" }, 400)
    }

    const uploadId = body.uploadId?.trim()
    if (!uploadId) {
      return c.json({ error: "Missing uploadId" }, 400)
    }

    const mimeType = body.mimeType?.trim() ?? ""
    if (!mimeType.startsWith("video/")) {
      return c.json({ error: "Invalid video mime type" }, 400)
    }

    const fileSize = body.fileSize
    if (typeof fileSize !== "number" || fileSize <= 0) {
      return c.json({ error: "Missing file size" }, 400)
    }

    const title = body.title?.trim().slice(0, 200)
    if (!title) {
      return c.json({ error: "Missing title" }, 400)
    }

    const description = body.description?.trim().slice(0, 1000) || null
    const folderId = body.folderId ?? null
    if (folderId !== null) {
      const { data: folder, error: folderErr } = await supabase
        .from("content_folders")
        .select("id")
        .eq("id", folderId)
        .single()
      if (folderErr || !folder) {
        return c.json({ error: "Folder not found" }, 404)
      }
    }

    const user = c.get("user")

    const { data: existing } = await supabase
      .from("content_items")
      .select("*")
      .eq("mux_upload_id", uploadId)
      .single()

    if (existing) {
      const resolved = await resolveVideoState(existing)
      const { data: persisted, error: updateErr } = await supabase
        .from("content_items")
        .update({
          title,
          description,
          folder_id: folderId,
          mux_asset_id: resolved.muxAssetId,
          mux_playback_id: resolved.muxPlaybackId,
          duration_sec: resolved.durationSec,
          width: resolved.width,
          height: resolved.height,
          video_status: resolved.videoStatus,
          video_error: resolved.videoError,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id as string)
        .select()
        .single()

      if (updateErr || !persisted) {
        return c.json({ error: "Failed to register uploaded video" }, 500)
      }

      return c.json({ item: rowToContentItem(persisted) }, 200)
    }

    try {
      const upload = await getMuxDirectUpload(uploadId)
      const assetId = upload.assetId
      let playbackId: string | null = null
      let videoStatus: VideoStatus = "processing"
      let videoError: string | null = null
      let durationSec: number | null = null
      let width: number | null = null
      let height: number | null = null

      if (assetId) {
        const asset = await getMuxAsset(assetId)
        playbackId = pickSignedPlaybackId(asset)
        const parsedRatio = parseAspectRatio(asset.aspectRatio)
        width = parsedRatio.width
        height = parsedRatio.height
        durationSec =
          typeof asset.duration === "number" ? Math.round(asset.duration) : null

        if (asset.status === "ready" && playbackId) {
          videoStatus = "ready"
        } else if (asset.status === "errored") {
          videoStatus = "errored"
          videoError =
            asset.errors?.messages?.join("; ") ??
            asset.errors?.type ??
            "Mux processing failed"
        }
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("content_items")
        .insert({
          uploaded_by: user.id,
          item_type: "video",
          title,
          description,
          storage_key: `mux/${assetId ?? uploadId}`,
          public_url: "",
          mime_type: mimeType,
          file_size: fileSize,
          duration_sec: durationSec,
          width,
          height,
          folder_id: folderId,
          vt_scan_status: "not_required",
          mux_upload_id: uploadId,
          mux_asset_id: assetId,
          mux_playback_id: playbackId,
          video_status: videoStatus,
          video_error: videoError,
        })
        .select()
        .single()

      if (insertErr || !inserted) {
        console.error("[content/items] video insert error:", insertErr)
        return c.json({ error: "Failed to register uploaded video" }, 500)
      }

      return c.json({ item: rowToContentItem(inserted) }, 201)
    } catch (err) {
      console.error("[content/items] video complete error:", err)
      return c.json({ error: "Failed to complete video upload" }, 500)
    }
  }
)

// POST /content/items/video/refresh — refresh processing video statuses from Mux
contentItemRoutes.post(
  "/video/refresh",
  rateLimitByUser(1, 10_000),
  async (c) => {
    const { data, error } = await supabase
      .from("content_items")
      .select("*")
      .eq("item_type", "video")
      .in("video_status", VIDEO_PROCESSING_STATUSES)
      .limit(20)

    if (error) {
      console.error("[content/items] video refresh fetch error:", error)
      return c.json({ error: "Failed to fetch processing videos" }, 500)
    }

    const rows = data ?? []
    let updated = 0
    let stillPending = 0

    await Promise.allSettled(
      rows.map(async (row) => {
        try {
          const resolved = await resolveVideoState(row)
          const prevStatus = row.video_status as VideoStatus | null
          const nextStatus = resolved.videoStatus
          if (prevStatus !== nextStatus) {
            updated += 1
          }
          if (nextStatus === "processing" || nextStatus === "uploading") {
            stillPending += 1
          }
          await supabase
            .from("content_items")
            .update({
              mux_asset_id: resolved.muxAssetId,
              mux_playback_id: resolved.muxPlaybackId,
              duration_sec: resolved.durationSec,
              width: resolved.width,
              height: resolved.height,
              video_status: resolved.videoStatus,
              video_error: resolved.videoError,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id as string)
        } catch (err) {
          stillPending += 1
          console.error("[content/items] video refresh error:", err)
        }
      })
    )

    return c.json({ updated, stillPending })
  }
)

// POST /content/items/video/source — return signed HLS source URL for playback
contentItemRoutes.post(
  "/video/source",
  rateLimitByUser(60, 60_000),
  async (c) => {
    let body: { id?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Expected JSON body" }, 400)
    }

    const id = body.id?.trim()
    if (!id) return c.json({ error: "Missing item id" }, 400)

    const { data, error } = await supabase
      .from("content_items")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !data) {
      return c.json({ error: "Item not found" }, 404)
    }

    if (data.item_type !== "video") {
      return c.json({ error: "Item is not a video" }, 400)
    }

    const resolved = await resolveVideoState(data).catch(() => ({
      muxAssetId: (data.mux_asset_id as string | null) ?? null,
      muxPlaybackId: (data.mux_playback_id as string | null) ?? null,
      durationSec: (data.duration_sec as number | null) ?? null,
      width: (data.width as number | null) ?? null,
      height: (data.height as number | null) ?? null,
      videoStatus: ((data.video_status as VideoStatus | null) ??
        "processing") as VideoStatus,
      videoError: (data.video_error as string | null) ?? null,
    }))

    await supabase
      .from("content_items")
      .update({
        mux_asset_id: resolved.muxAssetId,
        mux_playback_id: resolved.muxPlaybackId,
        duration_sec: resolved.durationSec,
        width: resolved.width,
        height: resolved.height,
        video_status: resolved.videoStatus,
        video_error: resolved.videoError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .then(
        () => {},
        () => {}
      )

    const playbackId = resolved.muxPlaybackId
    const status = resolved.videoStatus

    if (!playbackId || status !== "ready") {
      return c.json(
        {
          error:
            status === "errored"
              ? (resolved.videoError ?? "Video processing failed")
              : "Video is still processing",
        },
        409
      )
    }

    try {
      const signed = await buildSignedMuxHlsUrl(playbackId)
      return c.json(signed)
    } catch (err) {
      console.error("[content/items] video source sign error:", err)
      return c.json({ error: "Failed to sign playback URL" }, 500)
    }
  }
)

// POST /content/items/video/download-url — return temporary Mux master URL
contentItemRoutes.post(
  "/video/download-url",
  rateLimitByUser(20, 60_000),
  async (c) => {
    let body: { id?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Expected JSON body" }, 400)
    }

    const id = body.id?.trim()
    if (!id) return c.json({ error: "Missing item id" }, 400)

    const { data, error } = await supabase
      .from("content_items")
      .select("id, item_type, mux_asset_id")
      .eq("id", id)
      .single()

    if (error || !data) {
      return c.json({ error: "Item not found" }, 404)
    }

    if (data.item_type !== "video") {
      return c.json({ error: "Item is not a video" }, 400)
    }

    const assetId = data.mux_asset_id as string | null
    if (!assetId) {
      return c.json({ error: "Video is still processing" }, 409)
    }

    try {
      let asset = await getMuxAsset(assetId)
      if (asset.masterStatus !== "ready" || !asset.masterUrl) {
        if (asset.masterAccess !== "temporary") {
          await enableMuxMasterAccess(assetId)
        }
        for (let i = 0; i < 5; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          asset = await getMuxAsset(assetId)
          if (asset.masterStatus === "ready" && asset.masterUrl) break
        }
      }

      if (!asset.masterUrl) {
        return c.json(
          { error: "Master download is preparing. Try again shortly." },
          409
        )
      }

      return c.json({ url: asset.masterUrl })
    } catch (err) {
      console.error("[content/items] video download url error:", err)
      return c.json({ error: "Failed to prepare video download" }, 500)
    }
  }
)

// POST /content/items — upload a new content item
contentItemRoutes.post(
  "/",
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  rateLimitByUser(10, 60_000),
  async (c) => {
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: "Expected multipart/form-data" }, 400)
    }

    const file = formData.get("file")
    if (!(file instanceof File)) {
      return c.json({ error: "Missing file field" }, 400)
    }

    const titleRaw = formData.get("title")
    if (typeof titleRaw !== "string" || !titleRaw.trim()) {
      return c.json({ error: "Missing title" }, 400)
    }
    const title = titleRaw.trim().slice(0, 200)
    const descriptionRaw = formData.get("description")
    const description =
      typeof descriptionRaw === "string"
        ? descriptionRaw.trim().slice(0, 1000) || null
        : null

    const folderIdRaw = formData.get("folderId")
    const folderId =
      typeof folderIdRaw === "string" && folderIdRaw ? folderIdRaw : null

    // Validate folderId if provided
    if (folderId) {
      const { data: folder, error: folderErr } = await supabase
        .from("content_folders")
        .select("id")
        .eq("id", folderId)
        .single()
      if (folderErr || !folder) {
        return c.json({ error: "Folder not found" }, 404)
      }
    }

    // Keep legacy multipart endpoint for non-video items.
    if (VIDEO_MIME_TYPES.has(file.type)) {
      return c.json(
        { error: "Use the direct video upload endpoint for video files." },
        400
      )
    }

    const itemType = inferItemType(file.type)
    if (!itemType) {
      return c.json({ error: `Unsupported file type: ${file.type}` }, 400)
    }

    const sizeLimit = CONTENT_SIZE_LIMITS[itemType]
    if (file.size > sizeLimit) {
      const mb = Math.round(sizeLimit / 1024 / 1024)
      return c.json(
        { error: `File exceeds ${mb} MB limit for ${itemType} files` },
        400
      )
    }

    const user = c.get("user")

    try {
      // Read buffer once — reused for storage upload and optional VT submission
      const buffer = await file.arrayBuffer()

      const { storageKey, publicUrl } = await uploadContentItemBuffer({
        userId: user.id,
        buffer,
        contentType: file.type,
        filenameHint: file.name,
      })

      // Initial VT status: pending (will be updated below if VT is configured)
      const vtEnabled =
        !!process.env.VIRUSTOTAL_API_KEY && requiresVtScan(file.type)
      const initialVtStatus = vtEnabled ? "pending" : "not_required"

      const { data, error } = await supabase
        .from("content_items")
        .insert({
          uploaded_by: user.id,
          item_type: itemType,
          title,
          description,
          storage_key: storageKey,
          public_url: publicUrl,
          mime_type: file.type,
          file_size: file.size,
          folder_id: folderId,
          vt_scan_status: initialVtStatus,
        })
        .select()
        .single()

      if (error || !data) {
        // Best-effort cleanup of orphaned storage object
        await supabase.storage
          .from("content-library")
          .remove([storageKey])
          .catch(() => {})
        console.error("[content/items] insert error:", error)
        return c.json({ error: "Failed to save item" }, 500)
      }

      const item = rowToContentItem(data)

      // Fire-and-forget VT submission: don't block the 201 response
      if (vtEnabled) {
        void submitVtScan(item.id, buffer, file.name)
      }

      const signedPublicUrl = await signUrl(
        CONTENT_LIBRARY_BUCKET,
        item.storageKey
      )
      return c.json(
        { item: { ...item, publicUrl: signedPublicUrl || item.publicUrl } },
        201
      )
    } catch (err) {
      console.error("[content/items] upload error:", err)
      return c.json({ error: "Upload failed" }, 500)
    }
  }
)

// DELETE /content/items/:id — delete a content item (own items only, or superuser)
contentItemRoutes.delete(
  "/:id",
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  async (c) => {
    const id = c.req.param("id")
    const user = c.get("user")

    const { data, error } = await supabase
      .from("content_items")
      .select("id, storage_key, uploaded_by, item_type, mux_asset_id")
      .eq("id", id)
      .single()

    if (error || !data) {
      return c.json({ error: "Item not found" }, 404)
    }

    const isSuperuser = user.permissions === "*"
    if (!isSuperuser && data.uploaded_by !== user.id) {
      return c.json({ error: "Forbidden" }, 403)
    }

    if (data.item_type === "video") {
      const muxAssetId = data.mux_asset_id as string | null
      if (muxAssetId) {
        await deleteMuxAsset(muxAssetId).catch((err) => {
          console.error("[content/items] mux delete error:", err)
        })
      }
    } else {
      const { error: storageError } = await supabase.storage
        .from("content-library")
        .remove([data.storage_key as string])

      if (storageError) {
        console.error("[content/items] storage delete error:", storageError)
        // Continue with DB delete even if storage delete fails
      }
    }

    const { error: deleteError } = await supabase
      .from("content_items")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("[content/items] db delete error:", deleteError)
      return c.json({ error: "Delete failed" }, 500)
    }

    return c.json({ ok: true })
  }
)

// PATCH /content/items/:id — move item to a different folder (or root)
contentItemRoutes.patch(
  "/:id",
  requirePermission(PERMISSIONS.APP_CONTENT_UPLOAD),
  async (c) => {
    const id = c.req.param("id")
    const user = c.get("user")

    let body: { folderId?: string | null }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Expected JSON body" }, 400)
    }

    if (!("folderId" in body)) {
      return c.json({ error: "Nothing to update" }, 400)
    }

    const folderId = body.folderId ?? null

    // Validate target folder exists if non-null
    if (folderId !== null) {
      const { data: folder, error: folderErr } = await supabase
        .from("content_folders")
        .select("id")
        .eq("id", folderId)
        .single()
      if (folderErr || !folder) {
        return c.json({ error: "Folder not found" }, 404)
      }
    }

    // Check ownership
    const { data: existing, error: fetchErr } = await supabase
      .from("content_items")
      .select("uploaded_by, storage_key")
      .eq("id", id)
      .single()

    if (fetchErr || !existing) {
      return c.json({ error: "Item not found" }, 404)
    }

    const isSuperuser = user.permissions === "*"
    if (!isSuperuser && existing.uploaded_by !== user.id) {
      return c.json({ error: "Forbidden" }, 403)
    }

    const { data: updated, error: updateErr } = await supabase
      .from("content_items")
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (updateErr || !updated) {
      console.error("[content/items] move error:", updateErr)
      return c.json({ error: "Move failed" }, 500)
    }

    const signedPublicUrl = await signUrl(
      CONTENT_LIBRARY_BUCKET,
      updated.storage_key as string
    )
    const item = rowToContentItem(updated)
    return c.json({
      item: { ...item, publicUrl: signedPublicUrl || item.publicUrl },
    })
  }
)

// POST /content/items/:id/retry-scan — re-submit a failed VT scan
contentItemRoutes.post(
  "/:id/retry-scan",
  requirePermission(PERMISSIONS.APP_CONTENT),
  rateLimitByUser(5, 60_000),
  async (c) => {
    const id = c.req.param("id")

    const { data, error } = await supabase
      .from("content_items")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !data) {
      return c.json({ error: "Item not found" }, 404)
    }

    if (!process.env.VIRUSTOTAL_API_KEY) {
      return c.json({ error: "VirusTotal is not configured" }, 503)
    }

    // Only allow retry on error status
    if (data.vt_scan_status !== "error") {
      return c.json({ error: "Item is not in an error state" }, 400)
    }

    // Reset to pending immediately so the UI reflects the change
    const { data: updated, error: updateErr } = await supabase
      .from("content_items")
      .update({
        vt_scan_status: "pending",
        vt_scan_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateErr || !updated) {
      return c.json({ error: "Failed to reset scan status" }, 500)
    }

    // Download file from storage and re-submit to VT (fire-and-forget)
    const filename = (data.storage_key as string).split("/").pop() ?? "file"
    void (async () => {
      try {
        const { data: fileBlob, error: dlErr } = await supabase.storage
          .from(CONTENT_LIBRARY_BUCKET)
          .download(data.storage_key as string)
        if (dlErr || !fileBlob)
          throw new Error("Failed to download file for re-scan")
        const buffer = await fileBlob.arrayBuffer()
        await submitVtScan(id, buffer, filename)
      } catch (err) {
        console.error("[content/items] retry-scan fetch error:", err)
        await supabase
          .from("content_items")
          .update({
            vt_scan_status: "error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .then(
            () => {},
            () => {}
          )
      }
    })()

    const signedPublicUrl = await signUrl(
      CONTENT_LIBRARY_BUCKET,
      updated.storage_key as string
    )
    const item = rowToContentItem(updated)
    return c.json({
      item: { ...item, publicUrl: signedPublicUrl || item.publicUrl },
    })
  }
)

/** Submits a file to VT and updates the DB row with the result. Best-effort. */
async function submitVtScan(
  itemId: string,
  buffer: ArrayBuffer,
  filename: string
): Promise<void> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) return
  try {
    const analysisId = await submitFileToVt(buffer, filename, apiKey)
    await supabase
      .from("content_items")
      .update({
        vt_scan_id: analysisId,
        vt_scan_status: "scanning",
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
  } catch (err) {
    console.error("[content/items] VT submit error:", err)
    try {
      await supabase
        .from("content_items")
        .update({
          vt_scan_status: "error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
    } catch {
      // Best-effort — ignore
    }
  }
}

function rowToContentItem(row: Record<string, unknown>): ContentItem {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    uploadedBy: row.uploaded_by as string | null,
    itemType: row.item_type as ContentItem["itemType"],
    title: row.title as string,
    description: row.description as string | null,
    storageKey: row.storage_key as string,
    publicUrl: row.public_url as string,
    mimeType: row.mime_type as string,
    fileSize: row.file_size as number,
    durationSec: row.duration_sec as number | null,
    width: row.width as number | null,
    height: row.height as number | null,
    folderId: row.folder_id as string | null,
    vtScanId: row.vt_scan_id as string | null,
    vtScanStatus:
      (row.vt_scan_status as ContentItem["vtScanStatus"]) ?? "not_required",
    vtScanUrl: row.vt_scan_url as string | null,
    vtScanStats: row.vt_scan_stats as ContentItem["vtScanStats"],
    vtScannedAt: row.vt_scanned_at as string | null,
    muxUploadId: row.mux_upload_id as string | null,
    muxAssetId: row.mux_asset_id as string | null,
    muxPlaybackId: row.mux_playback_id as string | null,
    videoStatus: (row.video_status as VideoStatus | null) ?? null,
    videoError: row.video_error as string | null,
  }
}
