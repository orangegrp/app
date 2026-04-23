import "server-only"
import { randomBytes } from "crypto"
import { Hono } from "hono"
import { z } from "zod"
import { requireAuth } from "@/server/middleware/auth"
import { requirePermission } from "@/server/middleware/rbac"
import { rateLimit, rateLimitByUser } from "@/server/middleware/rate-limit"
import { PERMISSIONS } from "@/lib/permissions"
import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"
import { CONTENT_LIBRARY_BUCKET } from "@/server/lib/content-upload"
import { buildSignedMuxHlsUrl } from "@/server/lib/mux-playback"
import { signUrl } from "@/server/lib/signed-url"
import type { HonoEnv, VideoStatus, VtScanStatus } from "@/server/lib/types"

function generateShareToken(): string {
  return randomBytes(32).toString("base64url")
}

function computeExpiresAt(expiresIn: "24h" | "7d" | "never"): Date | null {
  if (expiresIn === "never") return null
  const ms = expiresIn === "24h" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  return new Date(Date.now() + ms)
}

function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://app.332.fm"
}

const createShareSchema = z.object({
  contentItemId: z.string().uuid(),
  mode: z.enum(["internal", "external"]),
  expiresIn: z.enum(["24h", "7d", "never"]),
})

export const contentShareAuthRoutes = new Hono<HonoEnv>()
contentShareAuthRoutes.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.APP_CONTENT),
  rateLimitByUser(30, 60_000),
  async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createShareSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

    const { contentItemId, mode, expiresIn } = parsed.data

    const { data: item, error: itemErr } = await supabase
      .from("content_items")
      .select("id, item_type, title, vt_scan_status, video_status")
      .eq("id", contentItemId)
      .single()

    if (itemErr || !item) return c.json({ error: "Item not found" }, 404)

    const itemType = item.item_type as string
    const vtStatus = item.vt_scan_status as VtScanStatus | null
    const videoStatus = item.video_status as VideoStatus | null

    if (mode === "external") {
      if (itemType === "video") {
        if (videoStatus !== "ready") {
          return c.json({ error: "Video is still processing" }, 409)
        }
      } else if (vtStatus !== "clean") {
        return c.json(
          { error: "External sharing is only allowed after a clean scan" },
          409
        )
      }
    }

    const authUser = c.get("user")
    const token = generateShareToken()
    const link = await db.createContentShareLink({
      token,
      contentItemId,
      mode,
      createdBy: authUser.id,
      expiresAt: computeExpiresAt(expiresIn),
    })

    return c.json(
      {
        token: link.token,
        shareUrl: `${getAppBaseUrl()}/share/${link.token}`,
        expiresAt: link.expiresAt,
      },
      201
    )
  }
)

export const contentSharePublicRoutes = new Hono<HonoEnv>()
contentSharePublicRoutes.use("*", rateLimit(60, 60_000))

contentSharePublicRoutes.get("/:token", async (c) => {
  const token = c.req.param("token")
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return c.json({ error: "Invalid share link" }, 404)
  }

  const link = await db.getContentShareLinkByToken(token)
  if (!link) return c.json({ error: "Share link not found or expired" }, 404)

  const { data: item, error } = await supabase
    .from("content_items")
    .select(
      "id, item_type, title, description, mime_type, file_size, folder_id, width, height, vt_scan_status, video_status"
    )
    .eq("id", link.contentItemId)
    .single()

  if (error || !item) return c.json({ error: "Item not found" }, 404)

  return c.json({
    link,
    item: {
      id: item.id as string,
      itemType: item.item_type as string,
      title: item.title as string,
      description: (item.description as string | null) ?? null,
      mimeType: item.mime_type as string,
      fileSize: Number(item.file_size),
      folderId: (item.folder_id as string | null) ?? null,
      width: (item.width as number | null) ?? null,
      height: (item.height as number | null) ?? null,
      vtScanStatus:
        (item.vt_scan_status as VtScanStatus | null) ?? "not_required",
      videoStatus: (item.video_status as VideoStatus | null) ?? null,
    },
  })
})

contentSharePublicRoutes.post("/:token/video/source", async (c) => {
  const token = c.req.param("token")
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return c.json({ error: "Invalid share link" }, 404)
  }

  const link = await db.getContentShareLinkByToken(token)
  if (!link) return c.json({ error: "Share link not found or expired" }, 404)
  if (link.mode !== "external") return c.json({ error: "Forbidden" }, 403)

  const { data, error } = await supabase
    .from("content_items")
    .select("item_type, mux_playback_id, video_status")
    .eq("id", link.contentItemId)
    .single()
  if (error || !data) return c.json({ error: "Item not found" }, 404)

  if (data.item_type !== "video") {
    return c.json({ error: "Item is not a video" }, 400)
  }

  const videoStatus = data.video_status as VideoStatus | null
  const playbackId = (data.mux_playback_id as string | null) ?? null
  if (videoStatus !== "ready" || !playbackId) {
    return c.json({ error: "Video is still processing" }, 409)
  }

  try {
    return c.json(await buildSignedMuxHlsUrl(playbackId))
  } catch (err) {
    console.error("[content/share] sign video source error:", err)
    return c.json({ error: "Failed to sign playback URL" }, 500)
  }
})

contentSharePublicRoutes.post("/:token/download-url", async (c) => {
  const token = c.req.param("token")
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return c.json({ error: "Invalid share link" }, 404)
  }

  const link = await db.getContentShareLinkByToken(token)
  if (!link) return c.json({ error: "Share link not found or expired" }, 404)
  if (link.mode !== "external") return c.json({ error: "Forbidden" }, 403)

  const { data, error } = await supabase
    .from("content_items")
    .select("item_type, storage_key, vt_scan_status")
    .eq("id", link.contentItemId)
    .single()
  if (error || !data) return c.json({ error: "Item not found" }, 404)

  const itemType = data.item_type as string
  if (itemType === "video") {
    return c.json(
      { error: "Video downloads are not available on public links" },
      403
    )
  }

  const vtStatus = data.vt_scan_status as VtScanStatus | null
  if (vtStatus !== "clean") {
    return c.json({ error: "Download is unavailable for this file" }, 403)
  }

  const storageKey = data.storage_key as string
  const url = await signUrl(CONTENT_LIBRARY_BUCKET, storageKey, 3600)
  if (!url) return c.json({ error: "Failed to prepare download" }, 500)
  return c.json({ url, expiresInSec: 3600 })
})
