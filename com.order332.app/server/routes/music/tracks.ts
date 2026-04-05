import 'server-only'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { parseBuffer } from 'music-metadata'
import { requireAuth } from '@/server/middleware/auth'
import { requirePermission } from '@/server/middleware/rbac'
import { rateLimitByUser } from '@/server/middleware/rate-limit'
import { PERMISSIONS } from '@/lib/permissions'
import {
  MUSIC_TRACKS_BUCKET,
  MUSIC_AUDIO_ALLOWED_TYPES,
  MUSIC_AUDIO_MAX_SIZE,
  MUSIC_COVER_ALLOWED_TYPES,
  MUSIC_COVER_MAX_SIZE,
  MUSIC_LYRICS_MAX_SIZE,
  uploadMusicAudio,
  uploadMusicCover,
  uploadMusicLyrics,
} from '@/server/lib/music-upload'
import { supabase } from '@/server/db/supabase/client'
import { signUrl, signUrls } from '@/server/lib/signed-url'
import type { HonoEnv, MusicTrack } from '@/server/lib/types'

export const musicTrackRoutes = new Hono<HonoEnv>()
musicTrackRoutes.use('*', requireAuth, requirePermission(PERMISSIONS.APP_MUSIC))

// GET /music/tracks — list all music tracks, optional ?genre= filter
musicTrackRoutes.get('/', async (c) => {
  const genre = c.req.query('genre')

  let query = supabase
    .from('music_tracks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (genre) {
    query = query.eq('genre', genre)
  }

  const { data, error } = await query

  if (error) {
    console.error('[music/tracks] list error:', error)
    return c.json({ error: 'Failed to fetch tracks' }, 500)
  }

  const tracks: MusicTrack[] = (data ?? []).map(rowToMusicTrack)

  const keysToSign = tracks.flatMap((t) =>
    [t.audioKey, t.coverKey ?? null, t.lyricsKey ?? null].filter(Boolean) as string[]
  )
  const signed = await signUrls(MUSIC_TRACKS_BUCKET, keysToSign)
  const result = tracks.map((t) => ({
    ...t,
    audioUrl: signed.get(t.audioKey) ?? t.audioUrl,
    coverUrl: t.coverKey ? (signed.get(t.coverKey) ?? t.coverUrl) : t.coverUrl,
    lyricsUrl: t.lyricsKey ? (signed.get(t.lyricsKey) ?? t.lyricsUrl) : t.lyricsUrl,
  }))
  return c.json({ tracks: result })
})

// POST /music/tracks — upload a new music track
musicTrackRoutes.post(
  '/',
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  rateLimitByUser(5, 60_000),
  async (c) => {
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: 'Expected multipart/form-data' }, 400)
    }

    const audioFile = formData.get('audio')
    if (!(audioFile instanceof File)) {
      return c.json({ error: 'Missing audio file' }, 400)
    }

    if (!MUSIC_AUDIO_ALLOWED_TYPES.has(audioFile.type)) {
      return c.json({ error: `Unsupported audio type: ${audioFile.type}` }, 400)
    }
    if (audioFile.size > MUSIC_AUDIO_MAX_SIZE) {
      return c.json({ error: 'Audio file exceeds 100 MB limit' }, 400)
    }

    // Read form meta fields (may be overridden by embedded tags below)
    const titleRaw = formData.get('title')
    const artistRaw = formData.get('artist')
    const genreRaw = formData.get('genre')
    const durationRaw = formData.get('duration_sec')
    const coverFile = formData.get('cover')
    const lyricsFile = formData.get('lyrics')

    // Validate cover if provided
    if (coverFile instanceof File) {
      if (!MUSIC_COVER_ALLOWED_TYPES.has(coverFile.type)) {
        return c.json({ error: `Unsupported cover art type: ${coverFile.type}` }, 400)
      }
      if (coverFile.size > MUSIC_COVER_MAX_SIZE) {
        return c.json({ error: 'Cover art exceeds 5 MB limit' }, 400)
      }
    }

    // Validate lyrics if provided
    if (lyricsFile instanceof File) {
      if (lyricsFile.size > MUSIC_LYRICS_MAX_SIZE) {
        return c.json({ error: 'Lyrics file exceeds 1 MB limit' }, 400)
      }
      // Accept text/plain or application/octet-stream (common for .lrc files)
      const validLyricsMime = lyricsFile.type === 'text/plain' ||
        lyricsFile.type === 'application/octet-stream' ||
        lyricsFile.name.toLowerCase().endsWith('.lrc') ||
        lyricsFile.name.toLowerCase().endsWith('.txt')
      if (!validLyricsMime) {
        return c.json({ error: 'Lyrics must be a .lrc or .txt file' }, 400)
      }
    }

    const user = c.get('user')
    const uploadedStorageKeys: string[] = []

    try {
      // Read audio into buffer (needed for both metadata extraction and upload)
      const audioBuffer = await audioFile.arrayBuffer()

      // --- Extract embedded metadata (ID3 / Vorbis / etc.) ---
      let embeddedTitle: string | null = null
      let embeddedArtist: string | null = null
      let embeddedGenre: string | null = null
      let embeddedDuration: number | null = null
      let embeddedCoverBuffer: Buffer | null = null
      let embeddedCoverMime: string | null = null

      try {
        const meta = await parseBuffer(Buffer.from(audioBuffer), { mimeType: audioFile.type })
        embeddedTitle = meta.common.title?.trim() || null
        embeddedArtist = (meta.common.artist || meta.common.albumartist)?.trim() || null
        embeddedGenre = meta.common.genre?.[0]?.trim() || null
        embeddedDuration = meta.format.duration ? Math.round(meta.format.duration) : null
        if (meta.common.picture?.length) {
          const pic = meta.common.picture[0]
          embeddedCoverBuffer = Buffer.from(pic.data)
          embeddedCoverMime = pic.format
        }
      } catch (metaErr) {
        console.warn('[music/tracks] metadata parse warning:', metaErr)
      }

      // Form values take priority; embedded tags fill gaps; filename is last resort for title
      const titleFromForm = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : null
      const artistFromForm = typeof artistRaw === 'string' && artistRaw.trim() ? artistRaw.trim() : null
      const genreFromForm = typeof genreRaw === 'string' && genreRaw.trim() ? genreRaw.trim() : null
      const durationFromForm = typeof durationRaw === 'string' ? Math.max(0, Math.round(Number(durationRaw))) : 0

      const title = (titleFromForm || embeddedTitle || audioFile.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')).slice(0, 200)
      const artist = (artistFromForm || embeddedArtist || 'Unknown Artist').slice(0, 200)
      const genre = (genreFromForm || embeddedGenre)?.slice(0, 100) ?? null
      const durationSec = durationFromForm || embeddedDuration || 0

      const { storageKey: audioKey, publicUrl: audioUrl } = await uploadMusicAudio({
        userId: user.id,
        buffer: audioBuffer,
        contentType: audioFile.type,
        filenameHint: audioFile.name,
      })
      uploadedStorageKeys.push(audioKey)

      // Upload cover (form file takes priority, then embedded tag art)
      let coverKey: string | null = null
      let coverUrl: string | null = null
      if (coverFile instanceof File) {
        const coverBuffer = await coverFile.arrayBuffer()
        const result = await uploadMusicCover({
          userId: user.id,
          buffer: coverBuffer,
          contentType: coverFile.type,
          filenameHint: coverFile.name,
        })
        coverKey = result.storageKey
        coverUrl = result.publicUrl
        uploadedStorageKeys.push(coverKey)
      } else if (embeddedCoverBuffer && embeddedCoverMime && MUSIC_COVER_ALLOWED_TYPES.has(embeddedCoverMime)) {
        const result = await uploadMusicCover({
          userId: user.id,
          buffer: embeddedCoverBuffer.buffer as ArrayBuffer,
          contentType: embeddedCoverMime,
          filenameHint: 'cover',
        })
        coverKey = result.storageKey
        coverUrl = result.publicUrl
        uploadedStorageKeys.push(coverKey)
      }

      // Upload lyrics (optional)
      let lyricsKey: string | null = null
      let lyricsUrl: string | null = null
      let lyricsType: 'lrc' | 'txt' | null = null
      if (lyricsFile instanceof File) {
        const lyricsBuffer = await lyricsFile.arrayBuffer()
        const result = await uploadMusicLyrics({
          userId: user.id,
          buffer: lyricsBuffer,
          contentType: lyricsFile.type,
          filenameHint: lyricsFile.name,
        })
        lyricsKey = result.storageKey
        lyricsUrl = result.publicUrl
        lyricsType = lyricsFile.name.toLowerCase().endsWith('.lrc') ? 'lrc' : 'txt'
        uploadedStorageKeys.push(lyricsKey)
      }

      const { data, error } = await supabase
        .from('music_tracks')
        .insert({
          uploaded_by: user.id,
          title,
          artist,
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
        // Best-effort cleanup of orphaned storage objects
        await supabase.storage.from('music-tracks').remove(uploadedStorageKeys).catch(() => {})
        console.error('[music/tracks] insert error:', error)
        return c.json({ error: 'Failed to save track' }, 500)
      }

      const track = rowToMusicTrack(data)
      const postKeysToSign = [track.audioKey, track.coverKey ?? null, track.lyricsKey ?? null]
        .filter(Boolean) as string[]
      const postSigned = await signUrls(MUSIC_TRACKS_BUCKET, postKeysToSign)
      return c.json({
        track: {
          ...track,
          audioUrl: postSigned.get(track.audioKey) ?? track.audioUrl,
          coverUrl: track.coverKey ? (postSigned.get(track.coverKey) ?? track.coverUrl) : track.coverUrl,
          lyricsUrl: track.lyricsKey ? (postSigned.get(track.lyricsKey) ?? track.lyricsUrl) : track.lyricsUrl,
        },
      }, 201)
    } catch (err) {
      // Best-effort cleanup
      if (uploadedStorageKeys.length > 0) {
        await supabase.storage.from('music-tracks').remove(uploadedStorageKeys).catch(() => {})
      }
      console.error('[music/tracks] upload error:', err)
      return c.json({ error: 'Upload failed' }, 500)
    }
  }
)

// PATCH /music/tracks/:id — update track metadata (own items only, or superuser)
musicTrackRoutes.patch(
  '/:id',
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')

    let body: { title?: unknown; artist?: unknown; genre?: unknown }
    try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
    const artist = typeof body.artist === 'string' ? body.artist.trim().slice(0, 200) : ''
    const genre = typeof body.genre === 'string' ? (body.genre.trim().slice(0, 100) || null) : null

    if (!title || !artist) return c.json({ error: 'title and artist are required' }, 400)

    const { data: existing, error: fetchErr } = await supabase
      .from('music_tracks').select('uploaded_by').eq('id', id).single()
    if (fetchErr || !existing) return c.json({ error: 'Track not found' }, 404)

    const isSuperuser = user.permissions === '*'
    if (!isSuperuser && existing.uploaded_by !== user.id) return c.json({ error: 'Forbidden' }, 403)

    const { data, error } = await supabase
      .from('music_tracks')
      .update({ title, artist, genre, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      console.error('[music/tracks] update error:', error)
      return c.json({ error: 'Update failed' }, 500)
    }

    return c.json({ track: rowToMusicTrack(data) })
  }
)

// DELETE /music/tracks/:id — delete a track (own items only, or superuser)
musicTrackRoutes.delete(
  '/:id',
  requirePermission(PERMISSIONS.APP_MUSIC_UPLOAD),
  async (c) => {
    const id = c.req.param('id')
    const user = c.get('user')

    const { data, error } = await supabase
      .from('music_tracks')
      .select('id, audio_key, cover_key, lyrics_key, uploaded_by')
      .eq('id', id)
      .single()

    if (error || !data) {
      return c.json({ error: 'Track not found' }, 404)
    }

    const isSuperuser = user.permissions === '*'
    if (!isSuperuser && data.uploaded_by !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const keysToDelete = [data.audio_key, data.cover_key, data.lyrics_key].filter(Boolean) as string[]
    if (keysToDelete.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('music-tracks')
        .remove(keysToDelete)
      if (storageError) {
        console.error('[music/tracks] storage delete error:', storageError)
      }
    }

    const { error: deleteError } = await supabase
      .from('music_tracks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('[music/tracks] db delete error:', deleteError)
      return c.json({ error: 'Delete failed' }, 500)
    }

    return c.json({ ok: true })
  }
)

// GET /music/tracks/lyrics/search — proxy LRCLIB fetch, stream result via SSE
musicTrackRoutes.get('/lyrics/search', async (c) => {
  const trackName = (c.req.query('track_name') ?? '').trim()
  const artistName = (c.req.query('artist_name') ?? '').trim()
  const albumName = (c.req.query('album_name') ?? '').trim()
  const duration = Math.round(Number(c.req.query('duration') ?? '0'))

  if (!trackName || duration === 0) {
    return c.json({ error: 'track_name and duration are required' }, 400)
  }

  return streamSSE(c, async (stream) => {
    const url = new URL('https://lrclib.net/api/get')
    url.searchParams.set('track_name', trackName)
    if (artistName) url.searchParams.set('artist_name', artistName)
    if (albumName) url.searchParams.set('album_name', albumName)
    url.searchParams.set('duration', String(duration))

    try {
      const res = await fetch(url.toString(), {
        headers: { 'Lrclib-Client': 'order332/1.0 (https://order332.com)' },
      })
      if (res.status === 404) {
        await stream.writeSSE({ event: 'not_found', data: '' })
        return
      }
      if (!res.ok) {
        await stream.writeSSE({ event: 'error', data: String(res.status) })
        return
      }
      const data = await res.json() as {
        syncedLyrics?: string | null
        plainLyrics?: string | null
        instrumental?: boolean
      }
      await stream.writeSSE({
        event: 'result',
        data: JSON.stringify({
          syncedLyrics: data.syncedLyrics ?? null,
          plainLyrics: data.plainLyrics ?? null,
          instrumental: data.instrumental ?? false,
        }),
      })
    } catch {
      await stream.writeSSE({ event: 'error', data: 'fetch_failed' })
    }
  })
})

// GET /music/tracks/:id/lyrics — fetch lyrics content
musicTrackRoutes.get('/:id/lyrics', async (c) => {
  const id = c.req.param('id')

  const { data, error } = await supabase
    .from('music_tracks')
    .select('lyrics_key, lyrics_type')
    .eq('id', id)
    .single()

  if (error || !data) {
    return c.json({ error: 'Track not found' }, 404)
  }

  if (!data.lyrics_key) {
    return c.json({ error: 'No lyrics available' }, 404)
  }

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(MUSIC_TRACKS_BUCKET).download(data.lyrics_key as string)
    if (dlErr || !blob) {
      return c.json({ error: 'Failed to fetch lyrics' }, 502)
    }
    const content = await blob.text()
    return c.json({ content, type: data.lyrics_type ?? 'txt' })
  } catch (err) {
    console.error('[music/tracks] lyrics fetch error:', err)
    return c.json({ error: 'Failed to fetch lyrics' }, 500)
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
    genre: row.genre as string | null,
    durationSec: row.duration_sec as number,
    audioKey: row.audio_key as string,
    audioUrl: row.audio_url as string,
    coverKey: row.cover_key as string | null,
    coverUrl: row.cover_url as string | null,
    lyricsKey: row.lyrics_key as string | null,
    lyricsUrl: row.lyrics_url as string | null,
    lyricsType: row.lyrics_type as 'lrc' | 'txt' | null,
  }
}
