"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/auth-store"
import { fetchAndMergeUserProfile } from "@/lib/fetch-user-profile"
import { isPWAContext } from "@/lib/pwa"
import { purgeMusicCacheForUser } from "@/lib/music-cache"

export function useAuth() {
  const { user, accessToken, isLoading, setAuth, clearAuth, setLoading } =
    useAuthStore()
  const router = useRouter()

  const isAuthed = !!accessToken && !!user

  const tryRefresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPwa: isPWAContext() }),
        credentials: "include",
      })
      if (!res.ok) {
        clearAuth()
        return false
      }
      const { accessToken: token } = (await res.json()) as {
        accessToken: string
      }

      // Decode token payload
      const [, payloadB64] = token.split(".")
      const payload = JSON.parse(
        atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
      ) as {
        sub: string
        permissions: string
        isPwa: boolean
      }
      setAuth(token, {
        id: payload.sub,
        permissions: payload.permissions,
        isPwa: payload.isPwa,
      })
      await fetchAndMergeUserProfile(token)
      return true
    } catch {
      clearAuth()
      return false
    }
  }, [setAuth, clearAuth, setLoading])

  const logout = useCallback(async () => {
    const userId = user?.id ?? null
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // best effort
    }
    if (userId) {
      await purgeMusicCacheForUser(userId).catch(() => {})
    }
    clearAuth()
    router.push("/login")
  }, [clearAuth, router, user?.id])

  return { user, accessToken, isAuthed, isLoading, tryRefresh, logout }
}
