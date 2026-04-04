'use client'

import { AudioPlayerProvider } from '@/components/ui/audio-player'
import { MusicProvider, useMusicContext } from '@/components/music/MusicContext'
import { MusicPlayerBar } from '@/components/music/MusicPlayerBar'
import { NowPlayingSheet } from '@/components/music/NowPlayingSheet'
import { RequireAppPermission } from '@/components/auth/RequireAppPermission'
import { PERMISSIONS } from '@/lib/permissions'

function MusicLayoutInner({ children }: { children: React.ReactNode }) {
  const { nowPlayingOpen, openNowPlaying, closeNowPlaying } = useMusicContext()

  return (
    <>
      {children}
      <MusicPlayerBar onOpenNowPlaying={openNowPlaying} />
      <NowPlayingSheet open={nowPlayingOpen} onClose={closeNowPlaying} />
    </>
  )
}

export default function MusicLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAppPermission permission={PERMISSIONS.APP_MUSIC}>
      <AudioPlayerProvider>
        <MusicProvider>
          <MusicLayoutInner>{children}</MusicLayoutInner>
        </MusicProvider>
      </AudioPlayerProvider>
    </RequireAppPermission>
  )
}
