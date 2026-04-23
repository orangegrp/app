import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"
import { signMusicGetUrl } from "@/server/lib/music-r2"
import { ContentSharePageClient } from "./ContentSharePageClient"
import { SharePageClient as MusicSharePageClient } from "./SharePageClient"

interface Props {
  params: Promise<{ token: string }>
}

function buildInternalContentPath(
  contentItemId: string,
  folderId: string | null
): string {
  const params = new URLSearchParams({ item: contentItemId })
  if (folderId) params.set("folder", folderId)
  return `/content?${params.toString()}`
}

async function getMusicShareData(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null

  const link = await db.getMusicShareLinkByToken(token)
  if (!link) return null

  const { data: trackRow, error } = await supabase
    .from("music_tracks")
    .select("id, title, artist, genre, duration_sec, audio_key, cover_key")
    .eq("id", link.trackId)
    .single()

  if (error || !trackRow) return null

  const row = trackRow as {
    id: string
    title: string
    artist: string
    genre: string | null
    duration_sec: number
    audio_key: string
    cover_key: string | null
  }

  const signedCover = row.cover_key
    ? await signMusicGetUrl(row.cover_key, 3600)
    : ""
  const coverUrl = signedCover || null

  return { kind: "music" as const, link, track: row, coverUrl }
}

async function getContentShareData(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null

  const link = await db.getContentShareLinkByToken(token)
  if (!link) return null

  const { data: itemRow, error } = await supabase
    .from("content_items")
    .select(
      "id, item_type, title, description, mime_type, file_size, folder_id, width, height, vt_scan_status, video_status, mux_playback_id"
    )
    .eq("id", link.contentItemId)
    .single()

  if (error || !itemRow) return null

  return {
    kind: "content" as const,
    link,
    item: {
      id: itemRow.id as string,
      itemType: itemRow.item_type as
        | "image"
        | "audio"
        | "pdf"
        | "download"
        | "video",
      title: itemRow.title as string,
      description: (itemRow.description as string | null) ?? null,
      mimeType: itemRow.mime_type as string,
      fileSize: Number(itemRow.file_size),
      folderId: (itemRow.folder_id as string | null) ?? null,
      width: (itemRow.width as number | null) ?? null,
      height: (itemRow.height as number | null) ?? null,
      vtScanStatus: (itemRow.vt_scan_status as string | null) ?? "not_required",
      videoStatus: (itemRow.video_status as string | null) ?? null,
      muxPlaybackId: (itemRow.mux_playback_id as string | null) ?? null,
    },
  }
}

async function getUnifiedShareData(token: string) {
  const music = await getMusicShareData(token)
  if (music) return music
  return getContentShareData(token)
}

function sanitizeMetaText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const data = await getUnifiedShareData(token)

  if (!data) {
    return {
      title: "Shared content not found — 332",
      description: "This share link is invalid or has expired.",
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.332.fm"
  const pageUrl = `${appUrl}/share/${token}`

  if (data.kind === "music") {
    const { track, coverUrl } = data
    const title = sanitizeMetaText(`${track.title} — ${track.artist}`)
    const description = sanitizeMetaText(
      [track.genre, "Shared via 332"].filter(Boolean).join(" · ")
    )

    return {
      title: `${title} — 332`,
      description,
      openGraph: {
        title,
        description,
        url: pageUrl,
        siteName: "332",
        type: "music.song",
        ...(coverUrl
          ? {
              images: [
                {
                  url: coverUrl,
                  width: 1200,
                  height: 1200,
                  alt: `${track.title} album art`,
                },
              ],
            }
          : {}),
      },
      twitter: {
        card: coverUrl ? "summary_large_image" : "summary",
        title,
        description,
        ...(coverUrl ? { images: [coverUrl] } : {}),
      },
    }
  }

  const itemLabel = data.item.itemType === "video" ? "video" : "file"
  const title = sanitizeMetaText(`${data.item.title} — Shared ${itemLabel}`)
  const description = sanitizeMetaText(
    data.item.description ?? `Shared ${itemLabel} via 332`
  )

  if (
    data.item.itemType === "video" &&
    data.link.mode === "external" &&
    data.link.expiresAt === null &&
    data.item.muxPlaybackId
  ) {
    const ogVideoUrl = `${appUrl}/share/${token}/og/video`
    const ogImageUrl = `${appUrl}/share/${token}/og/image`
    const width = data.item.width ?? 1280
    const height = data.item.height ?? 720

    return {
      title: `${title} — 332`,
      description,
      openGraph: {
        title,
        description,
        url: pageUrl,
        siteName: "332",
        type: "video.other",
        images: [
          {
            url: ogImageUrl,
            width,
            height,
            alt: `${title} preview`,
          },
        ],
        videos: [
          {
            url: ogVideoUrl,
            secureUrl: ogVideoUrl,
            type: "video/mp4",
            width,
            height,
          },
        ],
      },
      twitter: {
        card: "player",
        title,
        description,
      },
      other: {
        "twitter:player": pageUrl,
        "twitter:player:width": String(width),
        "twitter:player:height": String(height),
      },
    }
  }

  return {
    title: `${title} — 332`,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "332",
      type: data.item.itemType === "video" ? "video.other" : "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  }
}

export default async function SharePage({ params }: Props) {
  const { token } = await params
  const data = await getUnifiedShareData(token)

  if (!data) notFound()

  if (data.kind === "music") {
    return (
      <MusicSharePageClient
        token={token}
        trackId={data.track.id}
        initialTitle={data.track.title}
        initialArtist={data.track.artist}
        initialGenre={data.track.genre}
        initialCoverUrl={data.coverUrl}
        expiresAt={data.link.expiresAt}
      />
    )
  }

  const internalPath = buildInternalContentPath(
    data.item.id,
    data.item.folderId
  )

  return (
    <ContentSharePageClient
      token={token}
      mode={data.link.mode}
      expiresAt={data.link.expiresAt}
      item={{
        id: data.item.id,
        itemType: data.item.itemType,
        title: data.item.title,
        description: data.item.description,
        fileSize: data.item.fileSize,
        width: data.item.width,
        height: data.item.height,
      }}
      internalPath={internalPath}
    />
  )
}
