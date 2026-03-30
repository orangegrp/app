'use client'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { hardNavigateTo } from '@/lib/hard-navigation'
import { consumePostLoginRedirect } from '@/lib/qr-login-redirect'
import { isPWAContext } from '@/lib/pwa'
import { MagicLinkForm } from './MagicLinkForm'
import { QRLoginPanel } from './QRLoginPanel'
import { Spinner } from '@/components/ui/spinner'

const isDev = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_LOGIN_ENABLED === 'true'
type Tab = 'passkey' | 'discord' | 'magic' | 'qr'

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40.575 0C39.9562 1.09866 39.4006 2.2352 38.8954 3.397C34.0967 2.67719 29.2096 2.67719 24.3982 3.397C23.9057 2.2352 23.3374 1.09866 22.7186 0C18.2104 0.770324 13.8157 2.12155 9.64839 4.02841C1.38951 16.2652 -0.845688 28.1863 0.265599 39.9432C5.10222 43.517 10.5197 46.2447 16.2909 47.9874C17.5916 46.2447 18.7407 44.3883 19.7257 42.4562C17.8568 41.7616 16.0509 40.8903 14.3208 39.88C14.7755 39.5517 15.2175 39.2107 15.6468 38.8824C25.7873 43.6559 37.5316 43.6559 47.6847 38.8824C48.1141 39.236 48.5561 39.577 49.0107 39.88C47.2806 40.9029 45.4748 41.7616 43.5931 42.4688C44.5781 44.4009 45.7273 46.2573 47.028 48C52.7991 46.2573 58.2167 43.5422 63.0533 39.9684C64.3666 26.3299 60.8055 14.5099 53.6452 4.04104C49.4905 2.13418 45.0959 0.782952 40.5876 0.0252565L40.575 0ZM21.1401 32.7072C18.0209 32.7072 15.4321 29.8785 15.4321 26.3804C15.4321 22.8824 17.9199 20.041 21.1275 20.041C24.3351 20.041 26.886 22.895 26.8354 26.3804C26.7849 29.8658 24.3224 32.7072 21.1401 32.7072ZM42.1788 32.7072C39.047 32.7072 36.4834 29.8785 36.4834 26.3804C36.4834 22.8824 38.9712 20.041 42.1788 20.041C45.3864 20.041 47.9246 22.895 47.8741 26.3804C47.8236 29.8658 45.3611 32.7072 42.1788 32.7072Z" fill="white" />
    </svg>
  )
}
function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
    </svg>
  )
}
function QRIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
    </svg>
  )
}
function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  )
}

function decodeToken(token: string) {
  const [, b64] = token.split('.')
  return JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))) as {
    sub: string; permissions: string; isPwa: boolean
  }
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: 'Discord sign-in was cancelled or denied.',
  invalid_state: 'Sign-in session expired. Please try again.',
  invite_required: 'An invite is required before you can sign in with Discord.',
  expired_registration: 'Registration expired. Claim a new invite and try again.',
  account_disabled: 'This account is disabled.',
  auth_failed: 'Discord sign-in failed. Please try again.',
  invalid_token: 'Session token was invalid. Please sign in again.',
  method_disabled: 'Discord sign-in is turned off for this account. Use another method or enable it in Settings.',
  default: 'Sign-in failed. Please try again.',
}

export function LoginCard() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>('passkey')
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [devError, setDevError] = useState<string | null>(null)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('error')
    if (!code) return
    setOauthError(OAUTH_ERROR_MESSAGES[code] ?? OAUTH_ERROR_MESSAGES.default)
    const q = new URLSearchParams(searchParams.toString())
    q.delete('error')
    const next = q.toString() ? `/login?${q.toString()}` : '/login'
    router.replace(next, { scroll: false })
  }, [searchParams, router])

  const handleTabChange = (tab: Tab) => {
    // Switching away from QR unmounts QRLoginPanel, which cleans up via useEffect return
    setPasskeyError(null)
    setActiveTab(tab)
  }

  const handleDiscordLogin = () => {
    hardNavigateTo(`/api/auth/discord?isPwa=${isPWAContext()}`)
  }

  const handlePasskeyLogin = async () => {
    if (!window.PublicKeyCredential) {
      setPasskeyError('Passkeys are not supported on this device.')
      return
    }
    setPasskeyLoading(true)
    setPasskeyError(null)
    try {
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        credentials: 'include',
      })
      if (!challengeRes.ok) {
        const body = await challengeRes.json().catch(() => ({})) as { error?: string }
        setFatalError(body.error ?? 'Failed to start passkey login. Please try again.')
        return
      }
      const { options } = await challengeRes.json() as { options: unknown }

      const { startAuthentication } = await import('@simplewebauthn/browser')
      const credential = await startAuthentication({ optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'] })

      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, isPwa: isPWAContext() }),
        credentials: 'include',
      })
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({})) as { error?: string }
        setFatalError(body.error ?? 'Passkey authentication failed. Please try again.')
        return
      }
      const { accessToken } = await verifyRes.json() as { accessToken: string }
      const p = decodeToken(accessToken)
      setAuth(accessToken, { id: p.sub, permissions: p.permissions, isPwa: p.isPwa })
      router.push(consumePostLoginRedirect())
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setPasskeyError('Passkey login was cancelled.')
      } else if (err instanceof Error && err.message) {
        setFatalError(err.message)
      } else {
        setFatalError('Something went wrong. Please try again.')
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  const handleDevLogin = async (role: 'member' | 'admin') => {
    setDevError(null)
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, isPwa: isPWAContext() }),
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setDevError(body.error ?? `Server error ${res.status}`)
        return
      }
      const { accessToken } = await res.json() as { accessToken: string }
      const p = decodeToken(accessToken)
      setAuth(accessToken, { id: p.sub, permissions: p.permissions, isPwa: p.isPwa })
      router.push(consumePostLoginRedirect())
    } catch (e) {
      setDevError(e instanceof Error ? e.message : 'Unknown error')
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'passkey', label: 'Passkey', icon: <KeyIcon /> },
    { id: 'discord', label: 'Discord', icon: <DiscordIcon /> },
    { id: 'magic', label: 'Magic Link', icon: <MailIcon /> },
    { id: 'qr', label: 'QR Code', icon: <QRIcon /> },
  ]

  return (
    <div className="glass-card login-card rounded-3xl px-8 py-10 w-full max-w-sm">
      <div className="flex flex-col items-center gap-4 mb-8">
        <Image src="/icons/polygon.svg" alt="332" width={56} height={56} priority />
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl tracking-widest text-foreground">Members area<span className="blink-cursor">_</span></h1>
          <p className="text-xs tracking-wider text-muted-foreground">Choose a sign in method below</p>
        </div>
      </div>

      {oauthError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center"
        >
          <p className="text-xs tracking-wider" style={{ color: 'oklch(0.7 0.19 22)' }}>
            {oauthError}
          </p>
          <button
            type="button"
            onClick={() => setOauthError(null)}
            className="mt-2 text-xs tracking-widest text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Fatal error screen — replaces tab content */}
      {fatalError ? (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm tracking-wider text-foreground">Sign in failed</p>
            <p className="text-xs tracking-wider text-muted-foreground">{fatalError}</p>
          </div>
          <button
            onClick={() => setFatalError(null)}
            className="glass-button glass-button-glass rounded-xl px-6 py-3 text-sm tracking-widest w-full"
          >
            Back
          </button>
        </div>
      ) : (
        <>
          {/* Tab selector */}
          <div className="mb-6 grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-white/[0.06] p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={[
                  'flex flex-col items-center gap-1 rounded-2xl py-2 px-1 text-xs tracking-wider transition-all',
                  activeTab === tab.id
                    ? 'glass-button glass-button-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {tab.icon}
                <span className="hidden sm:block">{tab.label}</span>
              </button>
            ))}
          </div>

          {activeTab === 'passkey' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground tracking-wider text-center">Use your device biometrics or security key</p>
              <button onClick={handlePasskeyLogin} disabled={passkeyLoading} className="glass-button glass-button-glass rounded-xl px-6 py-3.5 text-sm tracking-wider w-full flex items-center justify-center gap-2 disabled:opacity-50">
                {passkeyLoading ? <Spinner size="sm" /> : <KeyIcon />}
                Sign in with Passkey
              </button>
              {passkeyError && <p className="text-xs tracking-wider text-center" style={{ color: 'oklch(0.7 0.19 22)' }}>{passkeyError}</p>}
            </div>
          )}

          {activeTab === 'discord' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground tracking-wider text-center">Sign in with your Discord account</p>
              <button onClick={handleDiscordLogin} className="glass-button w-full rounded-xl px-6 py-3.5 text-sm tracking-widest text-white flex items-center justify-center gap-3"
                style={{ background: '#5865F2', borderTopColor: 'oklch(1 0 0 / 20%)', borderLeftColor: 'oklch(1 0 0 / 12%)', borderRightColor: 'oklch(0 0 0 / 10%)', borderBottomColor: 'oklch(0 0 0 / 20%)' }}>
                <DiscordIcon />
                Continue with Discord
              </button>
            </div>
          )}

          {activeTab === 'magic' && <MagicLinkForm onFatalError={setFatalError} />}

          {activeTab === 'qr' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground tracking-wider text-center">Scan with your logged-in mobile device</p>
              <QRLoginPanel onFatalError={setFatalError} />
            </div>
          )}
        </>
      )}

      <div className="mt-6 pt-4 border-t border-white/5 text-center">
        <button onClick={() => router.push('/register')} className="text-xs tracking-wider text-muted-foreground hover:text-foreground transition-colors">
          New user? Use invite code
        </button>
      </div>

      {isDev && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <p className="section-label mb-2">Dev bypass</p>
          <div className="flex gap-2">
            <button onClick={() => handleDevLogin('member')} className="glass-button glass-button-ghost flex-1 rounded-lg px-3 py-2 text-xs tracking-widest text-muted-foreground hover:text-foreground">Member</button>
            <button onClick={() => handleDevLogin('admin')} className="glass-button glass-button-ghost flex-1 rounded-lg px-3 py-2 text-xs tracking-widest text-muted-foreground hover:text-foreground">Admin</button>
          </div>
          {devError && <p className="mt-1 text-xs tracking-wider" style={{ color: 'oklch(0.7 0.19 22)' }}>{devError}</p>}
        </div>
      )}
    </div>
  )
}
