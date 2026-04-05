export interface LrclibResult {
  syncedLyrics: string | null
  plainLyrics: string | null
  instrumental: boolean
}

/**
 * Fetches lyrics from LRCLIB.net for a given track.
 * Returns null if no match is found (404).
 * Throws on unexpected errors.
 * Prefers synced lyrics; plainLyrics is the fallback.
 */
export async function fetchLyricsFromLrclib(params: {
  trackName: string
  artistName: string
  albumName?: string
  duration: number
}): Promise<LrclibResult | null> {
  const url = new URL('https://lrclib.net/api/get')
  url.searchParams.set('track_name', params.trackName)
  url.searchParams.set('artist_name', params.artistName)
  if (params.albumName) url.searchParams.set('album_name', params.albumName)
  url.searchParams.set('duration', String(params.duration))

  const res = await fetch(url.toString())
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`LRCLIB error: ${res.status}`)

  const data = await res.json() as {
    syncedLyrics?: string | null
    plainLyrics?: string | null
    instrumental?: boolean
  }

  return {
    syncedLyrics: data.syncedLyrics ?? null,
    plainLyrics: data.plainLyrics ?? null,
    instrumental: data.instrumental ?? false,
  }
}
