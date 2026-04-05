'use client'
import { useState, useEffect, useRef, useCallback, startTransition, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { House, Grid2X2, LogOut, QrCode, X, Settings, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useAnyPermission } from '@/hooks/usePermission'
import { userDisplayName } from '@/lib/user-display'
import { HOME_APP_ITEMS, filterNavItemsForUser } from '@/lib/dashboard-nav'
import { isAdminish, MINI_APP_PERMISSIONS, PERMISSIONS } from '@/lib/permissions'
import { useAuthStore } from '@/lib/auth-store'
import { UserAvatar } from '@/components/user/UserAvatar'
import { useMusicContext } from '@/components/music/MusicContext'

type Sheet = 'apps' | 'profile' | null

function useSwipeToDismiss(onDismiss: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const lastY = useRef(0)
  const lastTime = useRef(0)
  const dragging = useRef(false)
  const onDismissRef = useRef(onDismiss)
  useEffect(() => { onDismissRef.current = onDismiss })

  const animateOut = useCallback((then?: () => void) => {
    const el = sheetRef.current
    const overlay = overlayRef.current
    if (el) {
      el.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 1, 1)'
      el.style.transform = 'translateY(100vh)'
    }
    if (overlay) {
      overlay.style.transition = 'opacity 0.26s ease'
      overlay.style.opacity = '0'
    }
    setTimeout(() => {
      onDismissRef.current()
      then?.()
    }, 260)
  }, [])

  // Non-passive touch listeners so we can call preventDefault on touchmove
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    const handleTouchStart = (e: TouchEvent) => {
      startY.current = e.touches[0].clientY
      lastY.current = e.touches[0].clientY
      lastTime.current = Date.now()
      dragging.current = true
      el.style.transition = 'none'
      el.style.animation = 'none'
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return
      const delta = e.touches[0].clientY - startY.current
      lastY.current = e.touches[0].clientY
      lastTime.current = Date.now()
      if (delta > 0) {
        e.preventDefault()
        el.style.transform = `translateY(${delta}px)`
      }
    }

    const handleTouchEnd = () => {
      if (!dragging.current) return
      dragging.current = false
      const delta = lastY.current - startY.current
      const elapsed = Date.now() - lastTime.current
      const velocity = elapsed > 0 ? delta / elapsed : 0

      if (delta > 100 || velocity > 0.4) {
        animateOut()
      } else {
        el.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
        el.style.transform = 'translateY(0)'
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  })

  return { sheetRef, overlayRef, close: animateOut }
}

export function MobileTabBar() {
  const { user, logout } = useAuth()
  const storeUser = useAuthStore((s) => s.user)
  const pathname = usePathname()
  const router = useRouter()
  const [sheet, setSheet] = useState<Sheet>(null)

  const showAdmin = useAnyPermission([
    PERMISSIONS.ADMIN_INVITES_MANAGE,
    PERMISSIONS.ADMIN_SYSTEM_CLEANUP,
    PERMISSIONS.ADMIN_PERMISSIONS_MANAGE,
  ])
  const showAppsTab = useAnyPermission(MINI_APP_PERMISSIONS)

  const appLauncherItems = useMemo(
    () => filterNavItemsForUser(storeUser?.permissions ?? '', HOME_APP_ITEMS),
    [storeUser?.permissions],
  )

  const displayName = user ? userDisplayName(user) : ''
  const role = storeUser && isAdminish(storeUser.permissions) ? 'Admin' : 'Member'
  const { currentTrack } = useMusicContext()
  const isOnMusicPage = pathname === '/music' || pathname.startsWith('/music/')
  const miniPlayerVisible = isOnMusicPage && !!currentTrack

  const isHome = pathname === '/home'
  const hideMobileChrome = pathname === '/qr-scan'

  const sheetPaddingBottom = { paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 3rem, 3.5rem)' }

  const [iosBrowserNav, setIosBrowserNav] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
    setTimeout(() => setIosBrowserNav(isIOS && !isStandalone), 0)
  }, [])

  // Lock body scroll while a sheet is open
  useEffect(() => {
    if (!sheet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [sheet])

  useEffect(() => {
    if (pathname !== '/qr-scan') return
    startTransition(() => setSheet(null))
  }, [pathname])

  useEffect(() => {
    if (!showAppsTab && sheet === 'apps') startTransition(() => setSheet(null))
  }, [showAppsTab, sheet])

  const appsSwipe = useSwipeToDismiss(useCallback(() => setSheet(null), []))
  const profileSwipe = useSwipeToDismiss(useCallback(() => setSheet(null), []))
  const { sheetRef: appsSheetRef, overlayRef: appsOverlayRef } = appsSwipe
  const { sheetRef: profileSheetRef, overlayRef: profileOverlayRef } = profileSwipe

  const closeSheet = useCallback((then?: () => void) => {
    const swipe = sheet === 'apps' ? appsSwipe : profileSwipe
    swipe.close(then)
  }, [sheet, appsSwipe, profileSwipe])

  return (
    <>
      {/* Apps sheet */}
      {showAppsTab && sheet === 'apps' && (
        <div
          className="sm:hidden fixed inset-0 z-[150] flex flex-col justify-end"
          onClick={() => closeSheet()}
        >
          {/* Backdrop fades in separately so the card opacity is unaffected */}
          <div
            ref={appsOverlayRef}
            className="absolute inset-0 animate-fade-in"
            style={{ background: 'oklch(0 0 0 / 65%)', backdropFilter: 'blur(6px)' }}
          />
          <div
            ref={appsSheetRef}
            className="relative glass-card rounded-t-3xl rounded-b-none px-5 pt-5"
            style={sheetPaddingBottom}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />
            <p className="section-label mb-4">Apps</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {appLauncherItems.map(({ href, icon: Icon, label, soon, hardNav }) => (
                <button
                  key={href}
                  type="button"
                  onClick={() => {
                    if (hardNav) {
                      closeSheet(() => {
                        window.location.href = href
                      })
                      return
                    }
                    closeSheet(() => router.push(href))
                  }}
                  className={[
                    'glass-card rounded-2xl p-4 flex flex-col gap-3 text-left transition-colors',
                    soon ? 'opacity-80' : 'active:scale-95',
                    pathname === href ? 'bg-white/10' : '',
                  ].join(' ')}
                >
                  <Icon size={24} strokeWidth={1.5} className="text-foreground" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm tracking-wider text-foreground">{label}</span>
                    {soon && (
                      <span className="text-[9px] tracking-widest text-muted-foreground/60">
                        Coming soon
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Profile sheet */}
      {sheet === 'profile' && (
        <div
          className="sm:hidden fixed inset-0 z-[150] flex flex-col justify-end"
          onClick={() => closeSheet()}
        >
          <div
            ref={profileOverlayRef}
            className="absolute inset-0 animate-fade-in"
            style={{ background: 'oklch(0 0 0 / 65%)', backdropFilter: 'blur(6px)' }}
          />
          <div
            ref={profileSheetRef}
            className="relative glass-card rounded-t-3xl rounded-b-none px-5 pt-5"
            style={sheetPaddingBottom}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />

            {/* Avatar + name */}
            <div className="flex flex-col items-center gap-3 py-4 border-b border-white/5 mb-2">
              {user ? (
                <UserAvatar user={user} size={64} className="ring-2 ring-white/10" />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-medium"
                  style={{ background: 'oklch(1 0 0 / 10%)', color: 'oklch(1 0 0 / 80%)' }}
                >
                  ?
                </div>
              )}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-base tracking-wider text-foreground">{displayName}</span>
                <span
                  className="text-[10px] tracking-widest"
                  style={{ color: 'oklch(1 0 0 / 35%)' }}
                >
                  {role}
                </span>
              </div>
            </div>

            {/* Settings / Scan QR / Admin — tile grid */}
            <div className={`grid gap-3 mb-2 ${showAdmin ? 'grid-cols-2' : 'grid-cols-2'}`}>
              <Link
                href="/settings"
                onClick={() => closeSheet()}
                className="glass-card rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center hover:bg-white/5 transition-colors min-h-[88px]"
              >
                <Settings size={26} strokeWidth={1.5} className="text-muted-foreground" />
                <span className="text-xs tracking-wider text-foreground">Settings</span>
              </Link>
              <Link
                href="/qr-scan"
                onClick={() => closeSheet()}
                className="glass-card rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center hover:bg-white/5 transition-colors min-h-[88px]"
              >
                <QrCode size={26} strokeWidth={1.5} className="text-muted-foreground" />
                <span className="text-xs tracking-wider text-foreground">Scan QR</span>
              </Link>
              {showAdmin && (
                <Link
                  href="/admin"
                  onClick={() => closeSheet()}
                  className="glass-card rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-center hover:bg-white/5 transition-colors min-h-[88px] col-span-2"
                >
                  <Shield size={26} strokeWidth={1.5} className="text-muted-foreground" />
                  <span className="text-xs tracking-wider text-foreground">Admin</span>
                </Link>
              )}
            </div>

            <div className="py-2 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => closeSheet(logout)}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm tracking-wider text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                style={{ minHeight: '44px' }}
              >
                <LogOut size={18} strokeWidth={1.5} />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom tab bar — flush to screen edge, rounded top corners only */}
      {!hideMobileChrome && (
      <nav className="sm:hidden fixed inset-x-0 bottom-0 z-50">
        <div
          className={cn("glass-nav-viewport rounded-b-none border-b-0", miniPlayerVisible ? "rounded-t-none" : "rounded-t-2xl")}
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            ...(iosBrowserNav && {
              background: '#000000',
              backdropFilter: 'none',
              borderColor: 'oklch(1 0 0 / 8%)',
            }),
          }}
        >
          <div className="flex items-stretch justify-around">
            {/* Home */}
            <button
              onClick={() => {
                if (sheet) closeSheet(() => router.push('/home'))
                else router.push('/home')
              }}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-1.5 py-4 transition-colors',
                isHome && !sheet ? 'text-foreground' : 'text-muted-foreground',
              ].join(' ')}
            >
              <House size={28} strokeWidth={1.5} />
              <span className="text-xs tracking-widest">Home</span>
            </button>

            {/* Apps — hidden when user has no mini-app permissions */}
            {showAppsTab ? (
              <button
                type="button"
                onClick={() => sheet === 'apps' ? closeSheet() : setSheet('apps')}
                className={[
                  'flex flex-1 flex-col items-center justify-center gap-1.5 py-4 transition-colors',
                  sheet === 'apps' ? 'text-foreground' : 'text-muted-foreground',
                ].join(' ')}
              >
                {sheet === 'apps'
                  ? <X size={28} strokeWidth={1.5} />
                  : <Grid2X2 size={28} strokeWidth={1.5} />
                }
                <span className="text-xs tracking-widest">Apps</span>
              </button>
            ) : null}

            {/* Profile */}
            <button
              onClick={() => sheet === 'profile' ? closeSheet() : setSheet('profile')}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-1.5 py-4 transition-colors',
                sheet === 'profile' ? 'text-foreground' : 'text-muted-foreground',
              ].join(' ')}
            >
              {sheet === 'profile' ? (
                <X size={28} strokeWidth={1.5} />
              ) : (
                user ? (
                  <UserAvatar user={user} size={28} className="ring-1 ring-white/10" />
                ) : (
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium"
                    style={{ background: 'oklch(1 0 0 / 12%)', color: 'oklch(1 0 0 / 70%)' }}
                  >
                    ?
                  </div>
                )
              )}
              <span className="text-xs tracking-widest">Profile</span>
            </button>
          </div>
        </div>
      </nav>
      )}
    </>
  )
}
