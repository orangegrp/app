'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useSettingsStore } from '@/lib/settings-store'

const POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

export function useVersionCheck() {
  const { knownAppVersion, setKnownAppVersion } = useSettingsStore()
  const [hasUpdate, setHasUpdate] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version')
      if (!res.ok) return
      const { version } = await res.json() as { version: string }
      if (!knownAppVersion) {
        setKnownAppVersion(version)
        setHasUpdate(false)
        return
      }
      if (version !== knownAppVersion) {
        setHasUpdate(true)
      } else {
        setHasUpdate(false)
      }
    } catch {
      // network error — ignore
    }
  }, [knownAppVersion, setKnownAppVersion])

  useEffect(() => {
    setTimeout(() => void checkVersion(), 0)
    intervalRef.current = setInterval(checkVersion, POLL_INTERVAL_MS)

    const handleFocus = () => void checkVersion()
    window.addEventListener('focus', handleFocus)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('focus', handleFocus)
    }
  }, [checkVersion])

  const confirmUpdate = useCallback(async () => {
    try {
      const res = await fetch('/api/version')
      if (res.ok) {
        const { version } = (await res.json()) as { version: string }
        setKnownAppVersion(version)
      }
    } catch {
      // still reload — next session may sync on first check
    }
    window.location.reload()
  }, [setKnownAppVersion])

  return { hasUpdate, confirmUpdate }
}
