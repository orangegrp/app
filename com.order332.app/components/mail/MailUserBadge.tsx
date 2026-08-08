"use client"

import { useAuthStore } from "@/lib/auth-store"

export function MailUserBadge() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  const name = user.displayName ?? user.discordUsername ?? user.id.slice(0, 8)
  const initial = (name[0] ?? "?").toUpperCase()

  return (
    <div className="flex items-center gap-2.5">
      <div className="text-right">
        <p className="text-xs font-medium text-foreground leading-tight">{name}</p>
      </div>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-foreground">
        {initial}
      </div>
    </div>
  )
}
