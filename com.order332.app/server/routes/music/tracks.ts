import "server-only"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { requireAuth } from "@/server/middleware/auth"
import { requirePermission } from "@/server/middleware/rbac"
import { rateLimitByUser } from "@/server/middleware/rate-limit"
import { PERMISSIONS } from "@/lib/permissions"
import {
  MUSIC_TRACKS_BUCKET,
  MUSIC_AUDIO_ALLOWED_TYPES,
  MUSIC_COVER_ALLOWED_TYPES,
  generateMusicStorageKey,
  createMusicSignedUploadUrl,
} from "@/server/lib/music-upload"
import { supabase } from "@/server/db/supabase/client"
import { signUrls } from "@/server/lib/signed-url"
import type { HonoEnv, MusicTrack } from "@/server/lib/types"

export const musicTrackRoutes = new Hono<HonoEnv>()
musicTrackRoutes.use("*", requireAuth, requirePermission(PERMISSIONS.APP_MUSIC))

// GET /music/tracks — list all music tracks, optional ?genre= filter
musicTrackRoutes.get("/", async (c) => {
  const genre = c.req.query("genre")

  let query = supabase
    .from("music_tracks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)

  if (genre) {
    query = query.eq("genre", genre)
  }

  const { data, error } = await query

  if (error) {
    console.error("[music/tracks] list error:", error)
    return c.json({ error: "Failed to fetch tracks" }, 500)
  }

  const tracks: MusicTrack[] = (data ?? []).map(rowToMusicTrack)

  const keysToSign = tracks.flatMap(
    (t) =>
      [t.audioKey, t.coverKey ?? null, t.lyricsKey ?? null].filter(
        Boolean
      ) as string[]
  )
  const signed = await signUrls(MUSIC_TRACKS_BUCKET, keysToSign)
  const result = tracks.map((t) => ({
    ...t,
    audioUrl: signed.get(t.audioKey) ?? t.audioUrl,
    coverUrl: t.coverKey ? (signed.get(t.coverKey) ?? t.coverUrl) : t.coverUrl,
    lyricsUrl: t.lyricsKey
      ? (signed.get(t.lyricsKey) ?? t.lyricsUrl)
      : t.lyricsUrl,
  }))
  return c.json({ tracks: result })
})

// POST /music/tracks/upload-urls — get signed upload URLs for direct client-to-Supabase upload
// (bypasses Vercel's request body size limit)
musicTrackRoutes.post(
  "/upload-urls",
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  rateLimitByUser(10, 60_000),
  async (c) => {
    const user = c.get("user")
    let body: { files?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid JSON" }, 400)
    }

    if (
      !Array.isArray(body.files) ||
      body.files.length === 0 ||
      body.files.length > 3
    ) {
      return c.json({ error: "files must be an array of 1–3 items" }, 400)
    }

    const ALLOWED_PREFIXES = new Set(["audio", "covers", "lyrics"])
    const results: { prefix: string; storageKey: string; signedUrl: string }[] =
      []

    for (const file of body.files as unknown[]) {
      if (typeof file !== "object" || file === null)
        return c.json({ error: "Invalid file spec" }, 400)
      const { prefix, filename, contentType } = file as Record<string, unknown>

      if (typeof prefix !== "string" || !ALLOWED_PREFIXES.has(prefix)) {
        return c.json({ error: `Invalid prefix: ${String(prefix)}` }, 400)
      }
      if (typeof contentType !== "string") {
        return c.json({ error: "contentType is required" }, 400)
      }

      if (prefix === "audio" && !MUSIC_AUDIO_ALLOWED_TYPES.has(contentType)) {
        return c.json({ error: `Unsupported audio type: ${contentType}` }, 400)
      }
      if (prefix === "covers" && !MUSIC_COVER_ALLOWED_TYPES.has(contentType)) {
        return c.json({ error: `Unsupported cover type: ${contentType}` }, 400)
      }
      if (prefix === "lyrics") {
        const ok =
          contentType === "text/plain" ||
          contentType === "application/octet-stream"
        if (!ok) return c.json({ error: "Lyrics must be text/plain" }, 400)
      }

      const key = generateMusicStorageKey(
        prefix as "audio" | "covers" | "lyrics",
        user.id,
        contentType,
        typeof filename === "string" ? filename : "file"
      )
      try {
        const signedUrl = await createMusicSignedUploadUrl(key)
        results.push({ prefix, storageKey: key, signedUrl })
      } catch {
        return c.json({ error: "Failed to create upload URL" }, 500)
      }
    }

    return c.json({ urls: results })
  }
)

// POST /music/tracks — register a track after files have been uploaded via signed URLs
musicTrackRoutes.post(
  "/",
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  rateLimitByUser(5, 60_000),
  async (c) => {
    const user = c.get("user")
    let body: Record<string, unknown>
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Expected JSON body" }, 400)
    }

    const audioKey = typeof body.audioKey === "string" ? body.audioKey : null
    if (!audioKey) return c.json({ error: "audioKey is required" }, 400)
    if (!audioKey.startsWith(`audio/${user.id}/`))
      return c.json({ error: "Invalid audioKey" }, 403)

    const coverKey = typeof body.coverKey === "string" ? body.coverKey : null
    if (coverKey && !coverKey.startsWith(`covers/${user.id}/`))
      return c.json({ error: "Invalid coverKey" }, 403)

    const lyricsKey = typeof body.lyricsKey === "string" ? body.lyricsKey : null
    if (lyricsKey && !lyricsKey.startsWith(`lyrics/${user.id}/`))
      return c.json({ error: "Invalid lyricsKey" }, 403)

    const title =
      typeof body.title === "string" ? body.title.trim().slice(0, 200) : ""
    const artist =
      typeof body.artist === "string" ? body.artist.trim().slice(0, 200) : ""
    if (!title || !artist)
      return c.json({ error: "title and artist are required" }, 400)

    const album =
      typeof body.album === "string"
        ? body.album.trim().slice(0, 200) || null
        : null
    const genre =
      typeof body.genre === "string"
        ? body.genre.trim().slice(0, 100) || null
        : null
    const durationSec =
      typeof body.durationSec === "number"
        ? Math.max(0, Math.round(body.durationSec))
        : 0
    const lyricsType =
      body.lyricsType === "lrc" || body.lyricsType === "txt"
        ? body.lyricsType
        : null

    const audioUrl = supabase.storage
      .from(MUSIC_TRACKS_BUCKET)
      .getPublicUrl(audioKey).data.publicUrl
    const coverUrl = coverKey
      ? supabase.storage.from(MUSIC_TRACKS_BUCKET).getPublicUrl(coverKey).data
          .publicUrl
      : null
    const lyricsUrl = lyricsKey
      ? supabase.storage.from(MUSIC_TRACKS_BUCKET).getPublicUrl(lyricsKey).data
          .publicUrl
      : null

    const { data, error } = await supabase
      .from("music_tracks")
      .insert({
        uploaded_by: user.id,
        title,
        artist,
        album,
        genre,
        duration_sec: durationSec,
        audio_key: audioKey,
        audio_url: audioUrl,
        cover_key: coverKey,
        cover_url: coverUrl,
        lyrics_key: lyricsKey,
        lyrics_url: lyricsUrl,
        lyrics_type: lyricsType,
      })
      .select()
      .single()

    if (error || !data) {
      console.error("[music/tracks] register error:", error)
      return c.json({ error: "Failed to save track" }, 500)
    }

    const track = rowToMusicTrack(data)
    const keysToSign = [
      track.audioKey,
      track.coverKey ?? null,
      track.lyricsKey ?? null,
    ].filter(Boolean) as string[]
    const signed = await signUrls(MUSIC_TRACKS_BUCKET, keysToSign)
    return c.json(
      {
        track: {
          ...track,
          audioUrl: signed.get(track.audioKey) ?? track.audioUrl,
          coverUrl: track.coverKey
            ? (signed.get(track.coverKey) ?? track.coverUrl)
            : track.coverUrl,
          lyricsUrl: track.lyricsKey
            ? (signed.get(track.lyricsKey) ?? track.lyricsUrl)
            : track.lyricsUrl,
        },
      },
      201
    )
  }
)

// PATCH /music/tracks/:id — update track metadata (own items only, or superuser)
musicTrackRoutes.patch(
  "/:id",
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  async (c) => {
    const id = c.req.param("id")
    const user = c.get("user")

    let body: {
      title?: unknown
      artist?: unknown
      genre?: unknown
      album?: unknown
      coverKey?: unknown
      lyricsKey?: unknown
      lyricsType?: unknown
    }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid JSON" }, 400)
    }

    const title =
      typeof body.title === "string" ? body.title.trim().slice(0, 200) : ""
    const artist =
      typeof body.artist === "string" ? body.artist.trim().slice(0, 200) : ""
    const genre =
      typeof body.genre === "string"
        ? body.genre.trim().slice(0, 100) || null
        : null
    const album =
      typeof body.album === "string"
        ? body.album.trim().slice(0, 200) || null
        : null
    const coverKey = typeof body.coverKey === "string" ? body.coverKey : null
    const lyricsKey = typeof body.lyricsKey === "string" ? body.lyricsKey : null
    const lyricsType =
      body.lyricsType === "lrc" || body.lyricsType === "txt"
        ? body.lyricsType
        : null

    if (!title || !artist)
      return c.json({ error: "title and artist are required" }, 400)

    const { data: existing, error: fetchErr } = await supabase
      .from("music_tracks")
      .select("uploaded_by")
      .eq("id", id)
      .single()
    if (fetchErr || !existing) return c.json({ error: "Track not found" }, 404)

    const isSuperuser = user.permissions === "*"
    if (!isSuperuser && existing.uploaded_by !== user.id)
      return c.json({ error: "Forbidden" }, 403)

    const updates: Record<string, unknown> = {
      title,
      artist,
      album,
      genre,
      updated_at: new Date().toISOString(),
    }

    if (coverKey) {
      if (!coverKey.startsWith(`covers/${user.id}/`)) {
        return c.json({ error: "Invalid coverKey" }, 403)
      }
      const coverUrl = supabase.storage
        .from(MUSIC_TRACKS_BUCKET)
        .getPublicUrl(coverKey).data.publicUrl
      updates.cover_key = coverKey
      updates.cover_url = coverUrl
    }

    if (lyricsKey) {
      if (!lyricsKey.startsWith(`lyrics/${user.id}/`)) {
        return c.json({ error: "Invalid lyricsKey" }, 403)
      }
      if (!lyricsType) {
        return c.json(
          { error: "lyricsType is required when uploading lyrics" },
          400
        )
      }
      const lyricsUrl = supabase.storage
        .from(MUSIC_TRACKS_BUCKET)
        .getPublicUrl(lyricsKey).data.publicUrl
      updates.lyrics_key = lyricsKey
      updates.lyrics_url = lyricsUrl
      updates.lyrics_type = lyricsType
    }

    const { data, error } = await supabase
      .from("music_tracks")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error || !data) {
      console.error("[music/tracks] update error:", error)
      return c.json({ error: "Update failed" }, 500)
    }

    return c.json({ track: rowToMusicTrack(data) })
  }
)

// DELETE /music/tracks/:id — delete a track (own items only, or superuser)
musicTrackRoutes.delete(
  "/:id",
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  async (c) => {
    const id = c.req.param("id")
    const user = c.get("user")

    const { data, error } = await supabase
      .from("music_tracks")
      .select("id, audio_key, cover_key, lyrics_key, uploaded_by")
      .eq("id", id)
      .single()

    if (error || !data) {
      return c.json({ error: "Track not found" }, 404)
    }

    const isSuperuser = user.permissions === "*"
    if (!isSuperuser && data.uploaded_by !== user.id) {
      return c.json({ error: "Forbidden" }, 403)
    }

    const keysToDelete = [
      data.audio_key,
      data.cover_key,
      data.lyrics_key,
    ].filter(Boolean) as string[]
    if (keysToDelete.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("music-tracks")
        .remove(keysToDelete)
      if (storageError) {
        console.error("[music/tracks] storage delete error:", storageError)
      }
    }

    const { error: deleteError } = await supabase
      .from("music_tracks")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("[music/tracks] db delete error:", deleteError)
      return c.json({ error: "Delete failed" }, 500)
    }

    return c.json({ ok: true })
  }
)

// GET /music/tracks/lyrics/search — proxy LRCLIB fetch, stream result via SSE
musicTrackRoutes.get("/lyrics/search", async (c) => {
  const trackName = (c.req.query("track_name") ?? "").trim()
  const artistName = (c.req.query("artist_name") ?? "").trim()
  const albumName = (c.req.query("album_name") ?? "").trim()
  const duration = Math.round(Number(c.req.query("duration") ?? "0"))

  if (!trackName || duration === 0) {
    return c.json({ error: "track_name and duration are required" }, 400)
  }

  return streamSSE(c, async (stream) => {
    const url = new URL("https://lrclib.net/api/get")
    url.searchParams.set("track_name", trackName)
    if (artistName) url.searchParams.set("artist_name", artistName)
    if (albumName) url.searchParams.set("album_name", albumName)
    url.searchParams.set("duration", String(duration))

    try {
      const res = await fetch(url.toString(), {
        headers: { "Lrclib-Client": "order332/1.0 (https://order332.com)" },
      })
      if (res.status === 404) {
        await stream.writeSSE({ event: "not_found", data: "" })
        return
      }
      if (!res.ok) {
        await stream.writeSSE({ event: "error", data: String(res.status) })
        return
      }
      const data = (await res.json()) as {
        syncedLyrics?: string | null
        plainLyrics?: string | null
        instrumental?: boolean
      }
      await stream.writeSSE({
        event: "result",
        data: JSON.stringify({
          syncedLyrics: data.syncedLyrics ?? null,
          plainLyrics: data.plainLyrics ?? null,
          instrumental: data.instrumental ?? false,
        }),
      })
    } catch {
      await stream.writeSSE({ event: "error", data: "fetch_failed" })
    }
  })
})

// GET /music/tracks/:id/lyrics — fetch lyrics content
musicTrackRoutes.get("/:id/lyrics", async (c) => {
  const id = c.req.param("id")

  const { data, error } = await supabase
    .from("music_tracks")
    .select("lyrics_key, lyrics_type")
    .eq("id", id)
    .single()

  if (error || !data) {
    return c.json({ error: "Track not found" }, 404)
  }

  if (!data.lyrics_key) {
    return c.json({ error: "No lyrics available" }, 404)
  }

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(MUSIC_TRACKS_BUCKET)
      .download(data.lyrics_key as string)
    if (dlErr || !blob) {
      return c.json({ error: "Failed to fetch lyrics" }, 502)
    }
    const content = await blob.text()
    return c.json({ content, type: data.lyrics_type ?? "txt" })
  } catch (err) {
    console.error("[music/tracks] lyrics fetch error:", err)
    return c.json({ error: "Failed to fetch lyrics" }, 500)
  }
})

function rowToMusicTrack(row: Record<string, unknown>): MusicTrack {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    uploadedBy: row.uploaded_by as string | null,
    title: row.title as string,
    artist: row.artist as string,
    album: (row.album as string | null) ?? null,
    genre: row.genre as string | null,
    durationSec: row.duration_sec as number,
    audioKey: row.audio_key as string,
    audioUrl: row.audio_url as string,
    coverKey: row.cover_key as string | null,
    coverUrl: row.cover_url as string | null,
    lyricsKey: row.lyrics_key as string | null,
    lyricsUrl: row.lyrics_url as string | null,
    lyricsType: row.lyrics_type as "lrc" | "txt" | null,
  }
}
