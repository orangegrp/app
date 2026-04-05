'use client'

import { useState } from 'react'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import { PageBackground } from '@/components/layout/PageBackground'
import { MusicTrackGrid } from '@/components/music/MusicTrackGrid'
import { MusicUploadForm } from '@/components/music/MusicUploadForm'
import { useMusicContext } from '@/components/music/MusicContext'

export default function MusicPage() {
  const { isCreator, isCreatorMode, setCreatorMode, addTrack, loading, error } = useMusicContext()
  const [showUploadForm, setShowUploadForm] = useState(false)

  return (
    <div className="page-root relative min-h-screen px-6 pt-8 pb-[calc(var(--mobile-nav-height)+5rem)] sm:pb-28 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-6xl">
        <p className="section-label">Music</p>

        <div className="mb-8 flex items-start justify-between gap-4">
          <h2 className="text-4xl tracking-widest text-foreground">
            Music<span className="blink-cursor">_</span>
          </h2>
          {isCreator && (
            <button
              onClick={() => {
                const next = !isCreatorMode
                setCreatorMode(next)
                if (!next) setShowUploadForm(false)
              }}
              className="mt-1 flex shrink-0 items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isCreatorMode
                ? <ToggleRight className="h-5 w-5 text-foreground" />
                : <ToggleLeft className="h-5 w-5" />}
              Creator mode
            </button>
          )}
        </div>

        {isCreatorMode && !showUploadForm && (
          <div className="mb-6">
            <button
              onClick={() => setShowUploadForm(true)}
              className="glass-button rounded-xl px-5 py-2.5 text-sm font-medium tracking-wide"
            >
              + Upload Track
            </button>
          </div>
        )}

        {isCreatorMode && showUploadForm && (
          <MusicUploadForm
            onUploadComplete={(track) => {
              addTrack(track)
              setShowUploadForm(false)
            }}
            onCancel={() => setShowUploadForm(false)}
          />
        )}

        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
          </div>
        ) : error ? (
          <div className="glass-card rounded-2xl p-8">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <MusicTrackGrid />
        )}
      </div>
    </div>
  )
}
