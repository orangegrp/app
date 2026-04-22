import "server-only"
import { Hono } from "hono"
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { generateText } from "ai"
import { requireAuth } from "@/server/middleware/auth"
import { requirePermission } from "@/server/middleware/rbac"
import { checkRateLimit, rateLimitByUser } from "@/server/middleware/rate-limit"
import { PERMISSIONS } from "@/lib/permissions"
import {
  AI_LYRICS_ALLOWED_LANGUAGE_CODES,
  type AiLyricsLanguageCode,
} from "@/lib/lyrics-ai-languages"
import {
  MUSIC_ASSET_URL_PLACEHOLDER,
  MUSIC_AUDIO_ALLOWED_TYPES,
  MUSIC_COVER_ALLOWED_TYPES,
  generateMusicStorageKey,
  createMusicSignedUploadUrl,
} from "@/server/lib/music-upload"
import {
  deleteMusicObjects,
  getMusicObjectText,
  signMusicGetUrl,
  signMusicGetUrls,
  signMusicPutUrl,
} from "@/server/lib/music-r2"
import { supabase } from "@/server/db/supabase/client"
import type { HonoEnv, MusicTrack } from "@/server/lib/types"

export const musicTrackRoutes = new Hono<HonoEnv>()
musicTrackRoutes.use("*", requireAuth, requirePermission(PERMISSIONS.APP_MUSIC))

const AI_LYRICS_TMP_PREFIX = "tmp/lyrics-ai"
const AI_LYRICS_MAX_AUDIO_BYTES = 250 * 1024 * 1024
const AI_LYRICS_MAX_DURATION_SEC = 60 * 20
const AI_LYRICS_MODEL = "openai/gpt-5.4-nano" as const
const AUDIO_EXTS_ALLOWED_FOR_AI = new Set([
  ".mp3",
  ".ogg",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".opus",
])

type ElevenWord = {
  text: string
  start?: number | null
  end?: number | null
  type?: string
}

type ElevenChunk = {
  text?: string
  words?: ElevenWord[]
}

type LyricsAiLanguage = AiLyricsLanguageCode

function jsonError(
  c: Context<HonoEnv>,
  code: string,
  error: string,
  status: number
) {
  return c.json({ code, error }, status as 400)
}

function extFromFilename(filename: string): string {
  const idx = filename.lastIndexOf(".")
  if (idx < 0) return ""
  return filename.slice(idx).toLowerCase()
}

function formatLrcTimestamp(ms: number): string {
  const safe = Math.max(0, Math.round(ms))
  const mm = Math.floor(safe / 60_000)
  const ss = Math.floor((safe % 60_000) / 1_000)
  const cs = Math.floor((safe % 1_000) / 10)
  return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`
}

function isValidLrc(content: string): boolean {
  const rows = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  if (rows.length === 0) return false
  return rows.every((line) => /\[\d{2}:\d{2}\.\d{2}\].+/.test(line))
}

function normalizeLyricsLine(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

function buildLrcFromWords(words: ElevenWord[]): string | null {
  const wordTokens = words
    .filter((word) => word.type !== "spacing")
    .map((word) => ({
      text: normalizeLyricsLine(word.text ?? ""),
      startMs:
        typeof word.start === "number" && Number.isFinite(word.start)
          ? Math.max(0, Math.round(word.start * 1000))
          : null,
      endMs:
        typeof word.end === "number" && Number.isFinite(word.end)
          ? Math.max(0, Math.round(word.end * 1000))
          : null,
    }))
    .filter((word) => word.text.length > 0 && word.startMs !== null)

  if (wordTokens.length === 0) return null

  const lines: Array<{ startMs: number; text: string }> = []
  let currentWords: string[] = []
  let currentStartMs: number | null = null
  let currentChars = 0
  let previousEndMs: number | null = null

  const flush = () => {
    if (currentStartMs === null || currentWords.length === 0) return
    const text = normalizeLyricsLine(currentWords.join(" "))
    if (text) lines.push({ startMs: currentStartMs, text })
    currentWords = []
    currentStartMs = null
    currentChars = 0
  }

  for (const token of wordTokens) {
    const startMs = token.startMs!
    const gapMs = previousEndMs === null ? 0 : startMs - previousEndMs
    const shouldBreakBefore = currentWords.length > 0 && gapMs > 1400
    if (shouldBreakBefore) flush()

    if (currentStartMs === null) currentStartMs = startMs
    currentWords.push(token.text)
    currentChars += token.text.length + 1

    const punctBreak = /[.!?。！？]$/.test(token.text)
    const sizeBreak = currentWords.length >= 11 || currentChars >= 56
    if (punctBreak || sizeBreak) flush()

    previousEndMs = token.endMs ?? startMs
  }

  flush()
  if (lines.length === 0) return null
  return lines
    .map((line) => `${formatLrcTimestamp(line.startMs)}${line.text}`)
    .join("\n")
}

function buildLrcFromText(text: string): string | null {
  const parts = text
    .split(/\r?\n/)
    .map((line) => normalizeLyricsLine(line))
    .filter(Boolean)
  if (parts.length === 0) return null
  return parts
    .map((line, idx) => `${formatLrcTimestamp(idx * 2500)}${line}`)
    .join("\n")
}

function extractElevenWords(payload: unknown): {
  words: ElevenWord[]
  text: string
} {
  if (typeof payload !== "object" || payload === null) {
    return { words: [], text: "" }
  }

  const single = payload as ElevenChunk
  if (Array.isArray(single.words)) {
    return {
      words: single.words,
      text: typeof single.text === "string" ? single.text : "",
    }
  }

  const multi = payload as { transcripts?: ElevenChunk[] }
  if (!Array.isArray(multi.transcripts)) {
    return { words: [], text: "" }
  }

  const words = multi.transcripts.flatMap((chunk) =>
    Array.isArray(chunk.words) ? chunk.words : []
  )
  const text = multi.transcripts
    .map((chunk) => (typeof chunk.text === "string" ? chunk.text : ""))
    .filter(Boolean)
    .join("\n")
  return {
    words: words.sort(
      (a, b) =>
        (a.start ?? Number.MAX_SAFE_INTEGER) -
        (b.start ?? Number.MAX_SAFE_INTEGER)
    ),
    text,
  }
}

function normalizeAiLanguageCode(input: unknown): LyricsAiLanguage {
  if (typeof input !== "string") return "en"
  const value = input.trim().toLowerCase()
  if (!AI_LYRICS_ALLOWED_LANGUAGE_CODES.has(value as LyricsAiLanguage)) {
    return "en"
  }
  return value as LyricsAiLanguage
}

function assertElevenLabsConfigured() {
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    throw new Error("ElevenLabs is not configured")
  }
}

async function repairLrcWithGateway(input: string): Promise<string> {
  if (isValidLrc(input)) return input
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) return input

  try {
    const { text } = await generateText({
      model: AI_LYRICS_MODEL,
      maxOutputTokens: 3500,
      prompt:
        "You normalize LRC timing text. Return only valid LRC lines in format [mm:ss.xx]lyrics. Keep original words and approximate timing intent. Do not add commentary. If timestamps are missing, create reasonable monotonically increasing timestamps. Input:\n" +
        input,
    })
    return isValidLrc(text.trim()) ? text.trim() : input
  } catch {
    return input
  }
}

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
  const signed = await signMusicGetUrls(keysToSign)
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

// GET /music/tracks/:id/source — refresh signed playback/source URLs for one track
musicTrackRoutes.get("/:id/source", rateLimitByUser(120, 60_000), async (c) => {
  const id = c.req.param("id")

  const { data, error } = await supabase
    .from("music_tracks")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !data) {
    return c.json({ error: "Track not found" }, 404)
  }

  const track = rowToMusicTrack(data)
  const keysToSign = [
    track.audioKey,
    track.coverKey ?? null,
    track.lyricsKey ?? null,
  ].filter(Boolean) as string[]
  const signed = await signMusicGetUrls(keysToSign)

  return c.json({
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
  })
})

// POST /music/tracks/upload-urls — presigned PUT URLs to R2 (bypasses Vercel body limit)
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
        const allowedTypes = new Set([
          "text/plain",
          "application/octet-stream",
          "application/x-subrip", // some LRC/Lyrics editors use this
          "application/lrc",
          "text/lrc",
        ])

        // Check content type
        const okType = allowedTypes.has(contentType)

        // Check file extension if available
        let okExt = false
        if (typeof filename === "string") {
          const ext = filename.toLowerCase().split(".").pop()
          okExt = ext === "lrc" || ext === "txt"
        }

        if (!okType && !okExt) {
          return c.json(
            {
              error:
                "Lyrics must be text/plain or a file with .lrc or .txt extension",
            },
            400
          )
        }
      }

      const key = generateMusicStorageKey(
        prefix as "audio" | "covers" | "lyrics",
        user.id,
        contentType,
        typeof filename === "string" ? filename : "file"
      )
      try {
        const signedUrl = await createMusicSignedUploadUrl(key, contentType)
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

    const audioUrl = MUSIC_ASSET_URL_PLACEHOLDER
    const coverUrl = coverKey ? MUSIC_ASSET_URL_PLACEHOLDER : null
    const lyricsUrl = lyricsKey ? MUSIC_ASSET_URL_PLACEHOLDER : null

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
    const signed = await signMusicGetUrls(keysToSign)
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
      updates.cover_key = coverKey
      updates.cover_url = MUSIC_ASSET_URL_PLACEHOLDER
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
      updates.lyrics_key = lyricsKey
      updates.lyrics_url = MUSIC_ASSET_URL_PLACEHOLDER
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

    const updated = rowToMusicTrack(data)
    const signKeys = [
      updated.audioKey,
      updated.coverKey ?? null,
      updated.lyricsKey ?? null,
    ].filter(Boolean) as string[]
    const signed = await signMusicGetUrls(signKeys)
    return c.json({
      track: {
        ...updated,
        audioUrl: signed.get(updated.audioKey) ?? updated.audioUrl,
        coverUrl: updated.coverKey
          ? (signed.get(updated.coverKey) ?? updated.coverUrl)
          : updated.coverUrl,
        lyricsUrl: updated.lyricsKey
          ? (signed.get(updated.lyricsKey) ?? updated.lyricsUrl)
          : updated.lyricsUrl,
      },
    })
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
      await deleteMusicObjects(keysToDelete)
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

// POST /music/tracks/lyrics/ai/presign — create temporary upload URL for AI transcription
musicTrackRoutes.post(
  "/lyrics/ai/presign",
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  rateLimitByUser(12, 60_000),
  async (c) => {
    const user = c.get("user")
    let body: { filename?: unknown; contentType?: unknown; sizeBytes?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return jsonError(c, "invalid_json", "Invalid JSON", 400)
    }

    const filename =
      typeof body.filename === "string"
        ? body.filename.trim().slice(0, 180)
        : "track"
    const contentType =
      typeof body.contentType === "string" ? body.contentType : ""
    const sizeBytes =
      typeof body.sizeBytes === "number" && Number.isFinite(body.sizeBytes)
        ? Math.round(body.sizeBytes)
        : 0

    if (!MUSIC_AUDIO_ALLOWED_TYPES.has(contentType)) {
      return jsonError(
        c,
        "unsupported_audio",
        `Unsupported audio type: ${contentType}`,
        400
      )
    }
    if (sizeBytes <= 0 || sizeBytes > AI_LYRICS_MAX_AUDIO_BYTES) {
      return jsonError(
        c,
        "too_large",
        "Audio file is too large for AI transcription",
        400
      )
    }

    const ext = extFromFilename(filename)
    const safeExt = AUDIO_EXTS_ALLOWED_FOR_AI.has(ext) ? ext : ".mp3"
    const tempAudioKey = `${AI_LYRICS_TMP_PREFIX}/${user.id}/${crypto.randomUUID()}${safeExt}`

    try {
      const signedUrl = await signMusicPutUrl(
        tempAudioKey,
        contentType,
        15 * 60
      )
      return c.json({ tempAudioKey, signedUrl, expiresInSec: 900 })
    } catch (err) {
      console.error("[music/tracks] ai presign error:", err)
      return jsonError(c, "presign_failed", "Failed to prepare AI upload", 500)
    }
  }
)

// POST /music/tracks/lyrics/ai — generate timestamped lyrics via ElevenLabs
musicTrackRoutes.post(
  "/lyrics/ai",
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  rateLimitByUser(6, 60_000),
  async (c) => {
    const user = c.get("user")
    const hourlyLimit = checkRateLimit(
      `music:lyrics-ai:${user.id}`,
      20,
      60 * 60_000
    )
    if (hourlyLimit.limited) {
      c.header("Retry-After", String(hourlyLimit.retryAfter))
      return jsonError(c, "rate_limited", "Too many AI lyric requests", 429)
    }

    let body: {
      trackId?: unknown
      tempAudioKey?: unknown
      languageCode?: unknown
      durationSec?: unknown
    }
    try {
      body = await c.req.json()
    } catch {
      return jsonError(c, "invalid_json", "Invalid JSON", 400)
    }

    const trackId = typeof body.trackId === "string" ? body.trackId : null
    const tempAudioKey =
      typeof body.tempAudioKey === "string" ? body.tempAudioKey : null
    const languageCode = normalizeAiLanguageCode(body.languageCode)
    const clientDurationSec =
      typeof body.durationSec === "number" && Number.isFinite(body.durationSec)
        ? Math.round(body.durationSec)
        : 0

    if ((trackId ? 1 : 0) + (tempAudioKey ? 1 : 0) !== 1) {
      return jsonError(
        c,
        "invalid_source",
        "Provide exactly one audio source",
        400
      )
    }

    let sourceAudioKey: string | null = null
    let sourceDurationSec = clientDurationSec
    let shouldDeleteTempObject = false

    if (trackId) {
      const { data: row, error } = await supabase
        .from("music_tracks")
        .select("id, audio_key, duration_sec, uploaded_by")
        .eq("id", trackId)
        .single()
      if (error || !row)
        return jsonError(c, "track_not_found", "Track not found", 404)

      const isSuperuser = user.permissions === "*"
      if (!isSuperuser && row.uploaded_by !== user.id) {
        return jsonError(c, "forbidden", "Forbidden", 403)
      }

      sourceAudioKey = row.audio_key as string
      sourceDurationSec = Math.max(
        sourceDurationSec,
        Number(row.duration_sec ?? 0)
      )
    }

    if (tempAudioKey) {
      if (!tempAudioKey.startsWith(`${AI_LYRICS_TMP_PREFIX}/${user.id}/`)) {
        return jsonError(
          c,
          "invalid_temp_key",
          "Invalid temporary audio key",
          403
        )
      }
      sourceAudioKey = tempAudioKey
      shouldDeleteTempObject = true
    }

    if (!sourceAudioKey) {
      return jsonError(c, "invalid_source", "Missing audio source", 400)
    }

    if (sourceDurationSec > AI_LYRICS_MAX_DURATION_SEC) {
      return jsonError(
        c,
        "duration_exceeded",
        "Audio duration exceeds AI limit",
        400
      )
    }

    try {
      assertElevenLabsConfigured()
    } catch {
      return jsonError(
        c,
        "not_configured",
        "ElevenLabs API key is not configured",
        503
      )
    }

    const warnings: string[] = []
    try {
      const signedAudioUrl = await signMusicGetUrl(sourceAudioKey, 15 * 60)
      if (!signedAudioUrl) {
        return jsonError(
          c,
          "audio_access_failed",
          "Could not access source audio",
          500
        )
      }

      const form = new FormData()
      form.set("model_id", "scribe_v2")
      form.set("cloud_storage_url", signedAudioUrl)
      form.set("timestamps_granularity", "word")
      form.set("tag_audio_events", "false")
      if (languageCode !== "auto") {
        form.set("language_code", languageCode)
      }

      const sttAbort = new AbortController()
      const sttTimer = setTimeout(() => sttAbort.abort(), 2 * 60_000)
      let sttRes: Response
      try {
        sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          signal: sttAbort.signal,
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY as string,
          },
          body: form,
        })
      } finally {
        clearTimeout(sttTimer)
      }

      if (!sttRes.ok) {
        const detail = await sttRes.text().catch(() => "")
        console.error(
          "[music/tracks] elevenlabs transcription failed",
          sttRes.status,
          detail
        )
        return jsonError(
          c,
          "transcription_failed",
          "AI transcription failed",
          502
        )
      }

      const transcript = (await sttRes.json()) as unknown
      const { words, text } = extractElevenWords(transcript)

      let lrc = buildLrcFromWords(words)
      if (!lrc && text.trim()) {
        warnings.push("Fell back to plain transcript segmentation")
        lrc = buildLrcFromText(text)
      }
      if (!lrc) {
        return jsonError(
          c,
          "invalid_output",
          "Could not generate timestamped lyrics",
          422
        )
      }

      const repaired = await repairLrcWithGateway(lrc)
      if (repaired !== lrc)
        warnings.push("LRC formatting was normalized by AI gateway")

      return c.json({
        lyrics: repaired,
        type: "lrc",
        source: "ai",
        languageCode,
        warnings,
      })
    } catch (err) {
      console.error("[music/tracks] lyrics ai error:", err)
      return jsonError(
        c,
        "transcription_failed",
        "AI transcription failed",
        500
      )
    } finally {
      if (shouldDeleteTempObject && sourceAudioKey) {
        await deleteMusicObjects([sourceAudioKey])
      }
    }
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
    const content = await getMusicObjectText(data.lyrics_key as string)
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
