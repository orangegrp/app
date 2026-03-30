import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = '332-settings'

interface SettingsState {
  theme: 'dark'
  knownAppVersion: string | null
  suppressInstallPrompt: boolean
  setKnownAppVersion: (version: string) => void
  setSuppressInstallPrompt: (value: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      knownAppVersion: null,
      suppressInstallPrompt: false,
      setKnownAppVersion: (version) => set({ knownAppVersion: version }),
      setSuppressInstallPrompt: (value) => set({ suppressInstallPrompt: value }),
    }),
    { name: STORAGE_KEY }
  )
)

/** Sync read for client gating before Zustand rehydrates (must match persist shape). */
export function getSuppressInstallPromptSync(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as { state?: { suppressInstallPrompt?: boolean } }
    return data.state?.suppressInstallPrompt === true
  } catch {
    return false
  }
}
