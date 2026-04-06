"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/auth-store"
import { useSidebarStore } from "@/lib/sidebar-store"
import { fetchAndMergeUserProfile } from "@/lib/fetch-user-profile"
import { isPWAContext } from "@/lib/pwa"
import { AppSidebar } from "@/components/layout/AppSidebar"
import { MobileTabBar } from "@/components/layout/MobileTabBar"
import { FloatingNavControls } from "@/components/layout/FloatingNavControls"
import { InstallPrompt } from "@/components/pwa/InstallPrompt"
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt"
import { WelcomeWizardDialog } from "@/components/onboarding/WelcomeWizardDialog"
import { DashboardPageTransition } from "@/components/layout/DashboardPageTransition"
import { Spinner } from "@/components/ui/spinner"
import { PageBackground } from "@/components/layout/PageBackground"
import { ProductImprovementAnalyticsNotice } from "@/components/consent/ProductImprovementAnalyticsNotice"
import { AudioPlayerProvider } from "@/components/ui/audio-player"
import { MusicProvider, useMusicContext } from "@/components/music/MusicContext"
import { MusicPlayerBar } from "@/components/music/MusicPlayerBar"
import { NowPlayingSheet } from "@/components/music/NowPlayingSheet"
import { MediaSessionSync } from "@/components/music/MediaSessionSync"
import { SidebarMusicMini } from "@/components/layout/SidebarMusicMini"

/**
 * Inner shell — must be a child of AudioPlayerProvider + MusicProvider so it can
 * consume both contexts for the persistent player bar and now-playing sheet.
 */
function DashboardShell({ children }: { children: React.ReactNode }) {
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed)
  const setSidebarCollapsed = useSidebarStore((s) => s.setCollapsed)
  const user = useAuthStore((s) => s.user)
  const { nowPlayingOpen, openNowPlaying, closeNowPlaying } = useMusicContext()

  return (
    <div className="min-h-screen">
      <ProductImprovementAnalyticsNotice />
      <UpdatePrompt />
      {user?.welcomeWizardCompleted === false ? <WelcomeWizardDialog /> : null}

      {/* Syncs navigator.mediaSession with the current track + player state */}
      <MediaSessionSync />

      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        musicWidget={
          <SidebarMusicMini
            collapsed={sidebarCollapsed}
            onOpenNowPlaying={openNowPlaying}
          />
        }
      />
      <FloatingNavControls sidebarWidth={sidebarCollapsed ? 60 : 224} />

      {/* Main content */}
      <main
        className={[
          "transition-[padding-left] duration-200 ease-in-out",
          "block",
          sidebarCollapsed ? "sm:pl-[60px]" : "sm:pl-56",
        ].join(" ")}
      >
        <DashboardPageTransition>{children}</DashboardPageTransition>
      </main>

      {/* Persistent player — visible on all pages while music is playing */}
      <MusicPlayerBar onOpenNowPlaying={openNowPlaying} />
      <NowPlayingSheet open={nowPlayingOpen} onClose={closeNowPlaying} />

      <MobileTabBar />
      <InstallPrompt />
    </div>
  )
}

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const store = useAuthStore()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(
    () => !useAuthStore.getState().accessToken
  )

  useEffect(() => {
    if (store.accessToken) {
      void fetchAndMergeUserProfile(store.accessToken)
      setTimeout(() => setIsChecking(false), 0)
      return
    }

    fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPwa: isPWAContext() }),
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          store.clearAuth()
          router.replace("/login")
          return
        }
        const { accessToken } = (await res.json()) as { accessToken: string }
        const [, b64] = accessToken.split(".")
        const payload = JSON.parse(
          atob(b64.replace(/-/g, "+").replace(/_/g, "/"))
        ) as {
          sub: string
          permissions: string
          isPwa: boolean
        }
        store.setAuth(accessToken, {
          id: payload.sub,
          permissions: payload.permissions,
          isPwa: payload.isPwa,
        })
        await fetchAndMergeUserProfile(accessToken)
        setIsChecking(false)
      })
      .catch(() => {
        store.clearAuth()
        router.replace("/login")
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isChecking) {
    return (
      <div className="page-root relative flex min-h-screen items-center justify-center">
        <PageBackground />
        <div className="glass-card relative z-10 flex flex-col items-center gap-4 rounded-2xl px-8 py-7">
          <Spinner size="md" clockwise />
        </div>
      </div>
    )
  }

  return (
    <AudioPlayerProvider>
      <MusicProvider>
        <DashboardShell>{children}</DashboardShell>
      </MusicProvider>
    </AudioPlayerProvider>
  )
}
