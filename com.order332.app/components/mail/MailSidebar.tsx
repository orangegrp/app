"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Inbox, Send, PenSquare } from "lucide-react"
import { openMailComposer } from "@/lib/mail-composer-store"
import { listMailMessages } from "@/lib/mail-api"
import { getCachedMailList } from "@/lib/mail-cache"

function useInboxUnreadCount() {
  const [count, setCount] = useState<number>(() => {
    const cached = getCachedMailList("inbox")
    return cached ? cached.filter((m) => !m.isRead).length : 0
  })

  useEffect(() => {
    const cached = getCachedMailList("inbox")
    if (cached) setCount(cached.filter((m) => !m.isRead).length)

    void listMailMessages("inbox")
      .then((msgs) => setCount(msgs.filter((m) => !m.isRead).length))
      .catch(() => {})
  }, [])

  return count
}

export function MailSidebar() {
  const pathname = usePathname()
  const inboxUnreadCount = useInboxUnreadCount()

  const isInbox = !pathname.startsWith("/mail/sent") && pathname.startsWith("/mail")
  const isSent = pathname.startsWith("/mail/sent")

  const navLinks = [
    { href: "/mail", label: "Inbox", icon: <Inbox size={15} />, active: isInbox, badge: inboxUnreadCount > 0 ? inboxUnreadCount : null },
    { href: "/mail/sent", label: "Sent", icon: <Send size={15} />, active: isSent, badge: null },
  ]

  return (
    <aside className="flex w-[220px] shrink-0 flex-col overflow-y-auto border-r border-white/8 bg-black/20">
      <div className="flex flex-1 flex-col p-3">
        {/* New message */}
        <button
          type="button"
          onClick={() => openMailComposer()}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm font-medium tracking-wide text-foreground transition-colors hover:bg-white/12"
        >
          <PenSquare size={15} />
          New message
        </button>

        {/* Nav links */}
        <nav className="space-y-0.5">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={[
                "flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors",
                link.active
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              ].join(" ")}
            >
              <span className="flex items-center gap-2.5">
                {link.icon}
                {link.label}
              </span>
              {link.badge !== null && (
                <span className="rounded-full bg-white/12 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                  {link.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      {/* Bottom info */}
      <div className="border-t border-white/8 px-4 py-3">
        <p className="text-[11px] text-muted-foreground/50">
          {inboxUnreadCount > 0 ? `${inboxUnreadCount} unread` : "All caught up"}
        </p>
      </div>
    </aside>
  )
}
