import "server-only"
import { Hono } from "hono"
import { z } from "zod"
import { requireAuth } from "@/server/middleware/auth"
import { requirePermission } from "@/server/middleware/rbac"
import { PERMISSIONS } from "@/lib/permissions"
import { db } from "@/server/db"
import { supabase } from "@/server/db/supabase/client"
import { signUrls } from "@/server/lib/signed-url"
import { MUSIC_TRACKS_BUCKET } from "@/server/lib/music-upload"
import type { HonoEnv } from "@/server/lib/types"

export const musicPlaylistRoutes = new Hono<HonoEnv>()
musicPlaylistRoutes.use(
  "*",
  requireAuth,
  requirePermission(PERMISSIONS.APP_MUSIC)
)

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
})

const reorderSchema = z.object({
  order: z.array(z.string()).min(1),
})

// GET /music/playlists — includes first 4 signed cover URLs per playlist for the 2x2 grid
musicPlaylistRoutes.get("/", async (c) => {
  const playlists = await db.listMusicPlaylists()
  if (playlists.length === 0) return c.json({ playlists })

  // Fetch junction rows for all playlists
  const playlistIds = playlists.map((p) => p.id)
  const { data: ptRows } = await supabase
    .from("music_playlist_tracks")
    .select("playlist_id, track_id")
    .in("playlist_id", playlistIds)

  // Group all track IDs per playlist (in arrival order)
  const trackIdsByPlaylist = new Map<string, string[]>()
  for (const row of ptRows ?? []) {
    const arr = trackIdsByPlaylist.get(row.playlist_id) ?? []
    arr.push(row.track_id)
    trackIdsByPlaylist.set(row.playlist_id, arr)
  }

  const allTrackIds = [...new Set([...trackIdsByPlaylist.values()].flat())]
  const coverKeysByTrack = new Map<string, string>()
  if (allTrackIds.length > 0) {
    const { data: trackRows } = await supabase
      .from("music_tracks")
      .select("id, cover_key")
      .in("id", allTrackIds)
      .not("cover_key", "is", null)
    for (const row of trackRows ?? []) {
      if (row.cover_key) coverKeysByTrack.set(row.id, row.cover_key)
    }
  }

  // Build cover keys per playlist (prefer tracks that have art)
  const coverKeysByPlaylist = new Map<string, string[]>()
  for (const [playlistId, trackIds] of trackIdsByPlaylist) {
    const keys = trackIds
      .map((id) => coverKeysByTrack.get(id))
      .filter(Boolean) as string[]
    const topKeys = keys.slice(0, 4)
    if (topKeys.length > 0) coverKeysByPlaylist.set(playlistId, topKeys)
  }

  const allCoverKeys = [...new Set([...coverKeysByPlaylist.values()].flat())]
  const signed =
    allCoverKeys.length > 0
      ? await signUrls(MUSIC_TRACKS_BUCKET, allCoverKeys)
      : new Map<string, string>()

  return c.json({
    playlists: playlists.map((p) => ({
      ...p,
      coverUrls: (coverKeysByPlaylist.get(p.id) ?? [])
        .map((k) => signed.get(k))
        .filter(Boolean) as string[],
    })),
  })
})

// POST /music/playlists
musicPlaylistRoutes.post("/", async (c) => {
  const user = c.get("user")
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const playlist = await db.createMusicPlaylist({
    createdBy: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  })
  return c.json({ playlist }, 201)
})

// GET /music/playlists/:id — with signed track URLs
musicPlaylistRoutes.get("/:id", async (c) => {
  const id = c.req.param("id")
  const playlist = await db.getMusicPlaylist(id)
  if (!playlist) return c.json({ error: "Playlist not found" }, 404)

  const keysToSign = playlist.tracks.flatMap(
    (t) =>
      [t.audioKey, t.coverKey ?? null, t.lyricsKey ?? null].filter(
        Boolean
      ) as string[]
  )
  const signed =
    keysToSign.length > 0
      ? await signUrls(MUSIC_TRACKS_BUCKET, keysToSign)
      : new Map<string, string>()

  const tracks = playlist.tracks.map((t) => ({
    id: t.id,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    uploadedBy: t.uploadedBy,
    title: t.title,
    artist: t.artist,
    album: t.album ?? null,
    genre: t.genre ?? null,
    durationSec: t.durationSec,
    audioUrl: signed.get(t.audioKey) ?? t.audioUrl,
    coverUrl: t.coverKey ? (signed.get(t.coverKey) ?? t.coverUrl) : t.coverUrl,
    lyricsUrl: t.lyricsKey
      ? (signed.get(t.lyricsKey) ?? t.lyricsUrl)
      : t.lyricsUrl,
    lyricsType: t.lyricsType ?? null,
  }))

  return c.json({ playlist: { ...playlist, tracks } })
})

// PATCH /music/playlists/:id — creator or superuser only
musicPlaylistRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id")
  const user = c.get("user")
  const body = await c.req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const existing = await db.getMusicPlaylist(id)
  if (!existing) return c.json({ error: "Playlist not found" }, 404)

  if (user.permissions !== "*" && existing.createdBy !== user.id) {
    return c.json({ error: "Forbidden" }, 403)
  }

  const playlist = await db.updateMusicPlaylist(id, {
    name: parsed.data.name,
    description: parsed.data.description,
  })
  return c.json({ playlist })
})

musicPlaylistRoutes.patch("/:id/tracks/order", async (c) => {
  const id = c.req.param("id")
  const user = c.get("user")
  const parsed = reorderSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400)

  const playlist = await db.getMusicPlaylist(id)
  if (!playlist) return c.json({ error: "Playlist not found" }, 404)

  if (user.permissions !== "*" && playlist.createdBy !== user.id) {
    return c.json({ error: "Forbidden" }, 403)
  }

  const currentIds = playlist.tracks.map((t) => t.id)
  const order = parsed.data.order
  if (
    order.length !== currentIds.length ||
    !order.every((trackId) => currentIds.includes(trackId))
  ) {
    return c.json({ error: "Order must include every track once" }, 400)
  }

  try {
    await db.reorderMusicPlaylistTracks(id, order)
  } catch (err) {
    console.error("[music/playlists] reorder error", err)
    return c.json({ error: "Failed to reorder tracks" }, 500)
  }

  return c.json({ ok: true })
})

// DELETE /music/playlists/:id — creator or superuser only
musicPlaylistRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id")
  const user = c.get("user")

  const existing = await db.getMusicPlaylist(id)
  if (!existing) return c.json({ error: "Playlist not found" }, 404)

  if (user.permissions !== "*" && existing.createdBy !== user.id) {
    return c.json({ error: "Forbidden" }, 403)
  }

  await db.deleteMusicPlaylist(id)
  return c.json({ ok: true })
})

// POST /music/playlists/:id/tracks — any app.music user
musicPlaylistRoutes.post("/:id/tracks", async (c) => {
  const playlistId = c.req.param("id")
  const body = await c.req.json().catch(() => null)
  const trackId = typeof body?.trackId === "string" ? body.trackId : null
  if (!trackId) return c.json({ error: "trackId is required" }, 400)

  const { data: pl } = await supabase
    .from("music_playlists")
    .select("id")
    .eq("id", playlistId)
    .single()
  if (!pl) return c.json({ error: "Playlist not found" }, 404)

  const { data: tr } = await supabase
    .from("music_tracks")
    .select("id")
    .eq("id", trackId)
    .single()
  if (!tr) return c.json({ error: "Track not found" }, 404)

  await db.addTrackToPlaylist(playlistId, trackId)
  return c.json({ ok: true })
})

// DELETE /music/playlists/:id/tracks/:trackId — any app.music user
musicPlaylistRoutes.delete("/:id/tracks/:trackId", async (c) => {
  const playlistId = c.req.param("id")
  const trackId = c.req.param("trackId")
  await db.removeTrackFromPlaylist(playlistId, trackId)
  return c.json({ ok: true })
})
