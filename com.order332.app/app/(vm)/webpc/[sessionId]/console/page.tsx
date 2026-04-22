'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { VMRunner, type VMHandle } from '@/components/webpc/VMRunner'
import { Spinner } from '@/components/ui/spinner'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '@/components/ui/command'
import { isBenignCheerpXWasmPlaceholderRejection } from '@/lib/cheerpx-error-filters'
import { apiFetch } from '@/lib/api-client'
import { getSession, touchSession, sessionIdbName, type VMSession } from '@/lib/vm-sessions'

const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 32
const FONT_SIZE_DEFAULT = 18
const FONT_SIZE_STEP = 2

const MACHINE_META: Record<string, { name: string; type: 'CLI' | 'GUI' }> = {
  debian: { name: 'Debian GNU/Linux', type: 'CLI' },
  alpine: { name: 'Alpine Linux', type: 'GUI' },
}

export default function ConsolePage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = use(params)

  const [session, setSession] = useState<VMSession | null | 'loading'>('loading')
  const [statusText, setStatusText] = useState('Initializing...')
  const [vmReady, setVmReady] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(true)
  const [pointerLocked, setPointerLocked] = useState(false)
  const [isDownloading, setIsDownloading] = useState(true)
  const [fontSize, setFontSize] = useState(FONT_SIZE_DEFAULT)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [vmHandle, setVmHandle] = useState<VMHandle | null>(null)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [showMobileGuiWarning, setShowMobileGuiWarning] = useState(false)
  /** R2 presigned disk URL; `undefined` after load means use same-origin `/webpc-disks/` (e.g. dev 503 fallback). */
  const [diskHttpUrl, setDiskHttpUrl] = useState<string | undefined>(undefined)
  const [diskPresign, setDiskPresign] = useState<'loading' | 'ready' | 'error'>('loading')
  const [diskPresignError, setDiskPresignError] = useState<string | null>(null)
  const [diskRetryKey, setDiskRetryKey] = useState(0)
  // Computed once on mount — safe to use in keyboard handler closure
  const [isMac] = useState(() =>
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform)
  )
  const [isMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  )

  useEffect(() => {
    const s = getSession(sessionId)
    if (!s) {
      // Hard navigation so the destination document loads without COEP headers.
      window.location.replace('/webpc')
      return
    }
    touchSession(sessionId)
    const m = MACHINE_META[s.machineId] ?? { type: 'CLI' }
    const showWarning = isMobile && m.type === 'GUI'
    setTimeout(() => {
      setSession(s)
      if (showWarning) setShowMobileGuiWarning(true)
    }, 0)
  }, [sessionId, isMobile])

  useEffect(() => {
    if (session === 'loading' || session === null) return
    const vm = session
    let cancelled = false

    async function loadDiskUrl(): Promise<void> {
      setDiskPresign('loading')
      setDiskPresignError(null)
      const q = new URLSearchParams({
        machineId: vm.machineId,
        sessionId,
      })
      const res = await apiFetch(`/webpc/disk-url?${q}`)
      if (cancelled) return
      if (res.ok) {
        const data = (await res.json()) as { url: string; expiresIn: number }
        setDiskHttpUrl(data.url)
        setDiskPresign('ready')
        return
      }
      if (process.env.NODE_ENV === 'development' && res.status === 503) {
        setDiskHttpUrl(undefined)
        setDiskPresign('ready')
        return
      }
      const err = (await res.json().catch(() => ({ error: 'Request failed' }))) as { error: string }
      setDiskPresignError(err.error ?? 'Request failed')
      setDiskPresign('error')
    }

    void loadDiskUrl()
    return () => {
      cancelled = true
    }
  }, [session, sessionId, diskRetryKey])

  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      if (isBenignCheerpXWasmPlaceholderRejection(e.reason)) {
        e.preventDefault()
        return
      }
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? 'Unknown error')
      setFatalError(msg)
      e.preventDefault()
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  function toggleFullscreen() {
    type WDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void }
    type WEl = HTMLElement & { webkitRequestFullscreen?: () => void }
    const doc = document as WDoc
    const el = document.documentElement as WEl
    if (!(document.fullscreenElement || doc.webkitFullscreenElement)) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => { })
      } else {
        el.webkitRequestFullscreen?.()
      }
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => { })
      } else {
        doc.webkitExitFullscreen?.()
      }
      setIsFullscreen(false)
    }
  }

  const increaseFontSize = useCallback(() =>
    setFontSize(s => Math.min(FONT_SIZE_MAX, s + FONT_SIZE_STEP)), [])
  const decreaseFontSize = useCallback(() =>
    setFontSize(s => Math.max(FONT_SIZE_MIN, s - FONT_SIZE_STEP)), [])
  const resetFontSize = useCallback(() => setFontSize(FONT_SIZE_DEFAULT), [])

  // ⌘+= / Ctrl+= → increase, ⌘+- / Ctrl+- → decrease, ⌘+0 / Ctrl+0 → reset
  // ⌘P / Ctrl+P → toggle command palette (override browser print)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()

      if (key === 'p') {
        e.preventDefault()
        e.stopPropagation()
        setPaletteOpen(v => !v)
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        increaseFontSize()
      } else if (e.key === '-') {
        e.preventDefault()
        decreaseFontSize()
      } else if (e.key === '0') {
        e.preventDefault()
        resetFontSize()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isMac, increaseFontSize, decreaseFontSize, resetFontSize])

  if (session === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
        <Spinner size="md" clockwise />
      </div>
    )
  }

  if (!session) return null

  if (diskPresign === 'loading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#0d0d0d] px-4">
        <Spinner size="md" clockwise />
        <p className="text-sm text-muted-foreground tracking-wider">Preparing disk image…</p>
      </div>
    )
  }

  if (diskPresign === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0d0d0d] px-4">
        <div className="glass-card max-w-md rounded-2xl px-8 py-7 text-center">
          <p className="card-label mb-2">Disk URL unavailable</p>
          <p className="text-sm text-muted-foreground tracking-wider mb-6">
            {diskPresignError ?? 'Could not load a disk image URL. Configure R2 or try again.'}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => setDiskRetryKey((k) => k + 1)}
              className="glass-button glass-button-glass rounded-lg px-4 py-2 text-xs tracking-widest"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/webpc')}
              className="glass-button glass-button-ghost rounded-lg px-4 py-2 text-xs tracking-widest text-muted-foreground"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const meta = MACHINE_META[session.machineId] ?? { name: session.machineId, type: 'CLI' as const }
  const isGUI = meta.type === 'GUI'

  return (
    <div className="relative flex h-screen flex-col bg-[#0d0d0d] overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-2 sm:gap-3 border-b border-white/5 bg-[oklch(0.145_0_0_/_90%)] px-3 sm:px-4 py-2.5 backdrop-blur-md">
        {/* Hard navigation — clears COEP so the destination document loads without require-corp */}
        <button
          onClick={() => window.location.assign('/webpc')}
          className="glass-button glass-button-ghost rounded-lg px-2 sm:px-3 py-1.5 text-xs tracking-widest text-muted-foreground hover:text-foreground shrink-0"
        >
          <span className="sm:hidden">←</span>
          <span className="hidden sm:inline">← Web PC</span>
        </button>

        <div className="hidden sm:block mx-1 h-4 w-px bg-white/10" />

        {/* Machine name + type badge */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm tracking-wider text-foreground truncate">
            {meta.name}
          </span>
          <span className="glass-button rounded-full px-2 py-0.5 text-xs tracking-widest text-muted-foreground shrink-0">
            {meta.type}
          </span>
          <span className="hidden sm:inline text-xs text-muted-foreground tracking-wider opacity-30 truncate font-mono">
            {sessionId.slice(0, 8)}
          </span>
        </div>

        {/* Status indicator + capture hint */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={[
              'h-1.5 w-1.5 rounded-full transition-colors duration-500',
              vmReady ? 'bg-green-400' : 'bg-yellow-400 animate-pulse',
            ].join(' ')}
          />
          {!vmReady && (
            <span className="hidden sm:inline text-xs text-muted-foreground tracking-wider opacity-70 max-w-[200px] truncate">
              {statusText}
            </span>
          )}
        </div>

        <div className="hidden sm:block mx-1 h-4 w-px bg-white/10" />

        {isGUI && vmReady && !pointerLocked && (
          <span className="hidden sm:inline text-xs tracking-wider text-muted-foreground shrink-0">
            Click display to capture
          </span>
        )}
        {isGUI && pointerLocked && (
          <span className="hidden sm:inline text-xs tracking-wider text-muted-foreground shrink-0">
            Press <span className="glass-button rounded-md px-2 py-0.5 text-xs tracking-widest opacity-60 select-none">ESC</span> to release
          </span>
        )}

        {/* Terminal toggle — GUI machines only */}
        {isGUI && (
          <button
            onClick={() => setTerminalOpen((v) => !v)}
            className={[
              'glass-button rounded-lg px-3 py-1.5 text-xs tracking-widest transition-colors shrink-0',
              terminalOpen
                ? 'text-foreground bg-white/8'
                : 'glass-button-ghost text-muted-foreground hover:text-foreground',
            ].join(' ')}
            title={terminalOpen ? 'Hide terminal pane' : 'Show terminal pane'}
          >
            tty
          </button>
        )}

        {/* Command palette trigger */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="glass-button glass-button-ghost rounded-lg px-3 py-1.5 text-xs tracking-widest text-muted-foreground hover:text-foreground flex items-center shrink-0"
          title="Open command palette"
        >
          <span className="sm:hidden">⌘</span>
          <span className="hidden sm:inline">
            Open command palette
            <span className="inline-flex items-center gap-1 opacity-40 pointer-events-none ml-2">
              <KbdGroup>
                <Kbd className="text-[10px] h-4 px-1">{isMac ? '⌘' : 'Ctrl'}</Kbd>
                <Kbd className="text-[10px] h-4 px-1">P</Kbd>
              </KbdGroup>
            </span>
          </span>
        </button>

        {/* Fullscreen toggle — desktop only */}
        <button
          onClick={toggleFullscreen}
          className="hidden sm:block glass-button glass-button-ghost rounded-lg px-3 py-1.5 text-xs tracking-widest text-muted-foreground hover:text-foreground shrink-0"
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? '⊠' : '⊡'}
        </button>
      </header>

      {/* ── VM area ──────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Loading overlay */}
        {!vmReady && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            style={{ backdropFilter: 'blur(12px)', background: 'oklch(0.08 0 0 / 70%)' }}
          >
            <div className="dot-pattern pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
            <div className="relative glass-card rounded-2xl px-8 py-7 text-center flex flex-col items-center gap-4 max-w-sm w-full mx-4">
              <Spinner size="md" clockwise={!isDownloading} />
              <div>
                <p className="card-label mb-1.5">{meta.name}</p>
                <p className="text-sm text-muted-foreground tracking-wider leading-relaxed">
                  {statusText}<span className="blink-cursor">_</span>
                </p>
                <p className="mt-3 text-xs text-muted-foreground opacity-40 tracking-wider">
                  Powered by CheerpX · runs entirely in your browser
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Fatal error overlay — unhandled rejection from CheerpX runtime */}
        {fatalError && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ backdropFilter: 'blur(12px)', background: 'oklch(0.08 0 0 / 80%)' }}
          >
            <div className="dot-pattern pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
            <div className="relative glass-card rounded-2xl px-8 py-7 text-center flex flex-col items-center gap-4 max-w-sm w-full mx-4">
              <div>
                <p className="card-label mb-1.5">Runtime Error</p>
                <p className="text-sm text-muted-foreground tracking-wider leading-relaxed break-words">
                  {fatalError}
                </p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="glass-button glass-button-glass rounded-lg px-4 py-2 text-xs tracking-widest"
              >
                Reload
              </button>
            </div>
          </div>
        )}

        {/* Mobile GUI performance warning — blocks boot until dismissed */}
        {showMobileGuiWarning && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ backdropFilter: 'blur(12px)', background: 'oklch(0.08 0 0 / 80%)' }}
          >
            <div className="dot-pattern pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
            <div className="relative glass-card rounded-2xl px-8 py-7 text-center flex flex-col items-center gap-5 max-w-sm w-full mx-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-yellow-400/20 bg-yellow-400/10">
                <svg className="h-6 w-6 text-yellow-400/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <p className="card-label mb-1.5 text-yellow-400/70">Performance warning</p>
                <p className="text-sm text-muted-foreground tracking-wider leading-relaxed">
                  {meta.name} is a graphical environment. Running a full GUI desktop via WebAssembly
                  on mobile will be very slow and may be unusable.
                </p>
                <p className="mt-3 text-xs text-muted-foreground opacity-50 tracking-wider">
                  A desktop browser is strongly recommended for GUI machines.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => window.location.assign('/webpc')}
                  className="glass-button glass-button-ghost rounded-lg px-4 py-2 text-xs tracking-widest text-muted-foreground hover:text-foreground"
                >
                  Go back
                </button>
                <button
                  onClick={() => setShowMobileGuiWarning(false)}
                  className="glass-button glass-button-glass rounded-lg px-4 py-2 text-xs tracking-widest"
                >
                  Continue anyway
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VMRunner — mounted once warning is dismissed (or not needed) */}
        {!showMobileGuiWarning && (
          <VMRunner
            machine={session.machineId}
            diskHttpUrl={diskHttpUrl}
            idbName={sessionIdbName(sessionId)}
            terminalOpen={terminalOpen}
            fontSize={fontSize}
            onStatusChange={setStatusText}
            onStateChange={(s) => { if (s === 'ready') setVmReady(true) }}
            onPointerLockChange={setPointerLocked}
            onDownloadingChange={setIsDownloading}
            onReady={setVmHandle}
          />
        )}
      </div>

      {/* ── Command palette ───────────────────────────────────────────── */}
      <CommandDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        title="VM Command Palette"
        description="Search and run VM commands"
      >
        <Command>
          <CommandInput placeholder="Search commands..." />
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>

            {/* Font Size */}
            <CommandGroup heading="Font Size">
              <CommandItem
                onSelect={() => { increaseFontSize(); setPaletteOpen(false) }}
              >
                <span>Increase font size</span>
                <CommandShortcut>
                  <KbdGroup>
                    <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
                    <Kbd>=</Kbd>
                  </KbdGroup>
                </CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => { decreaseFontSize(); setPaletteOpen(false) }}
              >
                <span>Decrease font size</span>
                <CommandShortcut>
                  <KbdGroup>
                    <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
                    <Kbd>-</Kbd>
                  </KbdGroup>
                </CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => { resetFontSize(); setPaletteOpen(false) }}
              >
                <span>Reset font size</span>
                <CommandShortcut>
                  <KbdGroup>
                    <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
                    <Kbd>0</Kbd>
                  </KbdGroup>
                </CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* View */}
            <CommandGroup heading="View">
              <CommandItem
                onSelect={() => { toggleFullscreen(); setPaletteOpen(false) }}
              >
                <span>{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</span>
              </CommandItem>
              {isGUI && (
                <CommandItem
                  onSelect={() => { setTerminalOpen(v => !v); setPaletteOpen(false) }}
                >
                  <span>{terminalOpen ? 'Hide terminal pane' : 'Show terminal pane'}</span>
                </CommandItem>
              )}
            </CommandGroup>

            {/* TTY switching — GUI only when VM reports support */}
            {isGUI && vmHandle?.supportsTTYSwitch && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Switch TTY">
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <CommandItem
                      key={n}
                      onSelect={() => { vmHandle.switchTTY(n); setPaletteOpen(false) }}
                    >
                      <span>TTY {n} — text console</span>
                    </CommandItem>
                  ))}
                  <CommandItem
                    onSelect={() => { vmHandle.switchTTY(7); setPaletteOpen(false) }}
                  >
                    <span>TTY 7 — graphical (Xorg)</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  )
}
