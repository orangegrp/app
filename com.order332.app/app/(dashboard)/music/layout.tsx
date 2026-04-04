'use client'

import { useState } from 'react'
import { AudioPlayerProvider } from '@/components/ui/audio-player'
import { MusicProvider } from '@/components/music/MusicContext'
import { MusicPlayerBar } from '@/components/music/MusicPlayerBar'
import { NowPlayingSheet } from '@/components/music/NowPlayingSheet'
import { RequireAppPermission } from '@/components/auth/RequireAppPermission'
import { PERMISSIONS } from '@/lib/permissions'

export default function MusicLayout({ children }: { children: React.ReactNode }) {
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)

  return (
    <RequireAppPermission permission={PERMISSIONS.APP_MUSIC}>
      <AudioPlayerProvider>
        <MusicProvider>
          {children}
          <MusicPlayerBar onOpenNowPlaying={() => setNowPlayingOpen(true)} />
          <NowPlayingSheet open={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
        </MusicProvider>
      </AudioPlayerProvider>
    </RequireAppPermission>
  )
}
