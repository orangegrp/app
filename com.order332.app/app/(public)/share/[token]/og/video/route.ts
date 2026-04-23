import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"
import { signMuxPlaybackToken } from "@/server/lib/mux-playback"

interface RouteParams {
  params: Promise<{ token: string }>
}

function notFoundResponse() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  })
}

async function isPlayableVideoUrl(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
    })
    if (head.ok) return true
    if (head.status !== 405) return false
  } catch {
    return false
  }

  try {
    const get = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      redirect: "follow",
      cache: "no-store",
    })
    return get.ok || get.status === 206
  } catch {
    return false
  }
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return notFoundResponse()

  const link = await db.getContentShareLinkByToken(token)
  if (!link || link.mode !== "external" || link.expiresAt !== null) {
    return notFoundResponse()
  }

  const { data: row, error } = await supabase
    .from("content_items")
    .select("item_type, video_status, mux_playback_id")
    .eq("id", link.contentItemId)
    .single()

  if (error || !row) return notFoundResponse()
  if (
    (row.item_type as string) !== "video" ||
    (row.video_status as string | null) !== "ready" ||
    !(row.mux_playback_id as string | null)
  ) {
    return notFoundResponse()
  }

  const playbackId = row.mux_playback_id as string
  const { token: playbackToken } = await signMuxPlaybackToken(playbackId, "v")
  const tokenParam = `token=${encodeURIComponent(playbackToken)}`
  const candidates = [
    `https://stream.mux.com/${playbackId}/high.mp4?${tokenParam}`,
    `https://stream.mux.com/${playbackId}/medium.mp4?${tokenParam}`,
    `https://stream.mux.com/${playbackId}/low.mp4?${tokenParam}`,
    `https://stream.mux.com/${playbackId}.mp4?${tokenParam}`,
  ]

  for (const candidate of candidates) {
    if (await isPlayableVideoUrl(candidate)) {
      return Response.redirect(candidate, 302)
    }
  }

  const fallbackHls = `https://stream.mux.com/${playbackId}.m3u8?${tokenParam}`
  return Response.redirect(fallbackHls, 302)
}
