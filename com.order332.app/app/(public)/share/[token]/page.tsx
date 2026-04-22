import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/server/db'
import { supabase } from '@/server/db/supabase/client'
import { signMusicGetUrl } from '@/server/lib/music-r2'
import { SharePageClient } from './SharePageClient'

interface Props {
  params: Promise<{ token: string }>
}

async function getShareData(token: string) {
  // Validate token format before hitting DB
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null

  const link = await db.getMusicShareLinkByToken(token)
  if (!link) return null

  const { data: trackRow, error } = await supabase
    .from('music_tracks')
    .select('id, title, artist, genre, duration_sec, audio_key, cover_key')
    .eq('id', link.trackId)
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
    : ''
  const coverUrl = signedCover || null

  return { link, track: row, coverUrl }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const data = await getShareData(token)

  if (!data) {
    return {
      title: 'Track not found — 332',
      description: 'This share link is invalid or has expired.',
    }
  }

  const { track, coverUrl } = data
  const title = `${track.title} — ${track.artist}`
  const description = [
    track.genre,
    'Shared via 332',
  ].filter(Boolean).join(' · ')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.332.fm'
  const pageUrl = `${appUrl}/share/${token}`

  return {
    title: `${title} — 332`,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: '332',
      type: 'music.song',
      ...(coverUrl ? { images: [{ url: coverUrl, width: 1200, height: 1200, alt: `${track.title} album art` }] } : {}),
    },
    twitter: {
      card: coverUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(coverUrl ? { images: [coverUrl] } : {}),
    },
  }
}

export default async function SharePage({ params }: Props) {
  const { token } = await params
  const data = await getShareData(token)

  if (!data) notFound()

  return (
    <SharePageClient
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
