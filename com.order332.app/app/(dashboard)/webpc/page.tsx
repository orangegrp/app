"use client"

import { useEffect, useState, useCallback } from "react"
import { PageBackground } from "@/components/layout/PageBackground"
import { MachineCard, type MachineConfig } from "@/components/webpc/MachineCard"
import {
  getSessions,
  createSession,
  deleteSession,
  type VMSession,
} from "@/lib/vm-sessions"
import type { MachineId } from "@/lib/webpc-disks"

const OFFICIAL_MACHINES: MachineConfig[] = [
  {
    id: "debian",
    name: "Debian GNU/Linux",
    subtitle: "Terminal · Official",
    type: "CLI",
    description:
      "Full Debian 12 distribution with native development toolchains. Includes gcc, Python, Node.js, vim, git, and much more.",
    tags: ["Debian 12", "Bash", "x86", "Dev tools", "~2 GB"],
    note: "First boot fetches disk blocks on demand — allow 30–60 s.",
  },
  {
    id: "alpine",
    name: "Alpine Linux",
    subtitle: "Graphical Desktop · Official",
    type: "GUI",
    description:
      "Alpine Linux with Xorg and the i3 window manager. A full graphical desktop running entirely in your browser via WebAssembly — no server required.",
    tags: ["Alpine 3.x", "Xorg", "i3 WM", "x86", "~1.5 GB"],
    note: "Graphical boot takes 60–90 s on first load.",
  },
]

const MACHINES_332: MachineConfig[] = []

const MACHINE_META: Record<MachineId, { name: string; type: "CLI" | "GUI" }> = {
  debian: { name: "Debian GNU/Linux", type: "CLI" },
  alpine: { name: "Alpine Linux", type: "GUI" },
  debianTerminal: { name: "Debian Terminal", type: "CLI" },
  debianGui: { name: "Debian GUI", type: "GUI" },
  alpineTerminal: { name: "Alpine Terminal", type: "CLI" },
  alpineGui: { name: "Alpine GUI", type: "GUI" },
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function WebPCPage() {
  const [sessions, setSessions] = useState<VMSession[]>([])

  const refreshSessions = useCallback(() => {
    setSessions(getSessions())
  }, [])

  useEffect(() => {
    setTimeout(() => refreshSessions(), 0)
  }, [refreshSessions])

  function handleLaunch(machineId: MachineId) {
    const session = createSession(machineId)
    // Hard navigation so the console document loads with COEP/COOP (hub /webpc has no isolation headers).
    // router.push() is a SPA navigation — it never applies those response headers.
    window.location.assign(`/webpc/${session.id}/console`)
  }

  function handleResume(session: VMSession) {
    window.location.assign(`/webpc/${session.id}/console`)
  }

  function handleDelete(id: string) {
    deleteSession(id)
    refreshSessions()
  }

  return (
    <div className="page-root relative min-h-screen px-6 pt-8 pb-32 sm:pt-10">
      <PageBackground />
      <div className="relative z-10 mx-auto max-w-4xl">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <p className="section-label">Web PC</p>
        <h2 className="mb-3 text-4xl tracking-widest text-foreground">
          Web PC<span className="blink-cursor">_</span>
        </h2>
        <p className="mb-10 max-w-xl text-sm leading-relaxed tracking-wider text-muted-foreground">
          Pick an environment and press boot — a full Linux machine starts in
          your browser. No installation, no server. Powered by WebAssembly.
        </p>

        {/* ── Mobile performance warning ──────────────────────────────── */}
        <div className="mb-10 flex items-start gap-3 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-5 py-4 backdrop-blur-md sm:hidden">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400/80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="card-label mb-1 text-yellow-400/80">
              Mobile device detected
            </p>
            <p className="text-xs leading-relaxed tracking-wider text-yellow-200/50">
              Web PC runs an x86 virtual machine via WebAssembly. On mobile,
              performance will be significantly slower and some features may not
              work as expected. For the best experience, use a desktop browser.
            </p>
          </div>
        </div>

        {/* ── Official images ─────────────────────────────────────────── */}
        {OFFICIAL_MACHINES.length > 0 && (
          <>
            <p className="section-label mb-3">Official CheerpX</p>
            <div className="mb-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {OFFICIAL_MACHINES.map((m) => (
                <MachineCard
                  key={m.id}
                  machine={m}
                  onLaunch={() => handleLaunch(m.id as MachineId)}
                />
              ))}
            </div>
          </>
        )}

        {/* ── 332 images ────────────────────────────────────────────── */}
        {MACHINES_332.length > 0 && (
          <>
            <p className="section-label mb-3">332</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {MACHINES_332.map((m) => (
                <MachineCard
                  key={m.id}
                  machine={m}
                  onLaunch={() => handleLaunch(m.id as MachineId)}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Sessions ────────────────────────────────────────────────── */}
        {sessions.length > 0 && (
          <div className="mt-12">
            <p className="section-label">Sessions</p>
            <h2 className="mb-6 text-2xl tracking-widest text-foreground">
              Active Sessions<span className="blink-cursor">_</span>
            </h2>

            <div className="flex flex-col gap-3">
              {sessions.map((s) => {
                const meta = MACHINE_META[s.machineId]
                return (
                  <div
                    key={s.id}
                    className="glass-card flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-[oklch(1_0_0_/_4%)]"
                  >
                    {/* Machine type badge */}
                    <span
                      className={[
                        "glass-button shrink-0 rounded-full px-2.5 py-0.5 text-xs tracking-widest",
                        meta?.type === "GUI"
                          ? "text-foreground"
                          : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {meta?.type ?? "CLI"}
                    </span>

                    {/* Label + meta */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm tracking-wider text-foreground">
                        {s.label}
                      </p>
                      <p className="mt-0.5 font-mono text-xs tracking-wider text-muted-foreground opacity-50">
                        {s.id.slice(0, 8)} · last used{" "}
                        {relativeTime(s.lastUsedAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => handleResume(s)}
                        className="glass-button glass-button-glass rounded-lg px-3 py-1.5 text-xs tracking-widest"
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="glass-button glass-button-destructive rounded-lg px-3 py-1.5 text-xs tracking-widest"
                        title="Delete session and wipe its disk"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Footer note ─────────────────────────────────────────────── */}
        <div className="glass-card mt-10 rounded-2xl px-5 py-4">
          <p className="card-label mb-2">How it works</p>
          <p className="text-xs leading-relaxed tracking-wider text-muted-foreground">
            Powered by{" "}
            <a
              href="https://cheerpx.io"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-link"
            >
              CheerpX
            </a>{" "}
            — an x86-to-WebAssembly JIT compiler by Leaning Technologies. The
            disk image is read over HTTP (range requests); only the blocks you
            access are fetched. Each session has its own IndexedDB store so
            changes persist across reloads. Deleting a session permanently wipes
            its disk.
          </p>
        </div>
      </div>
    </div>
  )
}
