import { create } from "zustand"

export interface AuthUser {
  id: string
  permissions: string // CSV: "app.webpc,app.labs" or "*"
  isPwa: boolean
  discordUsername?: string
  discordAvatar?: string
  displayName?: string | null
  discordId?: string | null
  loginPasskeyEnabled?: boolean
  loginDiscordEnabled?: boolean
  loginMagicEnabled?: boolean
  loginQrEnabled?: boolean
  passkeyCount?: number
  /** False until first-login welcome wizard is completed (from GET /api/me). */
  welcomeWizardCompleted?: boolean
}

interface AuthStore {
  accessToken: string | null
  user: AuthUser | null
  isLoading: boolean

  setAuth: (token: string, user: AuthUser) => void
  mergeAuthUser: (partial: Partial<AuthUser>) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  accessToken: null,
  user: null,
  isLoading: true,

  setAuth: (accessToken, user) => set({ accessToken, user, isLoading: false }),
  mergeAuthUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : null,
    })),
  clearAuth: () => {
    set({ accessToken: null, user: null, isLoading: false })
    if (typeof window !== "undefined") {
      void import("@/lib/music-cache")
        .then(({ purgeAllMusicCache }) => purgeAllMusicCache())
        .catch(() => {})
    }
  },
  setLoading: (isLoading) => set({ isLoading }),
}))
