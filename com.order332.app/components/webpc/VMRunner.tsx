'use client'

// Safari does not implement requestIdleCallback. Polyfill at module level so
// it is available before any dynamic imports (xterm uses it internally).
if (typeof window !== 'undefined' && typeof requestIdleCallback === 'undefined') {
  window.requestIdleCallback = (cb, options) => {
    const start = Date.now()
    return window.setTimeout(() => {
      cb({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (Date.now() - start)) })
    }, options?.timeout ?? 1) as unknown as number
  }
  window.cancelIdleCallback = window.clearTimeout
}

import { useEffect, useRef, useState, useCallback } from 'react'
import '@xterm/xterm/css/xterm.css'
import { isBenignCheerpXWasmPlaceholderRejection } from '@/lib/cheerpx-error-filters'
import { webpcDiskPublicPath, type MachineId } from '@/lib/webpc-disks'
import { Spinner } from '../ui/spinner'

export type { MachineId }

interface MachineSpec {
  /** Same-origin path to ext2 image (served from /public/webpc-disks) when no `diskHttpUrl` prop */
  diskPath: string
  idbName: string
  cmd: string
  args: string[]
  opts: {
    env?: string[]
    cwd?: string
    uid: number
    gid: number
  }
  /** True → render KMS canvas for graphical output */
  needsDisplay: boolean
  /** True → also attach a text console (xterm) */
  needsTerminal: boolean
  /** VT number that the graphical environment uses (default 7 for Xorg) */
  guiVT?: number
}

const MACHINE_SPECS: Record<MachineId, MachineSpec> = {
  debian: {
    diskPath: webpcDiskPublicPath('debian'),
    idbName: 'cheerpx-debian-v1',
    cmd: '/bin/bash',
    args: ['--login'],
    opts: {
      env: [
        'HOME=/home/user',
        'TERM=xterm-256color',
        'USER=user',
        'SHELL=/bin/bash',
        'EDITOR=vim',
        'LANG=en_US.UTF-8',
        'LC_ALL=C',
      ],
      cwd: '/home/user',
      uid: 1000,
      gid: 1000,
    },
    needsDisplay: false,
    needsTerminal: true,
  },
  alpine: {
    diskPath: webpcDiskPublicPath('alpine'),
    idbName: 'cheerpx-alpine-v1',
    cmd: '/sbin/init',
    args: [],
    opts: { uid: 0, gid: 0 },
    needsDisplay: true,
    needsTerminal: true,
    guiVT: 7,
  },
  debianTerminal: {
    diskPath: webpcDiskPublicPath('debianTerminal'),
    idbName: 'cheerpx-332-debian-terminal-v1',
    cmd: '/bin/bash',
    args: ['--login'],
    opts: {
      env: [
        'HOME=/home/user',
        'TERM=xterm-256color',
        'USER=user',
        'SHELL=/bin/bash',
        'EDITOR=vim',
        'LANG=en_US.UTF-8',
        'LC_ALL=C',
      ],
      cwd: '/home/user',
      uid: 1000,
      gid: 1000,
    },
    needsDisplay: false,
    needsTerminal: true,
  },
  debianGui: {
    diskPath: webpcDiskPublicPath('debianGui'),
    idbName: 'cheerpx-332-debian-gui-v1',
    cmd: '/sbin/init',
    args: [],
    opts: { uid: 0, gid: 0 },
    needsDisplay: true,
    needsTerminal: true,
    guiVT: 7,
  },
  alpineTerminal: {
    diskPath: webpcDiskPublicPath('alpineTerminal'),
    idbName: 'cheerpx-332-alpine-terminal-v1',
    cmd: '/bin/bash',
    args: ['--login'],
    opts: {
      env: [
        'HOME=/home/user',
        'TERM=xterm-256color',
        'USER=user',
        'SHELL=/bin/bash',
        'EDITOR=vim',
        'LANG=en_US.UTF-8',
        'LC_ALL=C',
      ],
      cwd: '/home/user',
      uid: 1000,
      gid: 1000,
    },
    needsDisplay: false,
    needsTerminal: true,
  },
  alpineGui: {
    diskPath: webpcDiskPublicPath('alpineGui'),
    idbName: 'cheerpx-332-alpine-gui-v1',
    cmd: '/sbin/init',
    args: [],
    opts: { uid: 0, gid: 0 },
    needsDisplay: true,
    needsTerminal: true,
    guiVT: 7,
  },
}

// Self-hosted via `pnpm mirror-cheerpx` → public/cheerpx/1.2.9/
const CHEERPX_ESM_PATH = '/cheerpx/1.2.9/cx.esm.js'

export type VMStatus = 'loading' | 'ready' | 'error'

/** Imperative handle returned via onReady — allows the parent to trigger
 *  CheerpX actions that aren't expressible as React props. */
export interface VMHandle {
  /** Switch the Linux virtual terminal. idx is 1-based (1–6 = text console, 7 = Xorg). */
  switchTTY: (idx: number) => void
  /** True when host-side TTY switching is available. */
  supportsTTYSwitch: boolean
}

export interface VMRunnerProps {
  machine: MachineId
  /** When set (e.g. R2 presigned GET), used instead of same-origin `spec.diskPath` for HttpBytesDevice */
  diskHttpUrl?: string
  /** For GUI machines: whether the terminal pane is visible */
  terminalOpen?: boolean
  /** Terminal font size in pixels (default: 18) */
  fontSize?: number
  onStatusChange?: (text: string) => void
  onStateChange?: (state: VMStatus) => void
  /** Called when pointer lock is acquired or released on the GUI canvas */
  onPointerLockChange?: (locked: boolean) => void
  /** Called with true while actively downloading from a remote server (CheerpX, disk image) */
  onDownloadingChange?: (downloading: boolean) => void
  /** Override the machine spec's default IDB database name (used for per-session stores) */
  idbName?: string
  /** Called once CheerpX has initialised and the handle is available */
  onReady?: (handle: VMHandle) => void
}

// ── CheerpX loader ───────────────────────────────────────────────────────────

function loadCheerpX(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.CheerpX) { resolve(); return }
    const onLoaded = () => resolve()
    window.addEventListener('cheerpx:loaded', onLoaded, { once: true })
    const script = document.createElement('script')
    script.type = 'module'
    script.textContent = [
      `import * as CX from '${CHEERPX_ESM_PATH}';`,
      'window.CheerpX = CX;',
      "window.dispatchEvent(new Event('cheerpx:loaded'));",
    ].join('\n')
    script.onerror = () => {
      window.removeEventListener('cheerpx:loaded', onLoaded)
      reject(new Error('Failed to load CheerpX module'))
    }
    document.head.appendChild(script)
  })
}

// ── Terminal theme ────────────────────────────────────────────────────────────

const TERM_THEME = {
  background: '#0a0a0a',
  foreground: '#e8e8e8',
  cursor: '#e8e8e8',
  black: '#1a1a1a', brightBlack: '#4a4a4a',
  red: '#e06c75', brightRed: '#ff7b86',
  green: '#98c379', brightGreen: '#b5e890',
  yellow: '#e5c07b', brightYellow: '#ffd787',
  blue: '#61afef', brightBlue: '#7ec8ff',
  magenta: '#c678dd', brightMagenta: '#e394ff',
  cyan: '#56b6c2', brightCyan: '#6dcfd8',
  white: '#abb2bf', brightWhite: '#ffffff',
}

const TERMINAL_DEFAULT_HEIGHT = 240
const TERMINAL_MIN_HEIGHT = 80
const TERMINAL_MAX_HEIGHT = 600

// ── VMRunner ─────────────────────────────────────────────────────────────────

export function VMRunner({
  machine,
  diskHttpUrl: diskHttpUrlProp,
  terminalOpen = true,
  fontSize = 18,
  onStatusChange,
  onStateChange,
  onPointerLockChange,
  onDownloadingChange,
  idbName,
  onReady,
}: VMRunnerProps) {
  const spec = MACHINE_SPECS[machine]
  const showSplitLayout = spec.needsDisplay && spec.needsTerminal

  const termContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const [vmStatus, setVmStatus] = useState<VMStatus>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [termHeight, setTermHeight] = useState(TERMINAL_DEFAULT_HEIGHT)
  const [guiActive, setGuiActive] = useState(false)
  // Last readable console line — shown in the GUI waiting overlay
  const [bootLine, setBootLine] = useState('')
  // Brief center-screen pill: 'captured' | 'released' | null
  const [lockNotif, setLockNotif] = useState<'captured' | 'released' | null>(null)

  // Virtual mouse cursor position — accumulated from pointer-lock movementX/Y
  const virtualMousePos = useRef({ x: 512, y: 384 })
  const lockNotifTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragState = useRef<{ startY: number; startH: number } | null>(null)
  // Populated by boot after the terminal is initialised; called on fontSize changes
  const applyFontSizeRef = useRef<((size: number) => void) | null>(null)
  // Browsers enforce a ~1s gap between releasing and re-acquiring pointer lock.
  // Track the cooldown so we don't attempt to lock during the forbidden window.
  const pointerLockCooldownRef = useRef(false)
  // rAF-throttle for synthetic mousemove: accumulate raw events, dispatch once per frame.
  const pendingMoveRef = useRef<MouseEvent | null>(null)
  const moveRafRef = useRef<number | null>(null)

  const setStatusText = useCallback((t: string) => onStatusChange?.(t), [onStatusChange])
  const setVMState = useCallback(
    (s: VMStatus) => { setVmStatus(s); onStateChange?.(s) },
    [onStateChange]
  )

  // ── Live font-size application ────────────────────────────────────────────
  useEffect(() => {
    applyFontSizeRef.current?.(fontSize)
  }, [fontSize])

  // ── Pointer lock setup (GUI machines only) ────────────────────────────────
  // When pointer lock is active, mousemove/mousedown/mouseup/click events have
  // frozen clientX/clientY (pinned to the lock point) and real movement only in
  // movementX/movementY. CheerpX's Xorg driver uses absolute coordinates, so we
  // intercept those events in CAPTURE phase (before CheerpX sees them), compute a
  // virtual cursor position from the deltas, and re-dispatch with correct coords.
  useEffect(() => {
    if (!spec.needsDisplay) return
    const maybeCanvas = canvasRef.current
    if (!maybeCanvas) return
    // TS can't narrow const refs into closures — rebind as non-nullable
    const canvas: HTMLCanvasElement = maybeCanvas

    let isSynthetic = false

    function dispatchSynthetic(type: string, src: MouseEvent, cx: number, cy: number) {
      isSynthetic = true
      canvas.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true,
        clientX: cx, clientY: cy, screenX: cx, screenY: cy,
        button: src.button, buttons: src.buttons,
        movementX: src.movementX, movementY: src.movementY,
        detail: src.detail,
        ctrlKey: src.ctrlKey, altKey: src.altKey,
        shiftKey: src.shiftKey, metaKey: src.metaKey,
      }))
      isSynthetic = false
    }

    type WDoc = typeof document & { webkitPointerLockElement?: Element | null }

    function translateEvent(e: MouseEvent) {
      if (isSynthetic) return // our own re-dispatch — let it through
      const lockEl = document.pointerLockElement ?? (document as WDoc).webkitPointerLockElement
      if (lockEl !== canvas) return // not locked — pass through

      e.stopImmediatePropagation()

      const rect = canvas.getBoundingClientRect()

      if (e.type === 'mousemove') {
        // Accumulate deltas synchronously so virtual position stays accurate
        // across all raw events, even if we only dispatch once per frame.
        virtualMousePos.current = {
          x: Math.max(0, Math.min(rect.width,  virtualMousePos.current.x + e.movementX)),
          y: Math.max(0, Math.min(rect.height, virtualMousePos.current.y + e.movementY)),
        }
        pendingMoveRef.current = e
        if (!moveRafRef.current) {
          moveRafRef.current = requestAnimationFrame(() => {
            moveRafRef.current = null
            const src = pendingMoveRef.current
            pendingMoveRef.current = null
            const currentLock = document.pointerLockElement ?? (document as WDoc).webkitPointerLockElement
            if (!src || currentLock !== canvas) return
            const r = canvas.getBoundingClientRect()
            const fx = r.left + virtualMousePos.current.x
            const fy = r.top  + virtualMousePos.current.y
            dispatchSynthetic('mousemove', src, fx, fy)
          })
        }
        return
      }

      // clicks / mousedown / mouseup — dispatch immediately with current virtual pos
      const cx = rect.left + virtualMousePos.current.x
      const cy = rect.top  + virtualMousePos.current.y
      dispatchSynthetic(e.type, e, cx, cy)
    }

    function onLockChange() {
      const lockEl = document.pointerLockElement ?? (document as WDoc).webkitPointerLockElement
      const locked = lockEl === canvas
      onPointerLockChange?.(locked)

      if (locked) {
        // Snap virtual cursor to canvas centre on lock
        const rect = canvas.getBoundingClientRect()
        virtualMousePos.current = { x: rect.width / 2, y: rect.height / 2 }
      } else {
        // Browser mandates ~1 s gap before re-acquiring pointer lock.
        // Guard against SecurityError by blocking clicks during the cooldown.
        pointerLockCooldownRef.current = true
        setTimeout(() => { pointerLockCooldownRef.current = false }, 1500)
      }

      // Show brief pill notification
      if (lockNotifTimer.current) clearTimeout(lockNotifTimer.current)
      setLockNotif(locked ? 'captured' : 'released')
      lockNotifTimer.current = setTimeout(() => setLockNotif(null), 1400)
    }

    const EVENTS = ['mousemove', 'mousedown', 'mouseup', 'click'] as const
    EVENTS.forEach((ev) => canvas.addEventListener(ev, translateEvent, true))
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('webkitpointerlockchange', onLockChange)

    return () => {
      EVENTS.forEach((ev) => canvas.removeEventListener(ev, translateEvent, true))
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('webkitpointerlockchange', onLockChange)
      if (lockNotifTimer.current) clearTimeout(lockNotifTimer.current)
      // Cancel any pending rAF mousemove dispatch
      if (moveRafRef.current) { cancelAnimationFrame(moveRafRef.current); moveRafRef.current = null }
      pendingMoveRef.current = null
    }
  }, [spec.needsDisplay]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canvas click handler ───────────────────────────────────────────────────
  function handleCanvasClick(e: React.MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.focus()
    type WCanvas = HTMLCanvasElement & { webkitRequestPointerLock?: () => void }
    const lockEl = document.pointerLockElement ?? (document as { webkitPointerLockElement?: Element }).webkitPointerLockElement
    if (!lockEl && !pointerLockCooldownRef.current) {
      // Initialise virtual cursor to actual click position so the first
      // synthesised event lands where the user clicked.
      const rect = canvas.getBoundingClientRect()
      virtualMousePos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
      try {
        const wCanvas = canvas as WCanvas
        // requestPointerLock returns a Promise on modern browsers; older Safari
        // uses webkitRequestPointerLock() which returns void.
        const result = wCanvas.requestPointerLock
          ? wCanvas.requestPointerLock()
          : wCanvas.webkitRequestPointerLock?.()
        if (result instanceof Promise) result.catch(() => {})
      } catch { /* SecurityError: browser cooldown — safe to ignore */ }
    }
  }

  // ── Drag-to-resize handle ──────────────────────────────────────────────────
  function onDragStart(e: React.MouseEvent | React.TouchEvent) {
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragState.current = { startY, startH: termHeight }
    function onMove(ev: MouseEvent | TouchEvent) {
      if (!dragState.current) return
      const y = ev instanceof MouseEvent ? ev.clientY : ev.touches[0].clientY
      const delta = dragState.current.startY - y
      setTermHeight(Math.max(TERMINAL_MIN_HEIGHT, Math.min(TERMINAL_MAX_HEIGHT, dragState.current.startH + delta)))
    }
    function onUp() {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let bootStage = 'start'

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isBenignCheerpXWasmPlaceholderRejection(event.reason)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
    }
    window.addEventListener('unhandledrejection', onUnhandledRejection, { capture: true })

    async function boot() {
      try {
        bootStage = 'loadCheerpX'
        onDownloadingChange?.(true)
        setStatusText('Loading virtualization engine...')
        await loadCheerpX()
        if (cancelled) return

        const CX = window.CheerpX
        if (!CX) throw new Error('CheerpX failed to initialise')

        bootStage = 'importTerminal'
        const { Terminal: TerminalCtor } = await import('@xterm/xterm')
        const { FitAddon: FitAddonCtor } = await import('@xterm/addon-fit')
        if (cancelled) return

        bootStage = 'createDevices'
        setStatusText('Connecting to disk image...')
        const diskHttpUrl =
          diskHttpUrlProp ?? new URL(spec.diskPath, window.location.origin).href
        const baseDevice = await CX.HttpBytesDevice.create(diskHttpUrl)
        if (cancelled) return

        onDownloadingChange?.(false)
        setStatusText('Initialising local storage...')
        const idbDevice = await CX.IDBDevice.create(idbName ?? spec.idbName)
        if (cancelled) return
        const overlayDevice = await CX.OverlayDevice.create(baseDevice, idbDevice)
        if (cancelled) return
        const webDevice = await CX.WebDevice.create('')
        const dataDevice = await CX.DataDevice.create()

        bootStage = 'createLinux'
        setStatusText('Starting Linux kernel...')
        const cx = await CX.Linux.create({
          mounts: [
            { type: 'ext2', path: '/', dev: overlayDevice },
            { type: 'dir', path: '/app', dev: webDevice },
            { type: 'dir', path: '/data', dev: dataDevice },
            { type: 'devs', path: '/dev' },
            { type: 'devpts', path: '/dev/pts' },
            { type: 'proc', path: '/proc' },
            { type: 'sys', path: '/sys' },
          ],
        })
        if (cancelled) return

        bootStage = 'wireConsole'
        if (spec.needsTerminal) {
          const container = termContainerRef.current
          if (!container) throw new Error('Terminal container not found')

          const term = new TerminalCtor({
            convertEol: true,
            cursorBlink: true,
            fontSize: 18,
            fontFamily: '"VT323", "Courier New", monospace',
            theme: TERM_THEME,
            allowTransparency: true,
          })
          const fitAddon = new FitAddonCtor()
          term.loadAddon(fitAddon)
          term.open(container)
          fitAddon.fit()

          const textDecoder = new TextDecoder('utf-8', { fatal: false })
          let pendingText = ''
          let lineDebounce: ReturnType<typeof setTimeout> | null = null

          function extractLastLine(chunk: string) {
            pendingText += chunk
            if (lineDebounce) clearTimeout(lineDebounce)
            lineDebounce = setTimeout(() => {
              const clean = pendingText
                .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
                .replace(/\x1b[()][A-B0-1]/g, '')
                .replace(/\x1b[=>]/g, '')
                .replace(/\r/g, '\n')
              const last = clean.split('\n').map(l => l.trim()).filter(Boolean).pop()
              if (last) setBootLine(last.slice(0, 72))
              pendingText = ''
            }, 80)
          }

          const sendKey = cx.setCustomConsole(
            (buf: Uint8Array) => {
              term.write(new Uint8Array(buf))
              extractLastLine(textDecoder.decode(buf, { stream: true }))
            },
            term.cols,
            term.rows
          )
          term.onData((str: string) => {
            for (let i = 0; i < str.length; i++) sendKey(str.charCodeAt(i))
          })

          applyFontSizeRef.current = (size: number) => {
            term.options.fontSize = size
            fitAddon.fit()
          }
          applyFontSizeRef.current(fontSize)

          const roTerm = new ResizeObserver(() => fitAddon.fit())
          roTerm.observe(container)
          cleanupRef.current = () => {
            applyFontSizeRef.current = null
            roTerm.disconnect()
            if (lineDebounce) clearTimeout(lineDebounce)
            term.dispose()
          }
        }

        bootStage = 'wireDisplay'
        if (spec.needsDisplay) {
          const canvas = canvasRef.current
          if (!canvas) throw new Error('Canvas element not found')

          let resizeRaf: number | null = null
          let lastW = 0
          let lastH = 0

          function applySizeNow() {
            if (!canvas?.parentElement) return
            const w = Math.round(canvas.parentElement.offsetWidth || 1024)
            const h = Math.round(canvas.parentElement.offsetHeight || 768)
            if (w === lastW && h === lastH) return
            lastW = w
            lastH = h
            canvas.width = w
            canvas.height = h
            cx.setKmsCanvas(canvas, w, h)
          }

          function scheduleApplySize() {
            if (resizeRaf !== null) return
            resizeRaf = requestAnimationFrame(() => {
              resizeRaf = null
              applySizeNow()
            })
          }

          scheduleApplySize()
          const roCanvas = new ResizeObserver(scheduleApplySize)
          if (canvas.parentElement) roCanvas.observe(canvas.parentElement)
          window.addEventListener('resize', scheduleApplySize)
          window.addEventListener('orientationchange', scheduleApplySize)
          document.addEventListener('fullscreenchange', scheduleApplySize)
          const vv = window.visualViewport
          vv?.addEventListener('resize', scheduleApplySize)

          const ttyEventListener = cx.setActivateConsole((vtIdx: number) => {
            setGuiActive(vtIdx === (spec.guiVT ?? 7))
          })
          onReady?.({
            supportsTTYSwitch: true,
            switchTTY: (idx: number) => ttyEventListener(new CustomEvent('vt', { detail: idx })),
          })

          const prev = cleanupRef.current
          cleanupRef.current = () => {
            prev?.()
            roCanvas.disconnect()
            window.removeEventListener('resize', scheduleApplySize)
            window.removeEventListener('orientationchange', scheduleApplySize)
            document.removeEventListener('fullscreenchange', scheduleApplySize)
            vv?.removeEventListener('resize', scheduleApplySize)
            if (resizeRaf !== null) {
              cancelAnimationFrame(resizeRaf)
              resizeRaf = null
            }
          }
        } else {
          onReady?.({
            supportsTTYSwitch: false,
            switchTTY: () => {},
          })
        }

        if (cancelled) return
        bootStage = 'runInit'
        setStatusText(spec.needsDisplay ? 'Booting graphical environment...' : 'Starting shell...')
        setVMState('ready')
        await cx.run(spec.cmd, spec.args, spec.opts)
      } catch (err) {
        if (cancelled) return
        const msg = `[stage:${bootStage}] ${err instanceof Error ? err.message : String(err)}`
        onDownloadingChange?.(false)
        setErrorMsg(msg)
        setVMState('error')
        setStatusText(`Error: ${msg}`)
      } finally {
        window.removeEventListener('unhandledrejection', onUnhandledRejection, { capture: true })
      }
    }

    void boot()
    return () => {
      cancelled = true
      window.removeEventListener('unhandledrejection', onUnhandledRejection, { capture: true })
      cleanupRef.current?.()
      cleanupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- CheerpX boot (machine + disk URL only)
  }, [machine, diskHttpUrlProp])

  // ── Error ─────────────────────────────────────────────────────────────────
  if (vmStatus === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8"
        style={{ backdropFilter: 'blur(12px)', background: 'oklch(0.08 0 0 / 70%)' }}
      >
        <div className="glass-card max-w-md rounded-2xl px-8 py-7 text-center flex flex-col items-center gap-4">
          <svg className="h-8 w-8 text-muted-foreground opacity-50" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
            <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div>
            <p className="card-label mb-1.5">Boot Failed</p>
            <p className="mb-3 text-sm text-muted-foreground tracking-wider leading-relaxed">
              {errorMsg || 'An unknown error occurred while starting the virtual machine.'}
            </p>
            <p className="text-xs text-muted-foreground tracking-wider opacity-50">
              Ensure your browser supports WebAssembly and SharedArrayBuffer. Check the browser console for details.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Split layout: canvas + terminal pane (Alpine / GUI machines) ──────────
  if (showSplitLayout) {
    return (
      <div className="flex h-full flex-col bg-[#0a0a0a] overflow-hidden">
        {/* Canvas area */}
        <div
          ref={canvasWrapRef}
          className="relative min-h-0 overflow-hidden"
          style={{ flex: 1, cursor: 'none' }}
          onClick={handleCanvasClick}
        >
          <canvas
            ref={canvasRef}
            tabIndex={0}
            className="h-full w-full outline-none"
            style={{ display: 'block', imageRendering: 'pixelated' }}
          />

          {/* Waiting-for-GUI overlay */}
          {vmStatus === 'ready' && !guiActive && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
              style={{ backdropFilter: 'blur(12px)', background: 'oklch(0.08 0 0 / 70%)' }}
            >
              <div className="glass-card rounded-2xl px-8 py-7 text-center flex flex-col items-center gap-4 max-w-xs w-full mx-4">
                <Spinner size="md" clockwise={true} />
                <div>
                  <p className="card-label mb-1.5">Graphical Environment</p>
                  <p className="text-xs tracking-wider leading-relaxed opacity-70 max-w-[260px] truncate">
                    {bootLine || 'Booting'}<span className="blink-cursor">_</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Brief capture / release pill — centred on the canvas area */}
          {lockNotif && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <span className="glass-card rounded-full px-5 py-2 text-xs tracking-widest text-muted-foreground">
                {lockNotif === 'captured' ? 'mouse captured · ESC to release' : 'mouse released'}
              </span>
            </div>
          )}
        </div>

        {/* Terminal pane */}
        {terminalOpen && (
          <>
            <div
              onMouseDown={onDragStart}
              onTouchStart={onDragStart}
              className="relative shrink-0 h-1 cursor-row-resize group"
              style={{ background: 'oklch(1 0 0 / 6%)' }}
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full mx-auto w-12 bg-white/10 group-hover:bg-white/25 transition-colors duration-150" />
            </div>
            <div
              className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-white/5"
              style={{ background: 'oklch(0.12 0 0)' }}
            >
              <span className="text-xs tracking-widest text-muted-foreground opacity-60">
                tty<span className="blink-cursor">_</span>
              </span>
              <span className="text-xs text-muted-foreground opacity-40 tracking-wider select-none">
                drag to resize
              </span>
            </div>
            <div
              ref={termContainerRef}
              className="shrink-0 overflow-hidden"
              style={{ height: termHeight, padding: '4px 8px' }}
            />
          </>
        )}

        {/* Hidden terminal mount point when pane is closed */}
        {!terminalOpen && <div ref={termContainerRef} className="hidden" />}
      </div>
    )
  }

  // ── Full-screen terminal (Debian CLI) ─────────────────────────────────────
  return (
    <div className="h-full w-full bg-[#0a0a0a] overflow-hidden">
      <div
        ref={termContainerRef}
        className="h-full w-full"
        style={{ padding: '8px' }}
      />
    </div>
  )
}
