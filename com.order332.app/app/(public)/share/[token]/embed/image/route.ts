import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"

interface RouteParams {
  params: Promise<{ token: string }>
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return new Response("Not found", { status: 404 })
  }

  const link = await db.getContentShareLinkByToken(token)
  if (!link || link.mode !== "external") {
    return new Response("Not found", { status: 404 })
  }

  const { data: row, error } = await supabase
    .from("content_items")
    .select("item_type, mime_type, public_url")
    .eq("id", link.contentItemId)
    .single()

  if (error || !row) return new Response("Not found", { status: 404 })

  const itemType = row.item_type as string
  const mimeType = row.mime_type as string
  const sourceUrl = row.public_url as string

  if (itemType !== "image" && !mimeType.startsWith("image/")) {
    return new Response("Not found", { status: 404 })
  }

  const upstream = await fetch(sourceUrl)
  if (!upstream.ok || !upstream.body) {
    return new Response("Image unavailable", { status: 502 })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/*",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  })
}
