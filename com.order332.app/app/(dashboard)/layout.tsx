'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { fetchAndMergeUserProfile } from '@/lib/fetch-user-profile'
import { isPWAContext } from '@/lib/pwa'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { FloatingNavControls } from '@/components/layout/FloatingNavControls'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { UpdatePrompt } from '@/components/pwa/UpdatePrompt'
import { WelcomeWizardDialog } from '@/components/onboarding/WelcomeWizardDialog'
import { DashboardPageTransition } from '@/components/layout/DashboardPageTransition'
import { Spinner } from '@/components/ui/spinner'
import { PageBackground } from '@/components/layout/PageBackground'

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const store = useAuthStore()
  const user = useAuthStore((s) => s.user)
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(() => !useAuthStore.getState().accessToken)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (store.accessToken) {
      void fetchAndMergeUserProfile(store.accessToken)
      setTimeout(() => setIsChecking(false), 0)
      return
    }

    fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPwa: isPWAContext() }),
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          store.clearAuth()
          router.replace('/login')
          return
        }
        const { accessToken } = await res.json() as { accessToken: string }
        const [, b64] = accessToken.split('.')
        const payload = JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
          sub: string
          permissions: string
          isPwa: boolean
        }
        store.setAuth(accessToken, { id: payload.sub, permissions: payload.permissions, isPwa: payload.isPwa })
        await fetchAndMergeUserProfile(accessToken)
        setIsChecking(false)
      })
      .catch(() => {
        store.clearAuth()
        router.replace('/login')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isChecking) {
    return (
      <div className="page-root relative flex min-h-screen items-center justify-center">
        <PageBackground />
        <div className="relative z-10 glass-card rounded-2xl px-8 py-7 flex flex-col items-center gap-4">
          <Spinner size="md" clockwise />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <UpdatePrompt />
      {user?.welcomeWizardCompleted === false ? <WelcomeWizardDialog /> : null}
      <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
      <FloatingNavControls sidebarWidth={sidebarCollapsed ? 60 : 224} />
      <main
        className={[
          'transition-[padding-left] duration-200 ease-in-out',
          'hidden sm:block',
          sidebarCollapsed ? 'sm:pl-[60px]' : 'sm:pl-56',
        ].join(' ')}
      >
        <DashboardPageTransition>{children}</DashboardPageTransition>
      </main>
      <div className="sm:hidden">
        <DashboardPageTransition>{children}</DashboardPageTransition>
      </div>
      <MobileTabBar />
      <InstallPrompt />
    </div>
  )
}
