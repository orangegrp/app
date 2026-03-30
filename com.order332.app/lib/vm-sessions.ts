import type { MachineId } from '@/lib/webpc-disks'

export interface VMSession {
  id: string
  machineId: MachineId
  /** Auto-generated: "Debian — 26 Mar 2026" */
  label: string
  createdAt: number
  lastUsedAt: number
}

const STORAGE_KEY = 'webpc-sessions'
const IDB_PREFIX = 'cheerpx-session-'

const MACHINE_LABEL_SHORT: Record<MachineId, string> = {
  debian: 'Debian',
  alpine: 'Alpine',
  debianTerminal: 'Debian · 332 terminal',
  debianGui: 'Debian · 332 GUI',
  alpineTerminal: 'Alpine · 332 terminal',
  alpineGui: 'Alpine · 332 GUI',
}

// ── Persistence helpers ───────────────────────────────────────────────────────

function readAll(): VMSession[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as VMSession[]
  } catch {
    return []
  }
}

function writeAll(sessions: VMSession[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getSessions(): VMSession[] {
  return readAll().sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

export function getSession(id: string): VMSession | null {
  return readAll().find((s) => s.id === id) ?? null
}

export function createSession(machineId: MachineId): VMSession {
  const now = Date.now()
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(now)
  const machineName = MACHINE_LABEL_SHORT[machineId]

  const session: VMSession = {
    id: crypto.randomUUID(),
    machineId,
    label: `${machineName} — ${date}`,
    createdAt: now,
    lastUsedAt: now,
  }

  const sessions = readAll()
  sessions.push(session)
  writeAll(sessions)
  return session
}

/** Update lastUsedAt — call on every console page mount. */
export function touchSession(id: string): void {
  const sessions = readAll()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx === -1) return
  sessions[idx].lastUsedAt = Date.now()
  writeAll(sessions)
}

/** Remove session metadata and wipe its IndexedDB store. */
export function deleteSession(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id))
  if (typeof window !== 'undefined') {
    indexedDB.deleteDatabase(IDB_PREFIX + id)
  }
}

/** Returns the IDB database name for a session. */
export function sessionIdbName(id: string): string {
  return IDB_PREFIX + id
}
