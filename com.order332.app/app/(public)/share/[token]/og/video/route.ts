import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"
import { buildSignedMuxMp4Url } from "@/server/lib/mux-playback"

interface RouteParams {
  params: Promise<{ token: string }>
}

function notFoundResponse() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  })
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
  const signedMp4 = await buildSignedMuxMp4Url(playbackId)
  if (!signedMp4) {
    return notFoundResponse()
  }
  return Response.redirect(signedMp4.url, 302)
}
