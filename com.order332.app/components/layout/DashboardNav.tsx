'use client'
import { House, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { userDisplayName } from '@/lib/user-display'

export function HomeNav() {
  const { user, logout } = useAuth()

  return (
    <>
      <DesktopNav user={user} onLogout={logout} />
      <MobileNav user={user} onLogout={logout} />
    </>
  )
}

interface NavProps {
  user: ReturnType<typeof useAuth>['user']
  onLogout: () => void
}

function DesktopNav({ user, onLogout }: NavProps) {
  return (
    <nav className="hidden sm:flex fixed inset-x-0 top-4 z-50 justify-center px-4">
      <div className="glass-nav-viewport w-full max-w-3xl rounded-2xl px-4 py-2">
        <div className="flex items-center justify-between">
          <span className="text-lg tracking-widest text-foreground">
            332<span className="blink-cursor">_</span>
          </span>

          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm tracking-wider text-muted-foreground">
                {userDisplayName(user)}
              </span>
            )}
            <button
              onClick={onLogout}
              className="glass-button glass-button-ghost rounded-lg px-3 py-1.5 text-xs tracking-widest text-muted-foreground hover:text-foreground"
            >
              logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

function MobileNav({ user, onLogout }: NavProps) {
  const label = user ? userDisplayName(user) : ''
  const initial = label.trim()
    ? label.trim()[0].toUpperCase()
    : user?.id.slice(0, 1).toUpperCase() ?? '?'

  return (
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-50 px-3"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <div className="glass-nav-viewport rounded-2xl px-2 py-1">
        <div className="flex items-center justify-around">
          {/* Home tab */}
          <button className="flex flex-col items-center gap-1 px-5 py-2 text-foreground">
            <House size={22} strokeWidth={1.5} />
            <span className="text-[10px] tracking-widest">home</span>
          </button>

          {/* Profile / logout tab */}
          <button
            onClick={onLogout}
            className="flex flex-col items-center gap-1 px-5 py-2 text-muted-foreground hover:text-foreground"
            style={{ minHeight: '44px' }}
            aria-label="Logout"
          >
            {user ? (
              <div
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-medium tracking-wider"
                style={{ background: 'oklch(1 0 0 / 12%)', color: 'oklch(1 0 0 / 70%)' }}
              >
                {initial}
              </div>
            ) : (
              <User size={22} strokeWidth={1.5} />
            )}
            <span className="text-[10px] tracking-widest">logout</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
